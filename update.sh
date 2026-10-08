#!/usr/bin/env bash
# COMET_SAFE_UPDATE_V1
set -Eeuo pipefail
umask 022

APP="${COMET_APP_DIR:-/opt/comet/app}"
if [[ $EUID -eq 0 ]]; then
  exec sudo -u comet env COMET_APP_DIR="$APP" bash "$0" "$@"
fi
cd "$APP"
JOB="${1:-update-$(date +%s)-$$}"
[[ "$JOB" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
if [[ "${COMET_ENV_LOADED:-0}" != 1 ]]; then
  node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node.js 22 oder neuer erforderlich.");process.exit(1)}'
  exec node "$APP/tools/operations/run-update.mjs" "$JOB"
fi
export COMET_UPDATE_PID=$$
OPS="$APP/.comet-operations"
mkdir -p "$OPS"
chmod 700 "$OPS"
if [[ "${COMET_UPDATE_LOCK_HELD:-0}" != 1 ]]; then
  exec 9>"$OPS/update.lock"
  flock -n 9 || { echo "Ein Update läuft bereits."; exit 73; }
fi
STATE="$APP/tools/operations/update-state.mjs"
PHASE=prepare
STAGE=""
API_SWAP=""
FRONT_SWAP=""
PROMOTED_API=0
PROMOTED_FRONT=0
RESTARTED=0
PM2_NAME="${COMET_PM2_NAME:-comet-api}"

state() { PHASE="$1"; node "$STATE" running "$JOB" "$PHASE" "$2"; echo "==> $2"; }
exchange() { python3 "$APP/tools/operations/swap.py" "$1" "$2"; }
failed() {
  local code=$?
  trap - ERR INT TERM
  set +e
  local rollback=0
  if [[ -n "$FRONT_SWAP" && "$(readlink "$APP/artifacts/comet-lkw/dist")" == "$STAGE/artifacts/comet-lkw/dist" ]]; then
    exchange "$FRONT_SWAP" "$APP/artifacts/comet-lkw/dist" || rollback=1
  fi
  if [[ -n "$API_SWAP" && "$(readlink "$APP/artifacts/api-server/dist")" == "$STAGE/artifacts/api-server/dist" ]]; then
    exchange "$API_SWAP" "$APP/artifacts/api-server/dist" || rollback=1
  fi
  if [[ $RESTARTED == 1 ]]; then
    env -u COMET_UPDATE_PID -u COMET_UPDATE_LOCK_HELD -u COMET_ENV_LOADED pm2 restart "$PM2_NAME" --update-env >/dev/null 2>&1 || rollback=1
    local healthy=0
    for _ in {1..20}; do
      if curl -fsS --max-time 2 "$HEALTH" >/dev/null; then healthy=1; break; fi
      sleep 1
    done
    [[ $healthy == 1 ]] || rollback=1
  fi
  local message="Update in Phase $PHASE fehlgeschlagen. Vorherige Dateien beibehalten beziehungsweise zurückgenommen; Datenbank nicht zurückgesetzt."
  if [[ $rollback == 1 ]]; then message="Update und automatische Rückkehr fehlgeschlagen. Dienst und öffentliche Auslieferung manuell prüfen; Datenbank nicht zurückgesetzt."; fi
  local recovery=preserved
  if [[ $rollback == 1 ]]; then recovery=failed; fi
  node "$STATE" failed "$JOB" "$PHASE" "$message" "$recovery"
  exit "${code:-1}"
}
trap failed ERR
trap 'false' INT TERM
node "$STATE" queued "$JOB"

state prepare "Voraussetzungen prüfen; laufende Dateien bleiben unverändert."
for command in git pnpm node python3 flock pm2 curl pg_dump pg_restore; do command -v "$command" >/dev/null; done
node "$APP/tools/operations/verify-backup.mjs" --check-tools
export PORT="${PORT:-3333}" NODE_ENV=production
HEALTH="${COMET_HEALTH_URL:-http://127.0.0.1:$PORT/api/healthz}"
PUBLIC="${COMET_PUBLIC_URL:?Öffentliche App-URL für die Auslieferungsprüfung konfigurieren.}"
node -e 'for(const v of process.argv.slice(1)){const u=new URL(v);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)process.exit(1)}' "$HEALTH" "$PUBLIC"
pm2 describe "$PM2_NAME" >/dev/null
[[ -z "$(git status --porcelain --untracked-files=no)" ]] # Never overwrite local tracked changes.
[[ -e "$APP/artifacts/api-server/dist" && -e "$APP/artifacts/comet-lkw/dist" ]]

state fetch "Neue Version in einem getrennten Release-Verzeichnis vorbereiten."
git fetch origin "${COMET_UPDATE_BRANCH:-main}"
REVISION="$(git rev-parse FETCH_HEAD)"
RELEASES="${COMET_RELEASE_DIR:-$(dirname "$APP")/releases}"
mkdir -p "$RELEASES"
STAGE="$(mktemp -d "$RELEASES/release-XXXXXXXX")"
chmod 755 "$STAGE"
git archive "$REVISION" | tar -x -C "$STAGE"
state dependencies "Abhängigkeiten nur für die vorbereitete Version installieren."
node "$APP/tools/operations/update-command.mjs" "$JOB" "$PHASE" pnpm --dir "$STAGE" install --frozen-lockfile
state backend "Backend getrennt bauen und Syntax prüfen."
pnpm --dir "$STAGE" --filter @workspace/api-server run build
node --check "$STAGE/artifacts/api-server/dist/index.mjs"
state frontend "Frontend getrennt bauen und alle Einstiegsskripte und Styles prüfen."
PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --dir "$STAGE" --filter @workspace/comet-lkw run build
node "$APP/tools/operations/validate-frontend.mjs" "$STAGE/artifacts/comet-lkw/dist/public"
# Retain hashed assets required by browsers still using the previous index.
if [[ -d "$APP/artifacts/comet-lkw/dist/public/assets" ]]; then
  cp -an "$APP/artifacts/comet-lkw/dist/public/assets/." "$STAGE/artifacts/comet-lkw/dist/public/assets/"
fi
chmod -R a+rX "$STAGE/artifacts/comet-lkw/dist"

state backup "Datenbank und Bilder vor der Übernahme gemeinsam sichern."
BACKUPS="${COMET_BACKUP_DIR:-$(dirname "$APP")/backups}"
BACKUP="$BACKUPS/comet-$JOB"
export COMET_APP_DIR="$APP"
node "$APP/tools/operations/backup.mjs" "$BACKUP"
state restore "Sicherung in einer isolierten Prüfdatenbank und Bildablage wiederherstellen."
node "$APP/tools/operations/verify-backup.mjs" "$BACKUP"

state promote "Geprüftes Backend übernehmen und nur den eigenen API-Dienst neu starten."
API_SWAP="$APP/artifacts/api-server/.dist-$JOB"
FRONT_SWAP="$APP/artifacts/comet-lkw/.dist-$JOB"
ln -s "$STAGE/artifacts/api-server/dist" "$API_SWAP"
exchange "$API_SWAP" "$APP/artifacts/api-server/dist"
PROMOTED_API=1
RESTARTED=1
env -u COMET_UPDATE_PID -u COMET_UPDATE_LOCK_HELD -u COMET_ENV_LOADED pm2 restart "$PM2_NAME" --update-env
READY=0
for _ in {1..30}; do
  if curl -fsS --max-time 2 "$HEALTH" >/dev/null; then READY=1; break; fi
  sleep 1
done
[[ $READY == 1 ]]
state delivery "Frontend ohne fehlenden Dateipfad übernehmen und öffentliche Auslieferung prüfen."
ln -s "$STAGE/artifacts/comet-lkw/dist" "$FRONT_SWAP"
exchange "$FRONT_SWAP" "$APP/artifacts/comet-lkw/dist"
PROMOTED_FRONT=1
curl -fsS --max-time 15 "$PUBLIC" -o "$OPS/public-check.html"
cmp -s "$OPS/public-check.html" "$STAGE/artifacts/comet-lkw/dist/public/index.html"
node "$APP/tools/operations/check-public-assets.mjs" "$PUBLIC" "$OPS/public-check.html"
state finalize "Geprüften Quellstand übernehmen; Sicherung und vorherige Builds bleiben erhalten."
[[ -z "$(git status --porcelain --untracked-files=no)" ]]
git merge --ff-only "$REVISION"
pm2 save
node "$STATE" done "$JOB" complete "Update, API-Prüfung, öffentliche Frontend-Prüfung und isolierte Wiederherstellungsprobe erfolgreich."
echo "==> Fertig. Vorherige Version und Sicherung bleiben erhalten."
