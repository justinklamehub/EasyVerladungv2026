import fs from "node:fs/promises";

const [origin, file] = process.argv.slice(2);
const html = await fs.readFile(file, "utf8");
const base = new URL(origin);
const assets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
  .map(match => new URL(match[1], base))
  .filter(url => url.origin === base.origin && /\.(m?js|css)$/.test(url.pathname));
if (!assets.length) throw new Error("Keine öffentlich prüfbaren Frontend-Dateien.");
for (const url of assets) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store", redirect: "error" });
  const expected = url.pathname.endsWith(".css") ? /text\/css/i : /javascript|ecmascript/i;
  if (!response.ok || !expected.test(response.headers.get("content-type") || "") ||
      !(await response.arrayBuffer()).byteLength) throw new Error("Öffentliches Frontend-Asset nicht nutzbar.");
}
