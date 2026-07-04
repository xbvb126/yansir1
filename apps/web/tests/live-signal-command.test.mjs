import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const outfile = join(process.cwd(), "tmp-tests", "live-signal-command.mjs");
const componentOutfile = join(process.cwd(), "tmp-tests", "LiveSignalCommand.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

const appShellSource = readFileSync(join(process.cwd(), "src/components/AppShell.tsx"), "utf8");
const liveSignalCommandSource = readFileSync(join(process.cwd(), "src/features/radar/LiveSignalCommand.tsx"), "utf8");
const liveCommandIndex = appShellSource.indexOf("<LiveSignalCommand");
const trackingPanelIndex = appShellSource.indexOf('<section id="radar-tools-panel" className="radar-tools-panel"');
const trackingHeaderIndex = appShellSource.indexOf('<header className="ai-track-header">');
assert.ok(liveCommandIndex > -1, "radar should render LiveSignalCommand");
assert.ok(trackingPanelIndex > -1, "radar should render tracking tools panel");
assert.ok(trackingHeaderIndex > -1, "radar should keep tracking tools");
assert.ok(
  trackingPanelIndex < liveCommandIndex,
  "radar tracking tools should render before the signal list",
);
assert.ok(
  trackingHeaderIndex < liveCommandIndex,
  "radar tracking header should render before the signal list",
);
assert.doesNotMatch(
  appShellSource,
  /radarToolsOpen|radar-tools-disclosure|aria-expanded=\{radarToolsOpen\}/,
  "radar tracking tools should not use an extra disclosure row",
);
assert.match(
  appShellSource,
  /useState<"ai" \| "strategy" \| "mine">\("strategy"\)/,
  "radar should default to strategy signals",
);
assert.match(
  appShellSource,
  />策略信号<\/button>/,
  "radar should label the primary strategy source as strategy signals",
);
assert.match(
  appShellSource,
  />市场异动<\/button>/,
  "radar should label market tracking as market movement",
);
assert.match(
  appShellSource,
  />我的关注<\/button>/,
  "radar should label personal tracking as watchlist focus",
);
assert.doesNotMatch(
  appShellSource,
  />市场追踪<\/button>|>策略追踪<\/button>|>我的追踪<\/button>|aria-label="追踪类型"/,
  "radar source filters should avoid duplicate tracking labels",
);
assert.doesNotMatch(
  appShellSource,
  /策略追踪扫描失败|策略追踪实时监听|我的追踪里添加币种/,
  "radar status copy should avoid the duplicate tracking terminology",
);
assert.match(
  appShellSource,
  /const strategySectionRecords = useMemo<RadarTimelineRecord\[\]>\(\(\) =>\s*buildAllMarketRadarRecords\(rows, strategyRecords,/,
  "strategy signal source should be backfilled from all market rows",
);
assert.match(
  appShellSource,
  /const marketSectionRecords = useMemo<RadarTimelineRecord\[\]>\(\(\) =>\s*buildAllMarketRadarRecords\(rows, radarRecords,/,
  "market movement source should be backfilled from all market rows",
);
assert.match(
  appShellSource,
  /trackingSection === "strategy"\s*\?\s*strategySectionRecords\s*:\s*trackingSection === "mine"\s*\?\s*marketSectionRecords\.filter\(\(record\) => watchlistSet\.has\(record\.symbol\)\)\s*:\s*marketSectionRecords/,
  "only the watchlist source should narrow the market-wide radar records",
);
assert.doesNotMatch(
  appShellSource,
  /trackingSection === "strategy"\s*\?\s*strategyRecords\s*:\s*trackingSection === "mine"\s*\?\s*radarRecords\.filter/,
  "strategy and market radar sources should not be limited to triggered signals only",
);
assert.match(
  liveSignalCommandSource,
  /\{signalCount\} 条雷达币种/,
  "radar status count should describe market-wide coin rows instead of triggered strategy signals",
);
assert.doesNotMatch(
  liveSignalCommandSource,
  /\{signalCount\} 条策略信号/,
  "radar status count should not label backfilled market rows as strategy signals",
);
assert.doesNotMatch(
  appShellSource,
  /if\s*\(\s*selectedDetailSignal\s*\)\s*{\s*return\s*\(/,
  "signal evidence should not replace the full radar page",
);
assert.doesNotMatch(
  appShellSource,
  /radarDetailSignalId|selectedDetailSignal|live-command__evidence-shell|SignalEvidenceDetail/,
  "signal detail action should open the symbol detail page instead of a separate evidence panel",
);
assert.match(
  appShellSource,
  /function handleOpenSignalDetail\(symbol: string\)[\s\S]*onOpenSymbolSignal\(signal\)/,
  "radar signal detail action should route through the symbol handoff context",
);
assert.match(
  liveSignalCommandSource,
  /onOpenDetail\(signal\.symbol\)/,
  "inline signal detail button should pass the signal symbol",
);
assert.match(
  appShellSource,
  /valueClawSignalContext/,
  "ValueClaw should receive selected radar signal context",
);
assert.match(
  appShellSource,
  /onOpenValueClawSignal\(signal\)/,
  "radar ValueClaw action should pass the selected strategy signal",
);
assert.match(
  appShellSource,
  /ValueClaw 仅解释和复核该策略信号/,
  "ValueClaw context copy should preserve the strategy-signal boundary",
);
assert.match(
  appShellSource,
  /symbolSignalContext/,
  "symbol detail should preserve radar signal handoff context",
);
assert.match(
  appShellSource,
  /来自实时雷达/,
  "symbol detail should label radar handoff context",
);
assert.match(
  appShellSource,
  /onOpenValueClawSignal\(radarSignalContext\)/,
  "symbol detail radar context should keep the ValueClaw handoff",
);

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
assert.equal(componentModule.resolveNextSelectedSignalId(undefined, riskSignal.id), riskSignal.id);
assert.equal(componentModule.resolveNextSelectedSignalId(riskSignal.id, riskSignal.id), undefined);
assert.equal(componentModule.resolveNextSelectedSignalId(baseSignal.id, riskSignal.id), riskSignal.id);

const emptyState = {
  title: "暂无符合条件的策略信号",
  description: "策略引擎没有发现满足当前筛选条件的信号，这不是 AI 判断缺席。",
  meta: ["信号来源：Yansir 策略引擎", "最近扫描：14:30"],
};

const emptyMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [],
    activeFilter: "now",
    listeningStatus: "paused",
    emptyState,
    now: Date.parse("2026-07-04T08:03:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(emptyMarkup, /暂无符合条件的策略信号/);
assert.match(emptyMarkup, /Yansir 策略引擎/);
assert.doesNotMatch(emptyMarkup, /AI 生成|AI 发出信号/);

const collapsedMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [baseSignal, riskSignal, watchSignal],
    activeFilter: "now",
    listeningStatus: "live",
    emptyState,
    now: Date.parse("2026-07-04T08:03:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(collapsedMarkup, /实时雷达/);
assert.match(collapsedMarkup, /ETHUSDT/);
assert.doesNotMatch(collapsedMarkup, /live-command__row-detail/);
assert.doesNotMatch(collapsedMarkup, /信号来源|策略信号保持最高优先级|币种详情/);

const markup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [baseSignal, riskSignal, watchSignal],
    selectedSignalId: riskSignal.id,
    activeFilter: "now",
    listeningStatus: "live",
    emptyState,
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
assert.match(markup, /币种详情/);
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


console.log("live signal command tests passed");
