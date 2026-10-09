#!/usr/bin/env python3
"""Fresh-server restore only. Never connects to the backed-up DATABASE_URL."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import time

BASE = pathlib.Path("/opt/comet")
APP = BASE / "app"
FILES = ("comet_lkw.dump", "easy-verladung-code.tar.gz",
         "easy-verladung-offline.tar.gz", "easy-verladung-pictures.tar.gz",
         "easy-verladung-server.env")
SERVICE = pathlib.Path("/etc/systemd/system/comet-api.service")
SITE = pathlib.Path("/etc/apache2/sites-available/comet-restore.conf")
LISTEN = pathlib.Path("/etc/apache2/conf-available/comet-restore-listen.conf")
PG = pathlib.Path("/usr/lib/postgresql/18/bin")
LOG = None


def fail(message):
    raise RuntimeError(message)


def run(args, *, cwd=None, input=None, capture=False, env=None):
    # Output is private: SQL errors / package logs can contain confidential data.
    process = subprocess.run(
        list(map(str, args)), cwd=cwd, input=input, text=True,
        stdout=subprocess.PIPE if capture else LOG,
        stderr=LOG, env=env or clean_env(), check=False)
    if process.returncode:
        fail("Ein Arbeitsschritt ist fehlgeschlagen. Details nur im privaten Installationsprotokoll.")
    return process.stdout if capture else ""


def clean_env():
    return {"PATH": "/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root",
            "LANG": "C.UTF-8", "DEBIAN_FRONTEND": "noninteractive"}


def pg(sql, capture=False):
    return run(["sudo", "-H", "-u", "postgres", PG / "psql",
                "-X", "-h", "/var/run/postgresql", "-p", "5432",
                "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
               input=sql, capture=capture)


def members(archive):
    """Allow only regular files/directories and internal relative symlinks."""
    items = archive.getmembers()
    seen = set()
    links = set()
    for item in items:
        name = pathlib.PurePosixPath(item.name)
        if name.is_absolute() or ".." in name.parts:
            fail("Unsicherer Archivpfad; Archiv wird nicht entpackt.")
        if str(name) in seen:
            fail("Doppelter Archivpfad; Archiv wird nicht entpackt.")
        seen.add(str(name))
        if item.isdir() or item.isfile():
            continue
        if not item.issym():
            fail("Archiv enthält einen nicht unterstützten Dateityp.")
        link = pathlib.PurePosixPath(item.linkname)
        # Resolve .. lexically; never accept links escaping their extraction root.
        if link.is_absolute():
            fail("Absoluter Archiv-Symlink ist nicht erlaubt.")
        parts = list(name.parent.parts)
        for part in link.parts:
            if part == "..":
                if not parts:
                    fail("Archiv-Symlink verlässt das Zielverzeichnis.")
                parts.pop()
            elif part != ".":
                parts.append(part)
        links.add(str(name))
    for item in items:
        if any(str(parent) in links for parent in pathlib.PurePosixPath(item.name).parents):
            fail("Archiv schreibt durch einen Symlink.")
    return items


def extract(source, target):
    target.mkdir(mode=0o700)
    with tarfile.open(source, "r:gz") as archive:
        items = members(archive)
        # Validated above; ownership and setuid bits from tar are deliberately ignored.
        for item in items:
            destination = target / item.name
            if item.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                destination.chmod(0o755)
            elif item.isfile():
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(item) as reader, destination.open("xb") as writer:
                    shutil.copyfileobj(reader, writer)
                destination.chmod(0o755 if item.mode & 0o111 else 0o644)
        for item in items:
            if item.issym():
                destination = target / item.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.symlink_to(item.linkname)


def inspect_backups(folder):
    for name in FILES:
        file = folder / name
        if not file.is_file() or file.is_symlink() or file.stat().st_size == 0:
            fail("Eine der fünf erforderlichen Sicherungsdateien fehlt oder ist leer.")
    # Do not read the server.env here. Only the local target Node will load it.
    with (folder / FILES[0]).open("rb") as file:
        if file.read(5) != b"PGDMP":
            fail("Der Dump ist kein PostgreSQL-Custom-Dump. Kein Import versucht.")
    for name in FILES[1:4]:
        with tarfile.open(folder / name, "r:gz") as archive:
            members(archive)
    with tarfile.open(folder / FILES[1], "r:gz") as code, \
            tarfile.open(folder / FILES[2], "r:gz") as offline:
        for name in ("pnpm-lock.yaml", "pnpm-workspace.yaml"):
            a = code.extractfile(name).read()
            b = offline.extractfile(name).read()
            if hashlib.sha256(a).digest() != hashlib.sha256(b).digest():
                fail("Code und Offline-Pakete haben unterschiedliche Lock-/Workspace-Dateien.")
        for name in ("package.json", "artifacts/api-server/src/index.ts",
                     "artifacts/comet-lkw/package.json"):
            code.getmember(name)
        offline.getmember("pnpm-10.26.1.tgz")
        source = code.extractfile("artifacts/api-server/src/index.ts").read().decode()
        harden(source)  # Ensure known source shape before touching the server.
    with tarfile.open(folder / FILES[3], "r:gz") as pictures:
        names = [pathlib.PurePosixPath(m.name).parts for m in pictures.getmembers()]
        if not names or any(p[0] != "pictures" for p in names if p):
            fail("Das Bilderarchiv muss den Ordner pictures/ enthalten.")
        if not any(p[:2] == ("pictures", "uploads") for p in names):
            fail("pictures/uploads/ fehlt im Bilderarchiv.")


def harden(source):
    if "httpServer.listen(port, async" in source:
        source = source.replace(
            "httpServer.listen(port, async",
            'httpServer.listen({ port, host: process.env.HOST || "127.0.0.1" }, async', 1)
    elif "process.env.HOST" not in source:
        fail("Unbekannte API-Listener-Struktur. Keine automatische Änderung versucht.")
    pattern = r"(?m)^(\s*)startScheduler\(io\);"
    if not re.search(pattern, source):
        fail("Unbekannte Scheduler-Struktur. Keine automatische Änderung versucht.")
    return re.sub(pattern,
                  r'\1if (process.env.DISABLE_SCHEDULER !== "true") startScheduler(io);',
                  source, count=1)


def local_port_free(port):
    with socket.socket() as listener:
        try:
            listener.bind(("0.0.0.0", port))
        except OSError:
            fail(f"Port {port} ist bereits belegt.")


def preflight():
    if os.geteuid() != 0:
        fail("Bitte ausschließlich mit sudo auf dem NEUEN Server ausführen.")
    release = pathlib.Path("/etc/os-release").read_text()
    if not re.search(r'^ID="?debian"?$', release, re.M) or not re.search(
            r'^VERSION_ID="?12"?$', release, re.M) or not pathlib.Path("/run/systemd/system").exists():
        fail("Ein laufender Debian-12-Server mit systemd wird benötigt.")
    if BASE.exists() or SERVICE.exists() or SITE.exists() or LISTEN.exists():
        fail("COMET-Zielverzeichnis oder Konfiguration existiert bereits. Keine Überschreibung.")
    if run(["dpkg", "--print-architecture"], capture=True).strip() != "amd64":
        fail("Das gesicherte Offline-Paket benötigt einen amd64-Server.")
    if subprocess.run(["getent", "passwd", "comet"], stdout=subprocess.DEVNULL).returncode == 0:
        fail("Benutzer comet existiert bereits. Dieses Paket ist nur für Neuinstallationen.")
    if not PG.joinpath("pg_restore").exists():
        fail("PostgreSQL 18 fehlt. Zuerst prepare-debian.sh ausführen.")
    if pg("SELECT current_setting('server_version_num')::int / 10000;", True).strip() != "18":
        fail("Port 5432 gehört nicht PostgreSQL 18. Keine andere Datenbankinstanz verändern.")
    node = shutil.which("node", path=clean_env()["PATH"])
    if not node or int(run([node, "-p", "process.versions.node.split('.')[0]"], capture=True)) != 24:
        fail("Node.js 24 fehlt. Zuerst prepare-debian.sh ausführen.")
    for command in ("apache2ctl", "curl", "sudo", "systemctl"):
        if not shutil.which(command, path="/usr/sbin:/usr/local/bin:/usr/bin:/bin"):
            fail("Eine Systemvoraussetzung fehlt. Zuerst prepare-debian.sh ausführen.")
    if pg("SELECT 1 FROM pg_database WHERE datname='comet_lkw';", True).strip():
        fail("Datenbank comet_lkw existiert bereits. Sie wird NICHT verändert.")
    if pg("SELECT 1 FROM pg_roles WHERE rolname='comet_app';", True).strip():
        fail("Datenbankrolle comet_app existiert bereits. Sie wird NICHT verändert.")
    for port in (3333, 8080):
        local_port_free(port)
    return node


def private_write(file, content, mode=0o600):
    with file.open("x") as writer:
        writer.write(content)
    file.chmod(mode)


def as_comet(args, *, cwd=APP, extra=None, capture=False):
    environment = {"PATH": f"{BASE}/bin:/usr/local/bin:/usr/bin:/bin",
                   "HOME": str(BASE), "LANG": "C.UTF-8"}
    environment.update(extra or {})
    return run(["sudo", "-H", "-u", "comet", "env", "-i",
                *[f"{key}={value}" for key, value in environment.items()], *args],
               cwd=cwd, capture=capture)


def install(folder, node):
    BASE.mkdir(mode=0o755)
    (BASE / "install").mkdir(mode=0o700)
    for name in ("code", "offline", "pictures"):
        archive = folder / f"easy-verladung-{name}.tar.gz"
        extract(archive, BASE / "install" / name)
    code = BASE / "install" / "code"
    offline = BASE / "install" / "offline"
    code.rename(APP)
    APP.chmod(0o755)  # Apache must traverse the app root to its public build.
    original = APP / "artifacts/api-server/src/index.ts"
    shutil.copy2(original, BASE / "install" / "index.original.ts")
    original.write_text(harden(original.read_text()))
    # Offline pnpm from the supplied archive; do not replace global package managers.
    extract(offline / "pnpm-10.26.1.tgz", BASE / "pnpm")
    (BASE / "bin").mkdir()
    private_write(BASE / "bin/pnpm",
                  f'#!/bin/sh\nexec "{node}" "{BASE}/pnpm/package/bin/pnpm.cjs" "$@"\n', 0o755)
    run(["useradd", "--system", "--user-group", "--home-dir", BASE,
         "--no-create-home", "--shell", "/usr/sbin/nologin", "comet"])
    run(["chown", "comet:comet", BASE])
    (APP / ".comet-operations").mkdir(mode=0o700, exist_ok=True)
    for name, mode in (("backups", 0o700), ("releases", 0o755), ("logs", 0o700)):
        (BASE / name).mkdir(mode=mode)
    # No backed-up secrets or machine-specific env files are accepted as build inputs.
    for file in APP.rglob(".env*"):
        if file.is_file() or file.is_symlink():
            file.unlink()
    run(["chown", "-R", "comet:comet", APP, BASE / "pnpm",
         offline, BASE / "backups", BASE / "releases", BASE / "logs"])
    run(["chmod", "755", BASE / "install"])
    as_comet(["pnpm", "install", "--offline", "--frozen-lockfile",
              "--store-dir", offline / "pnpm-store"])
    as_comet(["pnpm", "--filter", "@workspace/comet-lkw", "run", "build"],
             extra={"PORT": "3000", "BASE_PATH": "/", "NODE_ENV": "production"})
    as_comet(["pnpm", "--filter", "@workspace/api-server", "run", "build"])
    for file in ("artifacts/api-server/dist/index.mjs",
                 "artifacts/comet-lkw/dist/public/index.html"):
        if not (APP / file).is_file():
            fail("Ein erwartetes Build-Ergebnis fehlt.")
    # New random credentials only. No connection to any URL from server.env.
    password = secrets.token_hex(32)
    pg(f"CREATE ROLE comet_app LOGIN PASSWORD '{password}';\n")
    pg("CREATE DATABASE comet_lkw OWNER comet_app;\n")
    # stdin avoids opening an inaccessible backup directory as postgres.
    with (folder / FILES[0]).open("rb") as dump:
        result = subprocess.run(
            ["sudo", "-H", "-u", "postgres", str(PG / "pg_restore"),
             "--host=/var/run/postgresql", "--port=5432", "--dbname=comet_lkw",
             "--role=comet_app", "--no-owner", "--no-privileges",
             "--exit-on-error", "--single-transaction"],
            stdin=dump, stdout=LOG, stderr=LOG, env=clean_env())
        if result.returncode:
            fail("Datenbank-Restore fehlgeschlagen. Keine App gestartet; private Logs prüfen.")
    sql = (
        "SELECT CASE WHEN to_regclass('public.settings') IS NOT NULL "
        "AND to_regclass('public.roles') IS NOT NULL "
        "AND to_regclass('public.role_permissions') IS NOT NULL THEN 'ok' END;"
    )
    result = run(["sudo", "-H", "-u", "postgres", PG / "psql", "-X",
                  "-h", "/var/run/postgresql", "-p", "5432", "-d", "comet_lkw",
                  "-v", "ON_ERROR_STOP=1", "-At"], input=sql, capture=True)
    if result.strip() != "ok":
        fail("Der Dump enthält nicht die erwarteten COMET-Tabellen. Kein Schema-Push versucht.")
    # Deliberate target-only remap: protects the host from arbitrary backed-up storage paths.
    pictures = BASE / "storage-data"
    (BASE / "install/pictures/pictures").rename(pictures)
    run(["chown", "-R", "comet:comet", pictures])
    run(["chmod", "700", pictures])
    run(["sudo", "-H", "-u", "postgres", PG / "psql", "-X",
         "-h", "/var/run/postgresql", "-p", "5432", "-d", "comet_lkw",
         "-v", "ON_ERROR_STOP=1"], input=(
             "BEGIN;\n"
             "INSERT INTO settings(key,value) VALUES "
             "('storage_backend','local'),('storage_local_path','/opt/comet/storage-data') "
             "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;\nCOMMIT;\n"))
    helper = pathlib.Path(__file__).with_name("target-config.cjs")
    # Node reads the backed-up .env only locally; never source it as shell code.
    envfile = APP / "artifacts/api-server/.env"
    run([node, helper, folder / FILES[4], envfile],
        input=json.dumps({"database": f"postgresql://comet_app:{password}@127.0.0.1:5432/comet_lkw"}))
    run(["chown", "root:comet", envfile])
    run(["chmod", "640", envfile])
    private_write(SERVICE, f"""[Unit]
