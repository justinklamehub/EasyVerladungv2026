---
name: Dual storage backend (GCS/local)
description: Why COMET LKW's object storage supports both Replit App Storage (GCS) and a local-disk backend, and when each applies.
---

The api-server's object storage service supports two backends, selected via `STORAGE_BACKEND` env var: `"gcs"` (default, unchanged) or `"local"`.

**Why:** Replit App Storage (GCS) works by talking to a Replit sidecar (`127.0.0.1:1106`) that only exists inside Replit's own infrastructure (dev workspace or a Replit Deployment). This project is also run on a self-hosted external server (easyverladung.de) that is NOT a Replit deployment, so the sidecar is unreachable there and any GCS call throws. The user explicitly chose to store photos directly on their own server's disk rather than publish via Replit Deployments or move to S3/cloud storage.

**How to apply:**
- Never set `STORAGE_BACKEND=local` in this Replit workspace's own env — it would break the working GCS flow used for Replit dev/preview and Replit Deployments. It is exclusively for the user's own external server's `.env` file (loaded relative to the compiled `dist/index.mjs`, i.e. `artifacts/api-server/.env`), which Replit's environment-secrets tooling cannot manage since that server is outside Replit.
- The response schema for the upload-URL endpoint requires a fully-qualified URL (zod `.url()`), mirroring GCS's presigned URL shape — so the local backend's upload URL must be resolved against the incoming request's own origin (`req.protocol` + `req.get("host")`), not returned as a bare relative path.
- ACL policy functions (`trySetObjectEntityAclPolicy`, `canAccessObjectEntity`) are GCS-only and are never actually called from any route in this codebase — safe to leave as no-ops on the local backend.
