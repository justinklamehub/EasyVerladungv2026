---
name: Production deployment gotchas
description: Self-hosted deployment issues specific to COMET LKW on Debian/Apache2
---

## Missing tables not in Drizzle schema

`roles` and `role_permissions` are raw SQL tables — `drizzle-kit push` does NOT create them.
Must be created manually before the API starts (otherwise `seedMissingPermissions()` crashes on boot):

```sql
CREATE TABLE IF NOT EXISTS roles (
  role_key TEXT PRIMARY KEY, label TEXT NOT NULL,
  role_group TEXT NOT NULL DEFAULT '', is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO roles (role_key, label, role_group, is_system) VALUES
  ('comet_leitstand','COMET Leitstand','COMET',true),
  ('comet_lager','COMET Lager','COMET',true),
  ('comet_viewer','COMET Viewer','COMET',true),
  ('speditions_admin','Spedition Admin','Spedition',true),
  ('speditions_bearbeiter','Spedition Bearbeiter','Spedition',true),
  ('speditions_viewer','Spedition Viewer','Spedition',true)
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL, permission TEXT NOT NULL, allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (role, permission)
);
```

## COOKIE_SECURE must be true for HTTPS

Set `COOKIE_SECURE=true` in `.env` when running behind HTTPS reverse proxy.
Without it, session cookies won't be sent back by the browser on HTTPS-only.
Apache must also set `RequestHeader set X-Forwarded-Proto "https"` (requires `a2enmod headers`).

## PM2 does not reload .env on restart

`pm2 restart` keeps old env vars cached. Must use `pm2 restart --update-env` or
`pm2 delete` + `export $(grep -v '^#' .env | xargs)` + `pm2 start ...` to pick up changes.

## IP vs Domain access

Direct IP access is HTTP-only (no SSL cert for IP). With `COOKIE_SECURE=true` cookies don't work over HTTP.
Fix: redirect all IP traffic to HTTPS domain in Apache `000-default.conf`:
```apache
<VirtualHost *:80>
  RewriteEngine On
  RewriteRule ^ https://www.easyverladung.de%{REQUEST_URI} [R=301,L]
</VirtualHost>
```

**Why:** Mixing HTTP (IP) and HTTPS (domain) breaks Secure-flagged session cookies.
**How to apply:** Always configure IP→domain redirect when COOKIE_SECURE is enabled.
