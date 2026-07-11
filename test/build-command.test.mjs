import assert from "node:assert/strict";
import test from "node:test";
import { buildCommand } from "../dist/cli/build.js";

const buildPackage = { scripts: { build: "vite build" } };

test("Vite receives a relative base and the requested output directory", () => {
  assert.deepEqual(buildCommand("pnpm", "vite", buildPackage, "/tmp/output"), {
    command: "pnpm",
    args: ["run", "build", "--", "--base=./", "--outDir", "/tmp/output"]
  });
});

test("Astro does not receive Vite's relative base flag", () => {
  assert.deepEqual(buildCommand("npm", "astro", { scripts: { build: "astro build" } }, "/tmp/dist"), {
    command: "npm",
    args: ["run", "build"]
  });
});

test("Storybook and Bun receive supported arguments without an extra separator", () => {
  assert.deepEqual(buildCommand("bun", "storybook", { scripts: { "build-storybook": "storybook build" } }, "/tmp/storybook"), {
    command: "bun",
    args: ["run", "build-storybook", "--output-dir", "/tmp/storybook"]
  });
});
