import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SystemUpdateProgress } from "@workspace/api-client-react";
import { UpdateFailureDetails } from "./update-failure-details";

const failed: SystemUpdateProgress = {
  jobId: "update-fixture", status: "failed", phase: "dependencies", message: "Update fehlgeschlagen.",
  startedAt: null, finishedAt: null, events: [], recovery: "preserved",
  diagnostic: { code: "ERR_PNPM_IGNORED_BUILDS", cause: "Installationsskripte blockiert.",
    nextSteps: ["Konfiguration prüfen.", "Korrektur committen und pushen."] },
};
test("Fehleranzeige enthält Ursache, Code, Abbruchphase und nächste Schritte", () => {
  const html = renderToStaticMarkup(<UpdateFailureDetails update={failed} />);
  for (const text of ["Installationsskripte blockiert.", "ERR_PNPM_IGNORED_BUILDS", "dependencies",
    "Konfiguration prüfen.", "Korrektur committen und pushen.", "Datenbank wurde nicht zurückgesetzt"]) assert.ok(html.includes(text));
  assert.ok(renderToStaticMarkup(<UpdateFailureDetails update={{ ...failed, recovery: "failed" }} />)
    .includes("Auch die automatische Rückkehr ist fehlgeschlagen"));
});
test("Erfolg, laufender Auftrag und unbekannter Abschluss zeigen keine alte Fehlerursache", () => {
  for (const status of ["done", "unknown", "running", "queued", "idle"] as const) {
    assert.equal(renderToStaticMarkup(<UpdateFailureDetails update={{ ...failed, status }} />), "");
  }
  const unknown = renderToStaticMarkup(<UpdateFailureDetails update={{ ...failed,
    diagnostic: { code: "UNKNOWN", cause: "Ursache nicht sicher erkannt.", nextSteps: ["Privates Protokoll prüfen."] } }} />);
  assert.ok(unknown.includes("Ursache nicht sicher erkannt.") && unknown.includes("Privates Protokoll prüfen."));
});
