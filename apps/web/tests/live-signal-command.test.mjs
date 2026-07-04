import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = join(process.cwd(), "tmp-tests", "live-signal-command.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

await build({
  entryPoints: ["src/features/radar/liveSignalCommand.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
});

const module = await import(pathToFileURL(outfile).href);

const baseSignal = module.toLiveSignal(
  {
    id: "sig-btc",
    symbol: "btcUSDT",
    direction: "BUY",
    score: 87.2,
    confidence: 91,
    risk: "controlled",
    status: "active",
    strategyName: "Momentum Breakout",
    trigger: "Volume breakout confirmed",
    generatedAt: "2026-07-04T08:00:00.000Z",
  },
  0,
);

assert.equal(baseSignal.symbol, "BTCUSDT");
assert.equal(baseSignal.direction, "long");
assert.equal(baseSignal.source, "strategy");
assert.equal(baseSignal.score, 87);
assert.equal(baseSignal.confidence, 91);

const riskSignal = module.toLiveSignal(
  {
    symbol: "ETHUSDT",
    side: "short",
    score: 76,
    risk: "High risk stop zone",
    generatedAt: "2026-07-04T08:01:00.000Z",
  },
  1,
);

assert.equal(riskSignal.direction, "short");
assert.equal(riskSignal.tone, "risk");

const watchSignal = module.toLiveSignal(
  {
    symbol: "SOLUSDT",
    direction: "flat",
    score: 61,
    status: "watch",
    generatedAt: "2026-07-04T08:02:00.000Z",
  },
  2,
);

assert.equal(watchSignal.direction, "neutral");
assert.equal(watchSignal.tone, "watch");

const filteredLong = module.filterLiveSignals([baseSignal, riskSignal, watchSignal], "long");
assert.deepEqual(
  filteredLong.map((signal) => signal.symbol),
  ["BTCUSDT"],
);

const sorted = module.sortLiveSignals([baseSignal, riskSignal, watchSignal]);
assert.deepEqual(
  sorted.map((signal) => signal.symbol),
  ["SOLUSDT", "ETHUSDT", "BTCUSDT"],
);

const facts = module.buildSelectedSignalFacts(baseSignal);
assert.equal(facts[0].value, "Yansir strategy engine");
assert.ok(facts.some((fact) => fact.value.includes("Explain and review only")));

assert.equal(
  module.formatSignalTime("2026-07-04T08:00:00.000Z", Date.parse("2026-07-04T08:00:42.000Z")),
  "42s ago",
);

console.log("live signal command tests passed");
