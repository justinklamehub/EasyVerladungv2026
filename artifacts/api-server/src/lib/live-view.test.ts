import test from "node:test";
import assert from "node:assert/strict";
import { LiveViewHub, type LiveActor } from "./live-view";

function fixture(tenantPermission = false, controlPermission = true) {
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
  async value => { enabled = value; }, async actor => controlPermission && actor.role === "comet_admin");
  for (const id of actors.keys()) {
    const handlers = new Map<string, Function>();
    const socket: any = { id, on: (event: string, handler: Function) => handlers.set(event, handler) };
    socket.timeout = () => socket;
    socket.emit = (event: string, data: any, reply?: Function) => {
      emitted.push({ to: id, event, data });
      reply?.(null, { ok: true });
    };
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

async function controlSession(options?: { permitted?: boolean }) {
  const f = fixture(false, options?.permitted ?? true);
  await f.sockets.get("admin").trigger("liveview.start", { socketId: "source" });
  await f.sockets.get("source").trigger("liveview.ready");
  await f.sockets.get("source").trigger("liveview.frame", frame);
  return f;
}
test("Steuerungsrecht ist zusätzlich zum Ansehen erforderlich", async () => {
  const { sockets } = await controlSession({ permitted: false });
  assert.equal((await sockets.get("admin").trigger("liveview.control.request")).ok, false);
});
test("Direkte Klicks benötigen aktive Freigabe und ein tatsächlich übertragenes Bild", async () => {
  const { sockets, hub, emitted } = await controlSession();
  const frameId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  hub.sessions.get("admin")!.lastFrame = 0;
  await sockets.get("source").trigger("liveview.frame", { ...frame, frameId });
  await sockets.get("admin").trigger("liveview.control.request");
  const requestId = hub.sessions.get("admin")!.control!.requestId;
  const command = { kind: "click", page: "/shipments", frameId, target: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", { requestId, command })).ok, false);
  await sockets.get("source").trigger("liveview.control.respond", { requestId, accept: true });
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", {
    requestId, command: { ...command, frameId: "cccccccc-cccc-cccc-cccc-cccccccccccc" },
  })).ok, false);
  assert.equal((await sockets.get("stranger").trigger("liveview.control.command", { requestId, command })).ok, false);
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", { requestId, command })).ok, true);
  assert.ok(emitted.some(e => e.to === "source" && e.event === "liveview.control.command" && e.data.command.kind === "click"));
  await sockets.get("source").trigger("liveview.control.stop", { requestId });
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", { requestId, command })).ok, false);
});
test("Keine Aktion vor Freigabe; nur die richtige Quelle darf die Übernahme bestätigen", async () => {
  const { sockets, hub, emitted } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const requestId = hub.sessions.get("admin")!.control!.requestId;
  const command = { requestId, command: { kind: "scroll", page: "/shipments", delta: 400 } };
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", command)).ok, false);
  assert.equal((await sockets.get("stranger").trigger("liveview.control.respond", { requestId, accept: true })).ok, false);
  assert.equal((await sockets.get("admin").trigger("liveview.control.respond", { requestId, accept: true })).ok, false);
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", { requestId, accept: true })).ok, true);
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", command)).ok, true);
  assert.equal(emitted.filter(e => e.event === "liveview.control.command").length, 1);
});
test("Automatische Übernahme ist erst nach 15 Sekunden und mit frischer Quellansicht erlaubt", async () => {
  const { sockets, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const grant = hub.sessions.get("admin")!.control!;
  assert.ok(grant.takeoverAt >= Date.now() + 14_900);
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", {
    requestId: grant.requestId, accept: true, automatic: true,
  })).ok, false);
  assert.equal(grant.state, "pending");
  grant.takeoverAt = Date.now() - 1;
  hub.sessions.get("admin")!.lastFrame = Date.now() - 4000;
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", {
    requestId: grant.requestId, accept: true, automatic: true,
  })).ok, false);
  hub.sessions.get("admin")!.lastFrame = Date.now();
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", {
    requestId: grant.requestId, accept: true, automatic: true,
  })).ok, true);
  assert.equal(hub.sessions.get("admin")!.control!.state, "active");
});
test("Ablehnen an der Übernahmegrenze widerruft auch eine gerade gestartete Steuerung", async () => {
  const { sockets, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const grant = hub.sessions.get("admin")!.control!;
  grant.takeoverAt = Date.now() - 1;
  await sockets.get("source").trigger("liveview.control.respond", { requestId: grant.requestId, accept: true, automatic: true });
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", { requestId: grant.requestId, accept: false })).ok, true);
  assert.equal(hub.sessions.get("admin")!.control, undefined);
  assert.equal(hub.sessions.size, 1);
});
test("Abgebrochene Anfrage kann nach Ablauf der 15 Sekunden nicht übernommen werden", async () => {
  const { sockets, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const grant = hub.sessions.get("admin")!.control!;
  grant.takeoverAt = Date.now() - 1;
  await sockets.get("admin").trigger("liveview.control.stop", { requestId: grant.requestId });
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", {
    requestId: grant.requestId, accept: true, automatic: true,
  })).ok, false);
});
test("Generische Klicks, Tasteneingaben und übergroße Werte sind gesperrt", async () => {
  const { sockets, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const requestId = hub.sessions.get("admin")!.control!.requestId;
  await sockets.get("source").trigger("liveview.control.respond", { requestId, accept: true });
  for (const command of [{ kind: "click", page: "/shipments" }, { kind: "keypress", page: "/shipments" },
    { kind: "scroll", page: "/shipments", delta: 9999 }, { kind: "filter", page: "/shipments", id: "search", value: "x".repeat(201) },
    { kind: "navigate", page: "/shipments", path: "//outside.example" }]) {
    assert.equal((await sockets.get("admin").trigger("liveview.control.command", { requestId, command })).ok, false);
  }
});
test("Ablehnen und Quelle-Stopp widerrufen nur Steuerung; alte Freigaben sind ungültig", async () => {
  const { sockets, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  const old = hub.sessions.get("admin")!.control!.requestId;
  await sockets.get("source").trigger("liveview.control.respond", { requestId: old, accept: false });
  assert.equal(hub.sessions.get("admin")!.control, undefined);
  await sockets.get("admin").trigger("liveview.control.request");
  const requestId = hub.sessions.get("admin")!.control!.requestId;
  assert.notEqual(requestId, old);
  assert.equal((await sockets.get("source").trigger("liveview.control.respond", { requestId: old, accept: true })).ok, false);
  await sockets.get("source").trigger("liveview.control.respond", { requestId, accept: true });
  await sockets.get("source").trigger("liveview.control.stop", { requestId });
  assert.equal(hub.sessions.size, 1);
  assert.equal(hub.sessions.get("admin")!.control, undefined);
  assert.equal((await sockets.get("admin").trigger("liveview.control.command", {
    requestId, command: { kind: "scroll", page: "/shipments", delta: 400 },
  })).ok, false);
});
test("Ablauf und Abmeldung beenden Steuerung auch ohne weitere Aktionen", async () => {
  const { sockets, actors, hub } = await controlSession();
  await sockets.get("admin").trigger("liveview.control.request");
  hub.sessions.get("admin")!.control!.expiresAt = Date.now() - 1;
  await hub.revalidate();
  assert.equal(hub.sessions.get("admin")!.control, undefined);
  await sockets.get("admin").trigger("liveview.control.request");
  const requestId = hub.sessions.get("admin")!.control!.requestId;
  await sockets.get("source").trigger("liveview.control.respond", { requestId, accept: true });
  actors.delete("source");
  await hub.revalidate();
  assert.equal(hub.sessions.size, 0);
});