Description=COMET restore - local test instance
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=comet
Group=comet
WorkingDirectory=/opt/comet/app
Environment=PATH=/opt/comet/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=/opt/comet
ExecStart={node} --env-file=/opt/comet/app/artifacts/api-server/.env --enable-source-maps /opt/comet/app/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
""", 0o644)
    private_write(LISTEN, "Listen 127.0.0.1:8080\n", 0o644)
    template = pathlib.Path(__file__).with_name("apache-local.conf").read_text()
    private_write(SITE, template, 0o644)
    run(["/usr/sbin/a2enmod", "proxy", "proxy_http", "proxy_wstunnel", "rewrite", "headers"])
    run(["/usr/sbin/a2enconf", "comet-restore-listen"])
    run(["/usr/sbin/a2ensite", "comet-restore"])
    run(["/usr/sbin/apache2ctl", "configtest"])
    run(["systemd-analyze", "verify", SERVICE])
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "--now", "comet-api.service"])
    healthy = False
    for _ in range(40):
        probe = subprocess.run(["curl", "--fail", "--silent", "--max-time", "2",
                                "http://127.0.0.1:3333/api/healthz"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if probe.returncode == 0:
            healthy = True
            break
        time.sleep(2)
    if not healthy:
        run(["systemctl", "stop", "comet-api.service"])
        fail("API wurde nicht gesund. Dienst gestoppt; keine öffentliche Freigabe.")
    run(["systemctl", "reload", "apache2"])
    run(["curl", "--fail", "--silent", "http://127.0.0.1:8080/"])
    run(["curl", "--fail", "--silent", "http://127.0.0.1:8080/api/healthz"])
    print("Lokale Installation erfolgreich. SSH-Tunnel verwenden; Anleitung beachten.")
    print("Hintergrundjobs deaktiviert. Alte Instanz / DNS wurden nicht verändert.")


def main():
    global LOG
    parser = argparse.ArgumentParser(description="Nur NEUER Debian-Server; kein Überschreiben.")
    parser.add_argument("--backup-dir", default="/srv/comet-restore")
    parser.add_argument("--check-only", action="store_true",
                        help="Nur Archivstruktur prüfen; keine env-Inhalte lesen.")
    parser.add_argument("--confirm-new-server", action="store_true")
    args = parser.parse_args()
    try:
        folder = pathlib.Path(args.backup_dir).resolve(strict=True)
        inspect_backups(folder)
        if args.check_only:
            print("Archivstruktur, Custom-Dump-Kennung und Paketdateien passen. Keine Änderungen.")
            return
        if not args.confirm_new_server:
            fail("Installation benötigt --confirm-new-server; nur auf einem neuen Zielserver.")
        if os.geteuid() != 0:
            fail("Installation mit sudo starten.")
        # flock protects against two simultaneous installs; no destructive retry.
        import fcntl
        lock = open("/run/lock/comet-debian-restore.lock", "w")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path = pathlib.Path("/var/log") / f"comet-restore-{time.strftime('%Y%m%d-%H%M%S')}.log"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        LOG = os.fdopen(fd, "w")
        node = preflight()
        # Parse archive using the correct version, before creating role/database.
        run([PG / "pg_restore", "--list", folder / FILES[0]])
        print("Voraussetzungen geprüft. Installation nur auf diesem Server wird gestartet.")
        install(folder, node)
    except RuntimeError as error:
        print(f"Abbruch: {error}", file=sys.stderr)
        print("Keine automatische Löschung. Private Logs: /var/log/comet-restore-*.log.", file=sys.stderr)
        sys.exit(1)
    except (Exception, KeyboardInterrupt):
        # No exception repr / stack trace: paths and connection details stay private.
        print("Abbruch. Keine automatische Löschung oder Rücknahme von Daten.", file=sys.stderr)
        print("Voraussetzungen/Dateinamen prüfen; private Logs unter /var/log/comet-restore-*.log.", file=sys.stderr)
        sys.exit(1)
    finally:
        if LOG:
            LOG.close()


if __name__ == "__main__":
    main()
