import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = join(process.cwd(), "tmp-tests", "view-routing.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

await build({
  entryPoints: ["src/lib/viewRouting.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
});

const module = await import(pathToFileURL(outfile).href);

assert.equal(module.normalizeViewParam("valueclaw"), "claw");
assert.equal(module.normalizeViewParam("alerts"), "signal");
assert.equal(module.normalizeViewParam("signals"), "radar");
assert.equal(module.normalizeViewParam("radar"), "radar");
assert.equal(module.normalizeViewParam("unknown"), "data");
assert.equal(module.normalizeViewParam(null), "data");

console.log("view routing tests passed");
