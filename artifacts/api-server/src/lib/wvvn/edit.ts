import type { PoolClient } from "@workspace/db";
import type { WvvnSessionEdit, WvvnSessionDeletion } from "@workspace/api-zod";
import { articles, audit, quantityPieces, resolveArticle, sessionDetail, WvvnError } from "./model";

/** Caller owns the module transaction and has checked its action-specific permission. */
async function completedSession(c: PoolClient, sessionId: number, body: WvvnSessionDeletion) {
  const original = (await c.query("SELECT * FROM wvvn_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows[0];
  if (!original || original.deleted_at) throw new WvvnError("Liste nicht gefunden.", 404);
  if (original.status !== "done")
    throw new WvvnError("Nur abgeschlossene Listen können hier bearbeitet oder gelöscht werden.", 409);
  if (original.revision !== body.revision) throw new WvvnError("Liste wurde inzwischen geändert. Bitte neu laden und Änderungen erneut prüfen.", 409);
  if (!body.reason.trim() || body.reason.trim().length < 3) throw new WvvnError("Bitte einen nachvollziehbaren Änderungsgrund angeben.");
  if (original.report_id != null) {
    const report = (await c.query("SELECT status FROM wvvn_reports WHERE id=$1", [original.report_id])).rows[0];
    if (report?.status !== "sent") throw new WvvnError("Diese Liste ist einem noch nicht abschließend geklärten Versand zugeordnet. Bericht zuerst prüfen; die Versanddatei darf nicht unbemerkt veralten.", 409);
     if (!body.acknowledgeReported) throw new WvvnError("Bitte bestätigen: Der bereits versandte Bericht bleibt unverändert. Die Änderung wird nicht automatisch erneut versendet.", 409);
  }
}

/** Only authenticated permission-checked callers may invoke this correction path. */
export async function editCompletedSession(c: PoolClient, sessionId: number, body: WvvnSessionEdit, actor: string) {
  await completedSession(c, sessionId, body);
  const before = await sessionDetail(c, sessionId);
  const existing = new Map(before.items.map((i) => [i.id, i]));
  const retained = new Set<number>();
  const master = await articles(c);
  // Validate the entire replacement before changing any item.
  const changes = body.items.map((i) => {
    if (i.id != null) {
      if (!Number.isSafeInteger(i.id) || !existing.has(i.id) || retained.has(i.id) || i.code != null)
        throw new WvvnError("Ungültige, doppelte oder fremde Position.");
      retained.add(i.id);
      const old = existing.get(i.id)!;
      return { id: i.id, quantity: i.quantity, pieces: quantityPieces(i.quantity, old.veFactor, old.unit) };
    }
    if (!i.code?.trim()) throw new WvvnError("Bei neuen Positionen ist ein Artikelcode erforderlich.");
    const code = i.code.trim().replace(/\s/g, "");
    const found = resolveArticle(master, code, false);
    return { code, quantity: i.quantity, pieces: quantityPieces(i.quantity, found.article.veFactor, found.unit), found };
  });
  for (const change of changes) {
    if (change.id != null) {
      await c.query("UPDATE wvvn_items SET quantity=$1,pieces=$2 WHERE id=$3", [change.quantity, change.pieces, change.id]);
    } else {
      const { article, unit } = change.found!;
      await c.query(`INSERT INTO wvvn_items(session_id,article_number,article_name,scanned_code,unit,quantity,ve_factor,pieces,input_method)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual')`,
      [sessionId, article.number, article.name, change.code, unit, change.quantity, article.veFactor, change.pieces]);
    }
  }
  const removed = before.items.filter((i) => !retained.has(i.id)).map((i) => i.id);
  if (removed.length) await c.query("UPDATE wvvn_items SET deleted_at=now() WHERE id=ANY($1::integer[])", [removed]);
  await c.query("UPDATE wvvn_sessions SET mode=$1,netto=$2,kware=$3,revision=revision+1 WHERE id=$4",
    [body.mode, body.netto, body.kware, sessionId]);
  const after = await sessionDetail(c, sessionId);
  await c.query(`INSERT INTO wvvn_revisions(session_id,revision,actor,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)`,
    [sessionId, after.revision, actor, body.reason.trim(), JSON.stringify(before), JSON.stringify(after)]);
  await audit(c, actor, "Abgeschlossene Liste korrigiert",
    `#${sessionId}, Stand ${after.revision}, ${before.pieces} → ${after.pieces} Stück. Grund: ${body.reason.trim()}${after.reported ? " Bereits versandter Bericht bleibt unverändert; keine automatische erneute Meldung." : ""}`);
  return after;
}

export async function deleteCompletedSession(c: PoolClient, sessionId: number, body: WvvnSessionDeletion, actor: string) {
  await completedSession(c, sessionId, body);
  const before = await sessionDetail(c, sessionId);
  const result = await c.query("UPDATE wvvn_sessions SET deleted_at=now(),revision=revision+1 WHERE id=$1 RETURNING revision,deleted_at", [sessionId]);
  const { revision, deleted_at } = result.rows[0];
  await c.query(`INSERT INTO wvvn_revisions(session_id,revision,actor,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6)`,
    [sessionId, revision, actor, body.reason.trim(), JSON.stringify(before), JSON.stringify({ ...before, revision, deleted: true, deletedAt: deleted_at })]);
  await audit(c, actor, "Abgeschlossene Liste gelöscht",
    `#${sessionId}, Stand ${revision}, ${before.itemCount} Positionen, ${before.pieces} Stück. Grund: ${body.reason.trim()}${before.reported ? " Bereits versandter Bericht bleibt unverändert; keine automatische erneute Meldung." : ""}`);
}
