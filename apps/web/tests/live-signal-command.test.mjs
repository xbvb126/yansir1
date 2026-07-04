import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const outfile = join(process.cwd(), "tmp-tests", "live-signal-command.mjs");
const componentOutfile = join(process.cwd(), "tmp-tests", "LiveSignalCommand.mjs");
const detailOutfile = join(process.cwd(), "tmp-tests", "SignalEvidenceDetail.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

await build({
  entryPoints: ["src/features/radar/liveSignalModel.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
});

const module = await import(pathToFileURL(outfile).href);

const baseSignal = module.toLiveSignal(
  {
    id: "sig-btc",
    symbol: "btcUSDT",
    direction: "BUY",
    score: 87.2,
    confidence: 91,
    risk: "可控",
    status: "active",
    strategyName: "动量突破",
    trigger: "放量突破已确认",
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
    risk: "高风险止损区",
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
assert.equal(facts[0].label, "信号来源");
assert.equal(facts[0].value, "Yansir 策略引擎");
assert.ok(facts.some((fact) => fact.value.includes("策略信号保持最高优先级")));

assert.equal(
  module.formatSignalTime("2026-07-04T08:00:00.000Z", Date.parse("2026-07-04T08:00:42.000Z")),
  "42秒前",
);

await build({
  entryPoints: ["src/features/radar/LiveSignalCommand.tsx"],
  outfile: componentOutfile,
  bundle: true,
  external: ["react", "react/jsx-runtime"],
  format: "esm",
  jsx: "automatic",
  platform: "node",
  target: "node18",
});

const componentModule = await import(pathToFileURL(componentOutfile).href);
const markup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [baseSignal, riskSignal, watchSignal],
    selectedSignalId: riskSignal.id,
    activeFilter: "now",
    listeningStatus: "live",
    now: Date.parse("2026-07-04T08:03:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(markup, /实时雷达/);
assert.match(markup, /Yansir Crypto/);
assert.match(markup, /Yansir 策略引擎/);
assert.match(markup, /信号详情/);
assert.match(markup, /策略信号保持最高优先级/);
assert.match(markup, /监听中/);
assert.match(markup, /做空/);
assert.match(markup, /live-command__row-detail/);
assert.doesNotMatch(markup, /Realtime Radar|Signal Detail|Signal source|Direction|Confidence|Strategy listener active|strategy signals|s ago|LONG|SHORT|NEUTRAL/);

const selectedRowIndex = markup.indexOf("ETHUSDT");
const followingRowIndex = markup.indexOf("BTCUSDT");
const inlineDetailIndex = markup.indexOf("live-command__row-detail");
assert.ok(selectedRowIndex > -1, "selected signal row should render");
assert.ok(followingRowIndex > -1, "following signal row should render");
assert.ok(inlineDetailIndex > selectedRowIndex, "signal detail should render after the selected row");
assert.ok(inlineDetailIndex < followingRowIndex, "signal detail should render before the next signal row");

await build({
  entryPoints: ["src/features/radar/SignalEvidenceDetail.tsx"],
  outfile: detailOutfile,
  bundle: true,
  external: ["react", "react/jsx-runtime"],
  format: "esm",
  jsx: "automatic",
  platform: "node",
  target: "node18",
});

const detailModule = await import(pathToFileURL(detailOutfile).href);
const detailMarkup = renderToStaticMarkup(
  React.createElement(detailModule.SignalEvidenceDetail, {
    signal: baseSignal,
    now: Date.parse("2026-07-04T08:03:00.000Z"),
    onBack: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(detailMarkup, /BTCUSDT/);
assert.match(detailMarkup, /策略评分/);
assert.match(detailMarkup, /AI 复核边界/);
assert.match(detailMarkup, /不会创建或覆盖策略信号/);
assert.doesNotMatch(detailMarkup, /Strategy score|AI Review Boundary|does not create or override|Back|Watch Symbol|Open ValueClaw|LONG/);

console.log("live signal command tests passed");
