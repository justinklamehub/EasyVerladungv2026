#!/bin/bash
set -e

APP="/opt/comet/app"

echo "==> Eigentuemer korrigieren..."
chown -R comet:comet "$APP"

echo "==> Git pull..."
sudo -u comet git -C "$APP" pull origin main

echo "==> Abhaengigkeiten aktualisieren..."
sudo -u comet pnpm --dir "$APP" install --frozen-lockfile

echo "==> Datenbankschema synchronisieren (neue Tabellen/Spalten hinzufuegen)..."
sudo -u comet bash -c "
  set -a
  source /opt/comet/app/artifacts/api-server/.env
  set +a
  pnpm --filter @workspace/db --dir \"$APP\" push-force
"

echo "==> Backend bauen..."
sudo -u comet pnpm --filter @workspace/api-server --dir "$APP" run build

echo "==> Frontend bauen..."
PORT=3000 NODE_ENV=production BASE_PATH="/" pnpm --filter @workspace/comet-lkw --dir "$APP" run build

echo "==> Rechte setzen..."
chmod -R o+rX "$APP/artifacts/comet-lkw/dist/public"

echo "==> Node-Berechtigungen sicherstellen..."
# Stellt sicher, dass der comet-User den Node-Binary ausfuehren darf.
# Kann nach System-Updates oder bei erstmaliger Einrichtung fehlen.
NODE_BIN="$(which node 2>/dev/null || echo /usr/local/bin/node)"
chmod +x "$NODE_BIN" 2>/dev/null || true

# PM2-Heimverzeichnis anlegen und Rechte setzen
mkdir -p /opt/comet/.pm2/logs /opt/comet/.pm2/pids
chown -R comet:comet /opt/comet/.pm2

echo "==> Backend neu starten..."
sudo -u comet bash -c '
  set -a
  source /opt/comet/app/artifacts/api-server/.env
  export PORT=3333
  if pm2 describe comet-api > /dev/null 2>&1; then
    pm2 restart comet-api --update-env
  else
    pm2 start /opt/comet/app/artifacts/api-server/dist/index.mjs --name comet-api
  fi
  pm2 save
'

echo "==> Fertig!"
sudo -u comet pm2 status
