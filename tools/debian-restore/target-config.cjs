// Executed ONLY by the owner on their new Debian server. Never prints credentials.
const fs = require("node:fs");
const crypto = require("node:crypto");
const [source, destination] = process.argv.slice(2);
const inherited = new Set(Object.keys(process.env));
process.loadEnvFile(source);
const backedUp = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !inherited.has(key))
);
// Discard unsafe Node/loader overrides and old infrastructure-specific connections.
for (const key of Object.keys(backedUp)) {
  if (/^(NODE_OPTIONS|NODE_PATH|LD_|PG|REPLIT_|COMET_HEALTH_URL|PRIVATE_OBJECT_DIR|PUBLIC_OBJECT_SEARCH_PATHS)/.test(key)) {
    delete backedUp[key];
  }
}
const { database } = JSON.parse(fs.readFileSync(0, "utf8"));
Object.assign(backedUp, {
  DATABASE_URL: database,
  SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
  NODE_ENV: "production",
  PORT: "3333",
  HOST: "127.0.0.1",
  COOKIE_SECURE: "false", // HTTP through a local SSH tunnel only.
  DISABLE_SCHEDULER: "true",
  STORAGE_BACKEND: "local",
  LOCAL_STORAGE_DIR: "/opt/comet/storage-data",
  COMET_STORAGE_CWD: "/opt/comet/app",
  COMET_APP_DIR: "/opt/comet/app",
  COMET_PUBLIC_URL: "http://127.0.0.1:8080/",
  COMET_PM2_NAME: "comet-api",
});
// Prefer literal quotes: double quotes interpret backslash-n/backslash-r.
function quote(value) {
  for (const delimiter of ["'", "`", '"']) {
    if (!value.includes(delimiter) &&
        !(delimiter === '"' && /\\[nr]/.test(value))) {
      return delimiter + value + delimiter;
    }
  }
  throw new Error("Unsupported env quoting; adjust locally, never paste secrets.");
}
for (const [key, value] of Object.entries(backedUp)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) {
    throw new Error("Unsupported env value; adjust locally, never paste secrets.");
  }
}
fs.writeFileSync(destination, Object.entries(backedUp)
  .map(([key, value]) => `${key}=${quote(value)}`).join("\n") + "\n",
  { mode: 0o600, flag: "wx" });
