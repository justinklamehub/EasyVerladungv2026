import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  can,
  invalidatePermissionsCache,
  getRolePermissionsMatrix,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
} from "../lib/permissions";

const router = Router();

function onlyAdmin(req: any, res: any): boolean {
  if (req.session.role !== "comet_admin") {
    res.status(403).json({ error: "Nur COMET Admin kann Berechtigungen verwalten" });
    return false;
  }
  return true;
}

// ── Permissions matrix ────────────────────────────────────────────────────────

router.get("/admin/permissions", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const [matrixResult, rolesResult] = await Promise.all([
      getRolePermissionsMatrix(),
      db.execute(sql`SELECT role_key, label, role_group, is_system FROM roles ORDER BY is_system DESC, role_group, label`),
    ]);
    const roles = (rolesResult.rows as any[]).map((r) => ({
      roleKey: r.role_key,
      label: r.label,
      roleGroup: r.role_group,
      isSystem: Boolean(r.is_system),
    }));
    return res.json({
      matrix: matrixResult,
      permissions: ALL_PERMISSIONS,
      roles,
      permissionLabels: PERMISSION_LABELS,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/permissions", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const { role, permission, allowed } = req.body;
    if (!role || !permission || typeof allowed !== "boolean") {
      return res.status(400).json({ error: "role, permission und allowed sind erforderlich" });
    }
    if (!ALL_PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: "Ungültige Berechtigung" });
    }
    // validate role exists
    const roleRow = await db.execute(sql`SELECT 1 FROM roles WHERE role_key = ${role}`);
    if (roleRow.rows.length === 0) {
      return res.status(400).json({ error: "Ungültige Rolle" });
    }

    await db.execute(
      sql`INSERT INTO role_permissions (role, permission, allowed, updated_at)
          VALUES (${role}, ${permission}, ${allowed}, NOW())
          ON CONFLICT (role, permission) DO UPDATE SET allowed = ${allowed}, updated_at = NOW()`
    );
    invalidatePermissionsCache();
    return res.json({ ok: true, role, permission, allowed });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Roles CRUD ────────────────────────────────────────────────────────────────

router.get("/admin/roles", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const result = await db.execute(
      sql`SELECT role_key, label, role_group, is_system, created_at FROM roles ORDER BY is_system DESC, role_group, label`
    );
    return res.json(
      (result.rows as any[]).map((r) => ({
        roleKey: r.role_key,
        label: r.label,
        roleGroup: r.role_group,
        isSystem: Boolean(r.is_system),
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/roles", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const { roleKey, label, roleGroup } = req.body;

    if (!roleKey?.trim() || !label?.trim() || !roleGroup?.trim()) {
      return res.status(400).json({ error: "roleKey, label und roleGroup sind erforderlich" });
    }
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(roleKey)) {
      return res.status(400).json({ error: "roleKey: Kleinbuchstaben, Ziffern und _ erlaubt (2–40 Zeichen, beginnt mit Buchstabe)" });
    }

    // Insert role
    await db.execute(
      sql`INSERT INTO roles (role_key, label, role_group, is_system) VALUES (${roleKey}, ${label.trim()}, ${roleGroup.trim()}, false)`
    );

    // Pre-populate permissions (all false)
    for (const perm of ALL_PERMISSIONS) {
      await db.execute(
        sql`INSERT INTO role_permissions (role, permission, allowed) VALUES (${roleKey}, ${perm}, false) ON CONFLICT DO NOTHING`
      );
    }

    invalidatePermissionsCache();

    return res.status(201).json({ roleKey, label: label.trim(), roleGroup: roleGroup.trim(), isSystem: false });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Ein roleKey mit diesem Namen existiert bereits" });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/roles/:key", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const key = req.params.key;
    const { label, roleGroup } = req.body;

    if (!label?.trim() && !roleGroup?.trim()) {
      return res.status(400).json({ error: "Nichts zu aktualisieren" });
    }

    const existing = await db.execute(sql`SELECT label, role_group FROM roles WHERE role_key = ${key}`);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Rolle nicht gefunden" });

    const newLabel = label?.trim() ?? (existing.rows[0] as any).label;
    const newGroup = roleGroup?.trim() ?? (existing.rows[0] as any).role_group;

    await db.execute(
      sql`UPDATE roles SET label = ${newLabel}, role_group = ${newGroup} WHERE role_key = ${key}`
    );

    return res.json({ ok: true, roleKey: key, label: newLabel, roleGroup: newGroup });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/roles/:key", requireAuth, async (req, res) => {
  try {
    if (!onlyAdmin(req, res)) return;
    const key = req.params.key;

    // Must not be system role
    const roleRow = await db.execute(sql`SELECT is_system FROM roles WHERE role_key = ${key}`);
    if (roleRow.rows.length === 0) return res.status(404).json({ error: "Rolle nicht gefunden" });
    if ((roleRow.rows[0] as any).is_system) {
      return res.status(400).json({ error: "Systemrollen können nicht gelöscht werden" });
    }

    // Must have no users with this role
    const userCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM users WHERE role = ${key}`);
    const cnt = Number((userCount.rows[0] as any).cnt);
    if (cnt > 0) {
      return res.status(400).json({ error: `Es gibt noch ${cnt} Benutzer mit dieser Rolle. Bitte zuerst die Benutzer umstellen.` });
    }

    await db.execute(sql`DELETE FROM role_permissions WHERE role = ${key}`);
    await db.execute(sql`DELETE FROM roles WHERE role_key = ${key}`);
    invalidatePermissionsCache();

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
