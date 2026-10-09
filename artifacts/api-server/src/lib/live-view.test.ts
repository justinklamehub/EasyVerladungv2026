import test from "node:test";
import assert from "node:assert/strict";
import { LiveViewHub, type LiveActor } from "./live-view";

function fixture(tenantPermission = false) {
  const emitted: Array<{ to: string; event: string; data: any }> = [];
  const actors = new Map<string, LiveActor>([
    ["admin", { id: 1, username: "Admin", role: "comet_admin", speditionId: null }],
    ["source", { id: 2, username: "Quelle", role: "comet_lager", speditionId: null }],
    ["stranger", { id: 3, username: "Fremd", role: "speditions_viewer", speditionId: 9 }],
  ]);
  const sockets = new Map<string, any>();
  const io: any = {
    sockets: { sockets }, to: (to: string) => ({ emit: (event: string, data: any) => emitted.push({ to, event, data }) }),
    emit: (event: string, data: any) => emitted.push({ to: "*", event, data }),
  };
  let enabled = true;
  const hub = new LiveViewHub(io, new Map([...actors].map(([key, actor]) => [key, {
    userId: actor.id, username: actor.username, role: actor.role, page: "/shipments", speditionId: actor.speditionId ?? undefined,
  }])), async socket => actors.get(socket.id) ?? null,
  async () => enabled, async actor => actor.role === "comet_admin" || (tenantPermission && actor.role === "speditions_admin"),
  async value => { enabled = value; });
  for (const id of actors.keys()) {
    const handlers = new Map<string, Function>();
    const socket: any = { id, on: (event: string, handler: Function) => handlers.set(event, handler) };
    socket.trigger = (event: string, data = {}) => new Promise<any>(resolve => handlers.get(event)!(data, resolve));
    socket.fire = (event: string, data = {}) => handlers.get(event)!(data);
    sockets.set(id, socket); hub.attach(socket);
  }
  return { hub, sockets, emitted, actors };
}
const frame = { html: "<p>Ansicht</p>", page: "/shipments", width: 1200, height: 800 };

test("Start ohne Benutzerdialog kündigt Beobachter vor der ersten Übertragung an", async () => {
  const { sockets, emitted, hub } = fixture();
  assert.equal((await sockets.get("admin").trigger("liveview.start", { socketId: "source" })).ok, true);
  assert.equal(emitted[0].event, "liveview.source");
  assert.equal(emitted[0].data.watchers[0].username, "Admin");
  await sockets.get("source").trigger("liveview.frame", frame);
  assert.equal(emitted.filter(e => e.event === "liveview.frame").length, 0);
  await sockets.get("source").trigger("liveview.ready");
  await sockets.get("source").trigger("liveview.frame", frame);
  assert.equal(emitted.filter(e => e.event === "liveview.frame").length, 1);
  assert.equal(Object.values([...hub.sessions.values()][0]).includes(frame.html), false);
});
test("Unberechtigter Benutzer kann nicht starten oder einschalten", async () => {
  const { sockets, hub } = fixture();
  assert.equal((await sockets.get("stranger").trigger("liveview.start", { socketId: "source" })).ok, false);
  assert.equal((await sockets.get("stranger").trigger("liveview.configure", { enabled: true })).ok, false);
  assert.equal(hub.sessions.size, 0);
});
test("Systemweit abschalten beendet Sitzung und entfernt Hinweis", async () => {
  const { sockets, emitted, hub } = fixture();
  await sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  await sockets.get("admin").trigger("liveview.configure", { enabled: false });
  assert.equal(hub.sessions.size, 0);
  assert.ok(emitted.some(e => e.event === "liveview.source" && e.data.watchers.length === 0));
  assert.equal((await sockets.get("admin").trigger("liveview.start", { socketId: "source" })).ok, false);
});
test("Quelle kann ihre Freigabe beenden; andere Benutzer können das nicht", async () => {
  const { sockets, hub } = fixture();
  await sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  await sockets.get("stranger").trigger("liveview.sourceStop");
  assert.equal(hub.sessions.size, 1);
  await sockets.get("source").trigger("liveview.sourceStop");
  assert.equal(hub.sessions.size, 0);
});
test("Rechteentzug beendet Übertragung vor Weiterleitung", async () => {
  const { sockets, actors, emitted, hub } = fixture();
  await sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  await sockets.get("source").trigger("liveview.ready");
  actors.get("admin")!.role = "comet_lager";
  await sockets.get("source").trigger("liveview.frame", frame);
  assert.equal(hub.sessions.size, 0);
  assert.equal(emitted.filter(e => e.event === "liveview.frame").length, 0);
});
test("Trennung beendet Sitzung; fremde Quelle kann kein Bild einschleusen", async () => {
  const { sockets, emitted, hub } = fixture();
  await sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  await sockets.get("source").trigger("liveview.ready");
  await sockets.get("stranger").trigger("liveview.frame", frame);
  assert.equal(emitted.filter(e => e.event === "liveview.frame").length, 0);
  sockets.get("source").fire("disconnect");
  assert.equal(hub.sessions.size, 0);
});
test("Ungültige Dimensionen und übergroße Bilder werden abgewiesen", async () => {
  const { sockets } = fixture();
  assert.equal((await sockets.get("source").trigger("liveview.frame", { ...frame, width: Infinity })).ok, false);
  assert.equal((await sockets.get("source").trigger("liveview.frame", { ...frame, html: "x".repeat(700001) })).ok, false);
});
test("Delegierte Speditions-Rechte überschreiten nicht den Datenscope", async () => {
  const { sockets, actors } = fixture(true);
  actors.get("stranger")!.role = "speditions_admin";
  assert.equal((await sockets.get("stranger").trigger("liveview.start", { socketId: "source" })).ok, false);
  actors.get("source")!.speditionId = 9;
  assert.equal((await sockets.get("stranger").trigger("liveview.start", { socketId: "source" })).ok, true);
});
test("Rechte werden auch ohne neue Bilder erneut geprüft", async () => {
  const { sockets, actors, hub } = fixture();
  await sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  actors.delete("admin");
  await hub.revalidate();
  assert.equal(hub.sessions.size, 0);
});
