import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("local preview records stay isolated by API URL", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dvyu-store-test-"));
  const storeModule = pathToFileURL(path.resolve("dist/cli/store.js")).href;
  const script = `
    import assert from "node:assert/strict";
    const store = await import(process.env.STORE_MODULE);
    const id = "0123456789abcdef01234567";
    const key = "a".repeat(43);
    const base = {
      id, key, sourcePath: "/tmp/site", createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-03T00:00:00.000Z", totalSize: 1, entrypoint: "index.html"
    };
    await store.savePreview({ ...base, apiUrl: "https://one.example", url: "https://one.example/p/" + id + "#k=" + key });
    await store.savePreview({ ...base, apiUrl: "https://two.example", url: "https://two.example/p/" + id + "#k=" + key });
    assert.equal((await store.listLocalPreviews()).length, 2);
    await store.removeLocalPreview(id, "https://one.example");
    const remaining = await store.listLocalPreviews();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].apiUrl, "https://two.example");
  `;

  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, STORE_MODULE: storeModule }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("concurrent CLI processes do not lose local preview keys", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dvyu-store-race-test-"));
  const storeModule = pathToFileURL(path.resolve("dist/cli/store.js")).href;
  const processCount = 16;
  const key = "a".repeat(43);
  const script = `
    const store = await import(process.env.STORE_MODULE);
    await store.savePreview({
      id: process.env.PREVIEW_ID,
      key: ${JSON.stringify(key)},
      url: "https://example.test/p/" + process.env.PREVIEW_ID + "#k=" + ${JSON.stringify(key)},
      apiUrl: "https://example.test",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-03T00:00:00.000Z",
      totalSize: 1,
      entrypoint: "index.html"
    });
  `;

  try {
    const exitCodes = await Promise.all(Array.from({ length: processCount }, (_, index) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
        env: {
          ...process.env,
          HOME: home,
          STORE_MODULE: storeModule,
          PREVIEW_ID: index.toString(16).padStart(24, "0")
        },
        stdio: "ignore"
      });
      child.on("error", reject);
      child.on("exit", resolve);
    })));
    assert(exitCodes.every((code) => code === 0), `child exit codes: ${exitCodes.join(", ")}`);
    const stored = JSON.parse(await readFile(path.join(home, ".dvyu", "previews.json"), "utf8"));
    assert.equal(stored.previews.length, processCount);
    assert.equal(new Set(stored.previews.map((preview) => preview.id)).size, processCount);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(`${home}/.dvyu.lock`, { force: true });
  }
});
