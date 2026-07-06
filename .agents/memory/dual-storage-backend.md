---
name: Dual storage backend (GCS/local)
description: Why COMET LKW's object storage supports both Replit App Storage (GCS) and a local-disk backend, and when each applies.
---

The api-server's object storage service supports two backends: `"gcs"` (default, unchanged) or `"local"`. Configurable two ways: via the admin Settings UI (Speicher tab, DB-backed, takes priority) or via `STORAGE_BACKEND`/`LOCAL_STORAGE_DIR` env vars (fallback, used if DB has no value or DB is unreachable). DB values are cached in-process for ~5s to avoid a query per request.

**Why:** Replit App Storage (GCS) works by talking to a Replit sidecar (`127.0.0.1:1106`) that only exists inside Replit's own infrastructure (dev workspace or a Replit Deployment). This project is also run on a self-hosted external server (easyverladung.de) that is NOT a Replit deployment, so the sidecar is unreachable there and any GCS call throws. The user explicitly chose to store photos directly on their own server's disk, and later asked to configure this via the web UI instead of editing `.env` on the server (self-hosted admins can't easily edit files there).

**How to apply:**
- Never set `storage_backend=local` (DB setting) or `STORAGE_BACKEND=local` (env var) in this Replit workspace — it would break the working GCS flow used for Replit dev/preview and Replit Deployments. Local backend is exclusively for the user's own external server.
- Because config is resolved dynamically per-request (not cached for the process lifetime), `ObjectStorageService` methods that touch backend/dir (`getPublicObjectSearchPaths`, `getPrivateObjectDir`, `normalizeObjectEntityPath`, etc.) are all `async` — remember to `await` them at call sites.
- The response schema for the upload-URL endpoint requires a fully-qualified URL (zod `.url()`), mirroring GCS's presigned URL shape — so the local backend's upload URL must be resolved against the incoming request's own origin (`req.protocol` + `req.get("host")`), not returned as a bare relative path.
- ACL policy functions (`trySetObjectEntityAclPolicy`, `canAccessObjectEntity`) are GCS-only and are never actually called from any route in this codebase — safe to leave as no-ops on the local backend.
