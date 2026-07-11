import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("npm package is public-ready and excludes service internals", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.notEqual(pkg.private, true);
  assert.equal(pkg.name, "@dvyu/cli");
  assert.equal(pkg.license, "SEE LICENSE IN LICENSE");
  assert.equal(pkg.publishConfig?.access, "public");
  assert.equal(pkg.publishConfig?.provenance, true);
  assert.equal(pkg.bin?.dvyu, "dist/cli/index.js");
  const cliMode = (await stat("dist/cli/index.js")).mode;
  assert.notEqual(cliMode & 0o111, 0, "npm bin entry must be executable");

  const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8"
  }));
  const files = packed[0].files.map((file) => file.path);
  assert(files.includes("dist/cli/index.js"));
  assert(files.includes("SECURITY.md"));
  assert(!files.some((file) => file.startsWith("src/worker/") || file.startsWith("migrations/") || file === "wrangler.toml"));
  assert(!files.some((file) => file.includes("INTERNAL") || file === ".npmrc" || file === ".dev.vars"));
});
