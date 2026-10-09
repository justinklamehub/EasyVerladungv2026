import test from "node:test";
import assert from "node:assert/strict";
import { findSendmailPath, mailFailureHint } from "./mail-diagnostics";

test("Debian sendmail works even when the app PATH excludes sbin", () => {
  assert.equal(findSendmailPath("/usr/local/bin:/usr/bin", (file) => file === "/usr/sbin/sendmail"), "/usr/sbin/sendmail");
});
test("existing executable PATH preference is preserved and shell expansion is not used", () => {
  assert.equal(findSendmailPath("/opt/custom mail/bin:/usr/bin", (file) => file === "/opt/custom mail/bin/sendmail" || file === "/usr/sbin/sendmail"), "/opt/custom mail/bin/sendmail");
  assert.equal(findSendmailPath("relative:.", (file) => file === "/usr/lib/sendmail"), "/usr/lib/sendmail");
});
test("missing or inaccessible sendmail fails with a safe actionable ENOENT", () => {
  assert.throws(() => findSendmailPath("/usr/bin", () => false), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "ENOENT" && error.message.includes("SMTP"));
});
test("error hints use known codes only and never expose SMTP responses or private data", () => {
  for (const code of ["ENOENT", "EAUTH", "ECONNREFUSED", "ETIMEDOUT", "EENVELOPE", "ESOCKET", "UNKNOWN"]) {
    const hint = mailFailureHint({ code, message: "PRIVATE-PASSWORD", response: "PRIVATE-PASSWORD", path: "/private/file" });
    assert.ok(!hint.includes("PRIVATE-PASSWORD"));
    assert.ok(!hint.includes("/private/file"));
  }
  assert.match(mailFailureHint({ code: "ENOENT" }), /sendmail/);
  assert.match(mailFailureHint({ code: "EAUTH" }), /Anmeldung/);
  assert.match(mailFailureHint(null), /Postausgang/);
});
