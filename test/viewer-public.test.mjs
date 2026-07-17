import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("published Viewer reference decrypts locally and matches SHA-256 manifest", async () => {
  const referenceDir = path.join(repoRoot, "viewer-reference");
  const serviceWorker = await readFile(path.join(referenceDir, "preview-service-worker.js"), "utf8");
  const viewerShell = await readFile(path.join(referenceDir, "viewer-shell.html"), "utf8");
  const sums = await readFile(path.join(referenceDir, "SHA256SUMS"), "utf8");

  assert.match(serviceWorker, /crypto\.subtle\.decrypt/);
  assert.match(serviceWorker, /postMessage\(\{type:"DVY_REQUEST_KEY"/);
  assert.match(serviceWorker, /\/manifest/);
  assert.match(serviceWorker, /\/file\?key=/);
  assert.doesNotMatch(serviceWorker, /[?&](?:k|key)=\"?\+?dvyKey/);
  assert.match(viewerShell, /fragment\.get\("k"\)/);
  assert.match(viewerShell, /worker\.postMessage\(\{ type: "DVY_KEY", key/);

  for (const [name, contents] of [
    ["preview-service-worker.js", serviceWorker],
    ["viewer-shell.html", viewerShell]
  ]) {
    const hash = createHash("sha256").update(contents).digest("hex");
    assert.match(sums, new RegExp(`^${hash}  ${name}$`, "m"));
  }
});
