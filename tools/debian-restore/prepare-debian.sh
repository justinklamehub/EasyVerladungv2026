#!/usr/bin/env bash
# Run only on a NEW, dedicated Debian 12 amd64 server.
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Mit sudo ausführen."; exit 1; }
[[ ${1:-} == --confirm-new-server ]] || {
  echo "Nur neuer Server: sudo bash prepare-debian.sh --confirm-new-server"; exit 1;
}
[[ -f /etc/debian_version && -d /run/systemd/system && ! -e /opt/comet ]] || {
  echo "Kein neues Debian-Ziel. Abbruch."; exit 1;
}
# This preparation is intentionally not a shared-server provisioning tool.
if command -v ss >/dev/null && ss -ltnH | awk '{print $4}' | grep -Eq ':(80|443|3333|8080)$'; then
  echo "Ein Web-/App-Port ist schon belegt. Bestehende Dienste werden nicht verändert."; exit 1;
fi
[[ $(dpkg --print-architecture) == amd64 ]] || { echo "Offline-Archiv benötigt amd64."; exit 1; }
# /etc/os-release is a trusted system file, NOT the user's server.env.
. /etc/os-release
[[ ${ID} == debian && ${VERSION_ID} == 12 ]] || { echo "Debian 12 erforderlich."; exit 1; }
[[ ! -e /etc/apt/sources.list.d/comet-pgdg.sources && ! -e /etc/apt/sources.list.d/comet-node.sources ]] || {
  echo "Paketquellen existieren bereits. Abbruch statt Überschreibung."; exit 1;
}
apt-get update
apt-get install -y ca-certificates curl gnupg python3 sudo apache2 build-essential git
install -d -m 755 /etc/apt/keyrings
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
curl --fail --show-error --silent https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$temp/pg.asc"
curl --fail --show-error --silent https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$temp/node.asc"
gpg --batch --dearmor -o /etc/apt/keyrings/comet-pgdg.gpg "$temp/pg.asc"
gpg --batch --dearmor -o /etc/apt/keyrings/comet-node.gpg "$temp/node.asc"
chmod 644 /etc/apt/keyrings/comet-*.gpg
cat > /etc/apt/sources.list.d/comet-pgdg.sources <<EOF
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: ${VERSION_CODENAME}-pgdg
Components: main
Signed-By: /etc/apt/keyrings/comet-pgdg.gpg
EOF
cat > /etc/apt/sources.list.d/comet-node.sources <<'EOF'
Types: deb
URIs: https://deb.nodesource.com/node_24.x
Suites: nodistro
Components: main
Signed-By: /etc/apt/keyrings/comet-node.gpg
EOF
apt-get update
apt-get install -y nodejs postgresql-18 postgresql-client-18
systemctl enable --now postgresql apache2
echo "Systempakete installiert. Nun install.py ausführen."
