import fs from "node:fs/promises";
import path from "node:path";

export async function validateFrontend(directory) {
  const html = await fs.readFile(path.join(directory, "index.html"), "utf8");
  if (!/\bid=["']root["']/.test(html)) throw new Error("App-Root fehlt im Frontend.");
  const resources = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1]).filter(value => !/^(https?:|\/\/|data:)/i.test(value));
  if (!resources.some(value => /\.m?js(?:[?#]|$)/.test(value))) throw new Error("Gebautes JavaScript fehlt.");
  for (const resource of resources) {
    const pathname = decodeURIComponent(new URL(resource, "http://local/").pathname);
    const asset = pathname.lastIndexOf("/assets/");
    const relative = asset >= 0 ? pathname.slice(asset + 1) : pathname.replace(/^\/+/, "");
    const target = path.resolve(directory, relative);
    if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error("Ungültiger Assetpfad.");
    const stat = await fs.stat(target);
    if (!stat.isFile() || !stat.size) throw new Error("Frontend-Datei fehlt oder ist leer.");
    await fs.access(target, fs.constants.R_OK);
  }
}
if (process.argv[1] === import.meta.filename) await validateFrontend(process.argv[2]);
