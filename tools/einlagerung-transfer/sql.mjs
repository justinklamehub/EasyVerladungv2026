import { validate } from "./model.mjs";

// PostgreSQL-only export for administrators using pgAdmin/DBeaver instead of Node.
export function renderSQL(pack, { restore = false, confirmed = false } = {}) {
  const p = validate(pack);
  const tag = `comet_data_${pack.sha256}`;
  const json = JSON.stringify(p);
  if (json.includes(`$${tag}$`)) throw new Error("Ungültige SQL-Datenbegrenzung.");
  const source = restore ? `SELECT payload INTO source FROM einlagerung_transfer_sicherungen WHERE id = 0;
  IF source IS NULL THEN RAISE EXCEPTION 'Sicherungs-ID 0 durch die gewünschte ID ersetzen.'; END IF;` :
    `source := $${tag}$${json}$${tag}$::jsonb;`;
  return `-- COMET: ${restore ? "vorherigen Einlagerungsstand wiederherstellen" : "vollständigen Einlagerungsstand übernehmen"}
-- Datenstand: ${p.exportedAt}
-- Nur in der richtigen PRODUKTIV-Datenbank mit aktueller COMET-Version ausführen.
-- ERSETZT die komplette Einlagerung, NICHT Benutzer, Verladungen oder Palettenkonten.
-- Sicherung wird vorher in einlagerung_transfer_sicherungen angelegt.
-- Sicherheitsbestätigung unten von FALSE auf TRUE ändern, erst nach Prüfung.
-- Bei Fehlern: ROLLBACK; ausführen, falls das SQL-Programm die Transaktion offen lässt.
BEGIN;
SET LOCAL lock_timeout = '15s';
DO $comet_transfer$
DECLARE
  bestaetigt boolean := ${confirmed ? "TRUE" : "FALSE"};
  source jsonb;
  r jsonb;
  v_data jsonb;
  field text;
  fields text[];
  target_id integer;
  matches integer[];
  backup_id bigint;
BEGIN
  IF NOT bestaetigt THEN
    RAISE EXCEPTION 'Keine Daten geändert. Zum vollständigen Austausch der Einlagerung bestaetigt := TRUE setzen.';
  END IF;
  PERFORM pg_advisory_xact_lock(736291);
  LOCK TABLE einlagerung_records, einlagerung_datasets, einlagerung_events, settings IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE speditionen IN SHARE MODE;
  ${source}
  CREATE TEMP TABLE comet_local_ids(source_id integer PRIMARY KEY, target_id integer NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE comet_carrier_ids(source_id integer PRIMARY KEY, target_id integer NOT NULL) ON COMMIT DROP;
  -- Ausschließlich vorhandene globale Speditionen eindeutig zuordnen.
  FOR r IN SELECT value FROM jsonb_array_elements(source->'carriers') LOOP
    SELECT array_agg(id) INTO matches FROM speditionen
      WHERE btrim(r->>'kuerzel') <> '' AND lower(btrim(kuerzel)) = lower(btrim(r->>'kuerzel'));
    IF coalesce(cardinality(matches), 0) = 0 THEN
      SELECT array_agg(id) INTO matches FROM speditionen
        WHERE lower(btrim(name)) = lower(btrim(r->>'name'));
    END IF;
    IF coalesce(cardinality(matches), 0) <> 1 THEN
      RAISE EXCEPTION 'Spedition % (%) nicht eindeutig vorhanden. Zuerst im Zielsystem anlegen/abgleichen. Keine Daten geändert.',
        r->>'kuerzel', r->>'name';
    END IF;
    INSERT INTO comet_carrier_ids VALUES((r->>'id')::integer, matches[1]);
  END LOOP;
  CREATE TABLE IF NOT EXISTS einlagerung_transfer_sicherungen(
    id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    payload jsonb NOT NULL
  );
  INSERT INTO einlagerung_transfer_sicherungen(payload)
  SELECT jsonb_build_object(
    'exportedAt', clock_timestamp(),
    'records', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM
      (SELECT id,kind,data,updated_at FROM einlagerung_records) t), '[]'::jsonb),
    'datasets', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM
      (SELECT id,type,filename,rows,row_count,imported_by,imported_at FROM einlagerung_datasets) t), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM
      (SELECT id,username,action,detail,created_at FROM einlagerung_events) t), '[]'::jsonb),
    'settings', (SELECT value FROM settings WHERE key='einlagerung_settings'),
    'carriers', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM
      (SELECT id,name,kuerzel FROM speditionen WHERE id IN (
        SELECT (data->>'speditionId')::integer FROM einlagerung_records
        WHERE kind IN ('carrier','reservation') AND data->>'speditionId' IS NOT NULL
      )) t), '[]'::jsonb)
  ) RETURNING id INTO backup_id;
  DELETE FROM einlagerung_records;
  DELETE FROM einlagerung_datasets;
  DELETE FROM einlagerung_events;
  -- Neue IDs vermeiden Konflikte; Referenzen werden anschließend umgeschrieben.
  FOR r IN SELECT value FROM jsonb_array_elements(source->'records') LOOP
    INSERT INTO einlagerung_records(kind,data,updated_at)
    VALUES(r->>'kind', r->'data', (r->>'updated_at')::timestamptz)
    RETURNING id INTO target_id;
    INSERT INTO comet_local_ids VALUES((r->>'id')::integer, target_id);
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(source->'records') LOOP
    v_data := r->'data';
    fields := CASE r->>'kind'
      WHEN 'aisle' THEN ARRAY['hallId']
      WHEN 'shelf' THEN ARRAY['aisleId']
      WHEN 'rule' THEN ARRAY['articleId','shelfId','groupId']
      WHEN 'reservation' THEN ARRAY['shelfId','carrierId']
      ELSE ARRAY[]::text[] END;
    FOREACH field IN ARRAY fields LOOP
      IF v_data->>field IS NOT NULL THEN
        SELECT m.target_id INTO target_id FROM comet_local_ids m WHERE m.source_id = (v_data->>field)::integer;
        IF NOT FOUND THEN RAISE EXCEPTION 'Ungültige interne Referenz: %', field; END IF;
        v_data := jsonb_set(v_data, ARRAY[field], to_jsonb(target_id));
      END IF;
    END LOOP;
    IF r->>'kind' IN ('carrier','reservation') AND v_data->>'speditionId' IS NOT NULL THEN
      SELECT m.target_id INTO target_id FROM comet_carrier_ids m WHERE m.source_id = (v_data->>'speditionId')::integer;
      IF NOT FOUND THEN RAISE EXCEPTION 'Speditionszuordnung fehlt.'; END IF;
      v_data := jsonb_set(v_data, ARRAY['speditionId'], to_jsonb(target_id));
    END IF;
    UPDATE einlagerung_records t SET data = v_data
    WHERE t.id = (SELECT m.target_id FROM comet_local_ids m WHERE m.source_id = (r->>'id')::integer);
  END LOOP;
  INSERT INTO einlagerung_datasets(type,filename,rows,row_count,imported_by,imported_at)
  SELECT t.type,t.filename,t.rows,t.row_count,t.imported_by,t.imported_at
  FROM jsonb_to_recordset(source->'datasets')
    AS t(type text,filename text,rows jsonb,row_count integer,imported_by text,imported_at timestamptz);
  INSERT INTO einlagerung_events(username,action,detail,created_at)
  SELECT t.username,t.action,t.detail,t.created_at
  FROM jsonb_to_recordset(source->'events')
    AS t(username text,action text,detail text,created_at timestamptz);
  IF source->>'settings' IS NULL THEN
    DELETE FROM settings WHERE key='einlagerung_settings';
  ELSE
    INSERT INTO settings(key,value) VALUES('einlagerung_settings',source->>'settings')
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
  END IF;
  RAISE NOTICE 'Einlagerung übernommen. Vorheriger Stand in Sicherung ID %.', backup_id;
END $comet_transfer$;
COMMIT;
SELECT id,created_at,
  jsonb_array_length(payload->'records') AS stammdatensaetze,
  jsonb_array_length(payload->'datasets') AS importstaende
FROM einlagerung_transfer_sicherungen ORDER BY id DESC LIMIT 5;
`;
}
