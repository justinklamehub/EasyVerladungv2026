import test from "node:test";
import assert from "node:assert/strict";
import { fetchCurrentBuild, mayReload, reloadUrl } from "./app-build";

test("build checks bypass caches and use the artifact base path", async () => {
  let requested = "";
  const fakeFetch: typeof fetch = async (input, init) => {
    requested = String(input);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    assert.ok(init?.signal);
    return Response.json({ buildId: "release-B" });
  };
  assert.equal(await fetchCurrentBuild("/comet/", fakeFetch), "release-B");
  assert.match(requested, /^\/comet\/build-info\.json\?_=\d+$/);
});
test("bad/missing/offline version responses never authorize a reload", async () => {
  for (const response of [Response.json({}), Response.json({ buildId: "<bad>" }), new Response("SPA fallback"), new Response("", { status: 503 })]) {
    await assert.rejects(fetchCurrentBuild("/", async () => response));
  }
  await assert.rejects(fetchCurrentBuild("/", async () => { throw new Error("offline"); }));
});
test("cache-busting reload preserves route, filters and fragment", () => {
  const url = new URL(reloadUrl("https://example.test/comet/shipments?status=Offen#details", "release-B"));
  assert.equal(url.pathname, "/comet/shipments");
  assert.equal(url.searchParams.get("status"), "Offen");
  assert.equal(url.hash, "#details");
  assert.equal(url.searchParams.get("__comet_build"), "release-B");
});
test("reload guards prevent stale-server loops, including disabled session storage", () => {
  assert.equal(mayReload("https://example.test/", "B", null), true);
  assert.equal(mayReload("https://example.test/?__comet_build=B", "B", null), false);
  assert.equal(mayReload("https://example.test/", "B", "B"), false);
  assert.equal(mayReload("https://example.test/?__comet_build=A", "B", "A"), true);
});
