#!/usr/bin/env python3
"""Separate opt-in HTTPS activation; no DNS changes, no scheduler activation."""
import argparse
import importlib.util
import os
import pathlib
import re
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("restore_install", HERE / "install.py")
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", required=True)
    parser.add_argument("--certificate", required=True, help="Local fullchain.pem path")
    parser.add_argument("--key", required=True, help="Local privkey.pem path")
    args = parser.parse_args()
    site = pathlib.Path("/etc/apache2/sites-available/comet-https.conf")
    envfile = restore.APP / "artifacts/api-server/.env"
    envbackup = restore.BASE / f"install/env-before-https-{time.strftime('%Y%m%d-%H%M%S')}"
    try:
        if os.geteuid() != 0:
            restore.fail("Mit sudo auf dem neuen Server ausführen.")
        if not re.fullmatch(r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}", args.domain):
            restore.fail("Eine gültige Domain ohne Schema/Pfad wird benötigt.")
        if site.exists() or not restore.SERVICE.exists() or not envfile.is_file():
            restore.fail("Neue COMET-Installation fehlt oder HTTPS-Konfiguration existiert bereits.")
        paths = []
        for value in (args.certificate, args.key):
            path = pathlib.Path(value).resolve(strict=True)
            if not re.fullmatch(r"/[A-Za-z0-9_./-]+", str(path)) or not path.is_file():
                restore.fail("Zertifikatspfad muss eine vorhandene absolute Datei ohne Leerzeichen sein.")
            paths.append(path)
        log = pathlib.Path("/var/log") / f"comet-https-{time.strftime('%Y%m%d-%H%M%S')}.log"
        restore.LOG = os.fdopen(os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w")
        certificate, key = paths
        restore.run(["openssl", "x509", "-in", certificate, "-noout", "-checkhost", args.domain])
        existing = restore.run(["/usr/sbin/apache2ctl", "-S"], capture=True)
        if re.search(r"\b" + re.escape(args.domain) + r"\b", existing):
            restore.fail("Diese Domain ist schon in Apache konfiguriert. Keine Änderung versucht.")
        # Always copy the old config privately before editing it locally.
        restore.run(["cp", envfile, envbackup])
        envbackup.chmod(0o600)
        target = f"""<VirtualHost *:80>
    ServerName {args.domain}
    Redirect temporary / https://{args.domain}/
</VirtualHost>
<VirtualHost *:443>
    ServerName {args.domain}
    SSLEngine on
    SSLCertificateFile {certificate}
    SSLCertificateKeyFile {key}
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    DocumentRoot /opt/comet/app/artifacts/comet-lkw/dist/public
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass /api/socket.io/ http://127.0.0.1:3333/api/socket.io/ upgrade=websocket
    ProxyPassReverse /api/socket.io/ http://127.0.0.1:3333/api/socket.io/
    ProxyPass /api/ http://127.0.0.1:3333/api/
    ProxyPassReverse /api/ http://127.0.0.1:3333/api/
    ErrorLog ${{APACHE_LOG_DIR}}/comet-https-error.log
    CustomLog ${{APACHE_LOG_DIR}}/comet-https-access.log combined
    <Directory /opt/comet/app/artifacts/comet-lkw/dist/public>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        RewriteEngine On
        RewriteCond %{{REQUEST_FILENAME}} !-f
        RewriteCond %{{REQUEST_FILENAME}} !-d
        RewriteRule . /index.html [L]
        <FilesMatch "^(index\\.html|sw\\.js|build-info\\.json|manifest\\.json)$">
            Header always set Cache-Control "no-store, no-cache, must-revalidate"
        </FilesMatch>
    </Directory>
</VirtualHost>
"""
        restore.private_write(site, target, 0o644)
        restore.run(["/usr/sbin/a2enmod", "ssl", "headers", "proxy", "proxy_http",
                     "proxy_wstunnel", "rewrite"])
        restore.run(["/usr/sbin/a2ensite", "comet-https"])
        restore.run(["/usr/sbin/apache2ctl", "configtest"])
        # No shell evaluation / output of the protected env file.
        updater = (
            'const fs=require("node:fs"); const p=process.argv[1]; '
            'let s=fs.readFileSync(p,"utf8"); '
            's=s.replace(/^COOKIE_SECURE=.*$/m,"COOKIE_SECURE=\\\'true\\\'"); '
            's=s.replace(/^COMET_PUBLIC_URL=.*$/m,'
            '"COMET_PUBLIC_URL=\\\'https://"+process.argv[2]+"/\\\'"); '
            'fs.writeFileSync(p,s,{mode:0o640});'
        )
        restore.run(["node", "-e", updater, envfile, args.domain])
        restore.run(["systemctl", "restart", "comet-api.service"])
        restore.run(["systemctl", "reload", "apache2"])
        healthy = False
        for _ in range(30):
            result = subprocess.run(
                ["curl", "--fail", "--silent", "--max-time", "3",
                 "--resolve", f"{args.domain}:443:127.0.0.1",
                 f"https://{args.domain}/api/healthz"],
                stdout=subprocess.DEVNULL, stderr=restore.LOG)
            if result.returncode == 0:
                healthy = True
                break
            time.sleep(2)
        if not healthy:
            restore.fail("HTTPS-Prüfung fehlgeschlagen. Private Logs prüfen; DNS unverändert.")
        print("HTTPS geprüft. DNS unverändert; DISABLE_SCHEDULER bleibt true.")
    except Exception:
        # Return only this installer-owned configuration to its earlier local state.
        if restore.LOG:
            subprocess.run(["/usr/sbin/a2dissite", "comet-https"],
                           stdout=restore.LOG, stderr=restore.LOG)
            if envbackup.exists():
                subprocess.run(["cp", envbackup, envfile], stdout=restore.LOG, stderr=restore.LOG)
                os.chmod(envfile, 0o640)
                subprocess.run(["systemctl", "restart", "comet-api.service"],
                               stdout=restore.LOG, stderr=restore.LOG)
            subprocess.run(["/usr/sbin/apache2ctl", "configtest"], stdout=restore.LOG, stderr=restore.LOG)
            subprocess.run(["systemctl", "reload", "apache2"], stdout=restore.LOG, stderr=restore.LOG)
        print("HTTPS nicht freigegeben. Voraussetzungen/Zertifikat und private Logs prüfen.", file=sys.stderr)
        sys.exit(1)
    finally:
        if restore.LOG:
            restore.LOG.close()


if __name__ == "__main__":
    main()
