import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const outfile = join(process.cwd(), "tmp-tests", "view-routing.mjs");
const bottomNavOutfile = join(process.cwd(), "tmp-tests", "bottom-nav.mjs");
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
assert.equal(module.normalizeViewParam("kline-lab"), "kline-lab");
assert.equal(module.normalizeViewParam("KLINE-LAB"), "kline-lab");
assert.equal(module.normalizeViewParam("unknown"), "data");
assert.equal(module.normalizeViewParam(null), "data");

await build({
  entryPoints: ["src/components/BottomNav.tsx"],
  outfile: bottomNavOutfile,
  bundle: true,
  external: ["react"],
  format: "esm",
  jsx: "automatic",
  platform: "node",
  target: "node18",
});

const { BottomNav } = await import(pathToFileURL(bottomNavOutfile).href);
const bottomNavMarkup = renderToStaticMarkup(
  React.createElement(BottomNav, { activeView: "claw", onChange: () => {} }),
);
assert.match(bottomNavMarkup, /data-view="claw"[^>]*class="active"[^>]*>[\s\S]*?<span>AIClaw<\/span>/);
assert.match(bottomNavMarkup, /data-view="radar"[^>]*>[\s\S]*?<span>雷达<\/span>/);
assert.doesNotMatch(bottomNavMarkup, /ValueClaw|>信号<\/span>/);

console.log("view routing tests passed");
