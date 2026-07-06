import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { db, settingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const LOCAL_UPLOAD_URL_PREFIX = "/api/storage/local-uploads/";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * A resolved object handle, abstracting over the two supported storage
 * backends:
 * - "gcs": Replit App Storage (Google Cloud Storage via the Replit sidecar).
 *   Only works when running on Replit (dev or a Replit deployment).
 * - "local": Plain files on the local disk of the server the app runs on.
 *   Used when self-hosting outside of Replit, where the Replit sidecar
 *   (and therefore Replit App Storage) is not reachable.
 */
export type ObjectHandle =
  | { kind: "gcs"; file: File }
  | { kind: "local"; filePath: string };

type StorageBackend = "gcs" | "local";

interface StorageConfig {
  backend: StorageBackend;
  localDir: string;
}

let cachedStorageConfig: (StorageConfig & { expiresAt: number }) | null = null;
const STORAGE_CONFIG_CACHE_MS = 5000;

/**
 * Resolves the storage backend/localDir. DB-backed settings (configurable via
 * the admin Settings UI) take priority; falls back to STORAGE_BACKEND /
 * LOCAL_STORAGE_DIR env vars for backward compatibility. Result is cached
 * briefly to avoid a DB round-trip on every request.
 */
async function loadStorageConfig(): Promise<StorageConfig> {
  const now = Date.now();
  if (cachedStorageConfig && cachedStorageConfig.expiresAt > now) {
    return cachedStorageConfig;
  }

  let backend: StorageBackend = process.env.STORAGE_BACKEND === "local" ? "local" : "gcs";
  let localDir = process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), "storage-data");

  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(inArray(settingsTable.key, ["storage_backend", "storage_local_path"]));
    for (const row of rows) {
      if (row.key === "storage_backend" && (row.value === "local" || row.value === "gcs")) {
        backend = row.value;
      }
      if (row.key === "storage_local_path" && row.value && row.value.trim()) {
        localDir = row.value.trim();
      }
    }
  } catch {
    // DB unreachable or settings table not migrated yet — silently fall
    // back to env vars so the app keeps working.
  }

  cachedStorageConfig = { backend, localDir, expiresAt: now + STORAGE_CONFIG_CACHE_MS };
  return cachedStorageConfig;
}

export class ObjectStorageService {
  async getPublicObjectSearchPaths(): Promise<Array<string>> {
    const { backend, localDir } = await loadStorageConfig();
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      if (backend === "local") {
        return ["public"];
      }
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  async getPrivateObjectDir(): Promise<string> {
    const { backend, localDir } = await loadStorageConfig();
    if (backend === "local") {
      return path.join(localDir, "uploads");
    }
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<ObjectHandle | null> {
    const { backend, localDir } = await loadStorageConfig();
    if (backend === "local") {
      for (const searchPath of await this.getPublicObjectSearchPaths()) {
        const fullPath = path.join(localDir, searchPath, filePath);
        if (fs.existsSync(fullPath)) {
          return { kind: "local", filePath: fullPath };
        }
      }
      return null;
    }

    for (const searchPath of await this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return { kind: "gcs", file };
      }
    }

    return null;
  }

  async downloadObject(handle: ObjectHandle, cacheTtlSec: number = 3600): Promise<Response> {
    if (handle.kind === "local") {
      if (!fs.existsSync(handle.filePath)) {
        throw new ObjectNotFoundError();
      }
      const stat = await fs.promises.stat(handle.filePath);
      const contentType = await this.readLocalContentType(handle.filePath);
      const nodeStream = fs.createReadStream(handle.filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
          "Content-Length": String(stat.size),
        },
      });
    }

    const { file } = handle;
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(baseUrl?: string): Promise<string> {
    const { backend } = await loadStorageConfig();
    if (backend === "local") {
      const objectId = randomUUID();
      const relativePath = `${LOCAL_UPLOAD_URL_PREFIX}${objectId}`;
      // The response schema requires a fully-qualified URL (mirroring the
      // presigned GCS URL shape), so resolve against the incoming request's
      // own origin — this works both behind a reverse proxy and directly.
      return baseUrl ? new URL(relativePath, baseUrl).toString() : relativePath;
    }

    const privateObjectDir = await this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  /**
   * Persists an upload sent to PUT /storage/local-uploads/:objectId to disk.
   * Only relevant when running with STORAGE_BACKEND=local.
   */
  async saveLocalUpload(objectId: string, data: Buffer, contentType: string): Promise<void> {
    const { localDir } = await loadStorageConfig();
    const dir = path.join(localDir, "uploads");
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, objectId), data);
    await fs.promises.writeFile(
      path.join(dir, `${objectId}.meta.json`),
      JSON.stringify({ contentType })
    );
  }

  private async readLocalContentType(filePath: string): Promise<string> {
    try {
      const raw = await fs.promises.readFile(`${filePath}.meta.json`, "utf-8");
      const meta = JSON.parse(raw) as { contentType?: string };
      return meta.contentType || "application/octet-stream";
    } catch {
      return "application/octet-stream";
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<ObjectHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");

    const { backend, localDir } = await loadStorageConfig();
    if (backend === "local") {
      const filePath = path.join(localDir, "uploads", entityId);
      if (!fs.existsSync(filePath)) {
        throw new ObjectNotFoundError();
      }
      return { kind: "local", filePath };
    }

    let entityDir = await this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return { kind: "gcs", file: objectFile };
  }

  async normalizeObjectEntityPath(rawPath: string): Promise<string> {
    if (rawPath.includes(LOCAL_UPLOAD_URL_PREFIX)) {
      const idx = rawPath.indexOf(LOCAL_UPLOAD_URL_PREFIX);
      return `/objects/${rawPath.slice(idx + LOCAL_UPLOAD_URL_PREFIX.length)}`;
    }

    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = await this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = await this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const handle = await this.getObjectEntityFile(normalizedPath);
    if (handle.kind === "local") {
      // ACL policies are a GCS-only concept in this codebase; local storage
      // has no equivalent yet since nothing currently relies on it.
      return normalizedPath;
    }
    await setObjectAclPolicy(handle.file, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}
