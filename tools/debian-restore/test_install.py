#!/usr/bin/env python3
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import tarfile
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("installer", HERE / "install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def archive(file, entries):
    with tarfile.open(file, "w:gz") as handle:
        for name, data, kind in entries:
            item = tarfile.TarInfo(name)
            if kind == "link":
                item.type = tarfile.SYMTYPE
                item.linkname = data
                handle.addfile(item)
            elif kind == "hard":
                item.type = tarfile.LNKTYPE
                item.linkname = data
                handle.addfile(item)
            elif kind == "dir":
                item.type = tarfile.DIRTYPE
                handle.addfile(item)
            else:
                payload = data.encode()
                item.size = len(payload)
                item.mode = 0o4755
                handle.addfile(item, io.BytesIO(payload))


class RestoreTests(unittest.TestCase):
    def test_parent_traversal_rejected(self):
        self.reject([("../outside", "x", "file")])

    def test_absolute_path_rejected(self):
        self.reject([("/etc/anything", "x", "file")])

    def test_external_symlink_rejected(self):
        self.reject([("link", "../../outside", "link")])

    def test_symlink_parent_rejected(self):
        self.reject([("link", "dir", "link"), ("link/a", "x", "file")])

    def test_hardlink_rejected(self):
        self.reject([("a", "b", "hard")])

    def test_duplicate_path_rejected(self):
        self.reject([("a", "x", "file"), ("a", "y", "file")])

    def reject(self, entries):
        with tempfile.TemporaryDirectory() as temp:
            file = pathlib.Path(temp) / "input.tar.gz"
            archive(file, entries)
            with tarfile.open(file) as handle, self.assertRaises(RuntimeError):
                installer.members(handle)

    def test_safe_extract_preserves_bytes_not_setuid(self):
        with tempfile.TemporaryDirectory() as temp:
            file = pathlib.Path(temp) / "input.tar.gz"
            archive(file, [("pictures", "", "dir"),
                           ("pictures/uploads/image", "sample", "file")])
            target = pathlib.Path(temp) / "target"
            installer.extract(file, target)
            image = target / "pictures/uploads/image"
            self.assertEqual(image.read_text(), "sample")
            self.assertFalse(image.stat().st_mode & 0o4000)

    def test_harden_old_source(self):
        source = "httpServer.listen(port, async (err) => {\n  startScheduler(io);\n});"
        patched = installer.harden(source)
        self.assertIn('host: process.env.HOST || "127.0.0.1"', patched)
        self.assertIn('process.env.DISABLE_SCHEDULER !== "true"', patched)

    def test_unknown_source_rejected(self):
        with self.assertRaises(RuntimeError):
            installer.harden("server.listen(3333)")

    def test_clean_environment_has_no_database(self):
        self.assertNotIn("DATABASE_URL", installer.clean_env())
        self.assertNotIn("PGPASSWORD", installer.clean_env())
        self.assertIn("/usr/sbin", installer.clean_env()["PATH"].split(":"))

    def test_existing_app_blocks_before_any_database_query(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp, \
                patch.object(installer, "BASE", pathlib.Path(temp)), \
                patch.object(installer.os, "geteuid", return_value=0), \
                patch.object(installer, "pg") as query:
            with self.assertRaises(RuntimeError):
                installer.preflight()
            query.assert_not_called()

    def test_config_roundtrip_overrides_connections_without_stdout(self):
        with tempfile.TemporaryDirectory() as temp:
            source = pathlib.Path(temp) / "source.env"
            target = pathlib.Path(temp) / "target.env"
            source.write_text(
                "DATABASE_URL='postgresql://old.invalid/never-connect'\n"
                "SESSION_SECRET='old-synthetic'\nHOST='0.0.0.0'\n"
                "DISABLE_SCHEDULER='false'\nNODE_OPTIONS='--bad-option'\n"
                "SMTP_PASSWORD='synthetic # value with \"quote\" and \\\\n'\n")
            env = {"PATH": os.environ["PATH"]}
            result = subprocess.run(
                ["node", str(HERE / "target-config.cjs"), str(source), str(target)],
                input=json.dumps({"database": "postgresql://localhost/synthetic"}),
                text=True, capture_output=True, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, "")
            code = (
                'process.loadEnvFile(process.argv[1]); '
                'console.log(JSON.stringify(Object.fromEntries('
                '["DATABASE_URL","SESSION_SECRET","HOST","DISABLE_SCHEDULER",'
                '"SMTP_PASSWORD","NODE_OPTIONS"].map(k=>[k,process.env[k]]))));'
            )
            result = subprocess.run(["node", "-e", code, str(target)],
                                    text=True, capture_output=True, env=env, check=True)
            values = json.loads(result.stdout)
            self.assertEqual(values["DATABASE_URL"], "postgresql://localhost/synthetic")
            self.assertNotEqual(values["SESSION_SECRET"], "old-synthetic")
            self.assertEqual(values["HOST"], "127.0.0.1")
            self.assertEqual(values["DISABLE_SCHEDULER"], "true")
            self.assertNotIn("NODE_OPTIONS", values)
            self.assertEqual(values["SMTP_PASSWORD"], 'synthetic # value with "quote" and \\\\n')
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
