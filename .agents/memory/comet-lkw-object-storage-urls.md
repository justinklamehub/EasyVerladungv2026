---
name: COMET LKW object storage image URLs
description: How to construct viewable image URLs from stored objectPath values in COMET LKW.
---

Stored `objectPath` values (from the upload flow) look like `/objects/<entityId>`. To render them as `<img src>`, strip the leading `/objects` and prepend the storage serving route: `${API_BASE}/storage/objects${objectPath.replace(/^\/objects/, "")}`.

**Why:** The backend serves private objects at `GET /storage/objects/*path`, which maps the wildcard back onto `/objects/<wildcard>` internally — so the client must NOT include the `/objects` segment twice.

**How to apply:** Any feature that stores an `objectPath` (e.g. shipment photos) and needs to display the image should use this URL construction pattern consistently across gallery pages and detail views.
