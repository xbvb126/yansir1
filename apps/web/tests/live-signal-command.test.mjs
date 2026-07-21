import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const outfile = join(process.cwd(), "tmp-tests", "live-signal-command.mjs");
const componentOutfile = join(process.cwd(), "tmp-tests", "LiveSignalCommand.mjs");
const chromeOutfile = join(process.cwd(), "tmp-tests", "RadarWorkspaceChrome.mjs");
const presentationOutfile = join(process.cwd(), "tmp-tests", "radarSourcePresentation.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

const appShellSource = readFileSync(join(process.cwd(), "src/components/AppShell.tsx"), "utf8");
const liveSignalCommandSource = readFileSync(join(process.cwd(), "src/features/radar/LiveSignalCommand.tsx"), "utf8");
const liveCommandIndex = appShellSource.indexOf("<LiveSignalCommand");
const trackingPanelIndex = appShellSource.indexOf('<section id="radar-tools-panel" className="radar-tools-panel"');
const trackingHeaderIndex = appShellSource.indexOf("<RadarWorkspaceChrome");
assert.match(
  appShellSource,
  /const STRATEGY_TRACK_TIMEFRAMES = \["5m", "15m", "30m", "1h", "4h"\]/,
  "Radar tracking and watchlist defaults must include the scheduled 30m timeframe",
);
assert.match(
  appShellSource,
  /\["all", "5m", "15m", "30m", "1h", "4h"\]\.map/,
  "Radar inbox filters must expose 30m signals",
);
assert.ok(liveCommandIndex > -1, "radar should render LiveSignalCommand");
assert.ok(trackingPanelIndex > -1, "radar should render tracking tools panel");
assert.ok(trackingHeaderIndex > -1, "radar should render workspace chrome");
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
  appShellSource,
  /if \(filter === "short"\) return record\.direction === "short";/,
  "short category should use the authoritative signal direction",
);
assert.doesNotMatch(
  appShellSource,
  /filter === "short"[^;]*record\.group === "risk"/,
  "risk classification should not substitute for a short direction",
);
assert.doesNotMatch(
  liveSignalCommandSource,
  /live-command__header|live-command__status|<h1>实时雷达<\/h1>|StrategyStatusPanel/,
  "radar list component should not render the duplicate title/status block",
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
  /AIClaw 仅解释和复核该策略信号/,
  "AIClaw context copy should preserve the strategy-signal boundary",
);
assert.doesNotMatch(
  appShellSource,
  /Legacy source-contract marker: ValueClaw/,
  "AIClaw boundary copy should not require a legacy production marker",
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
assert.match(
  appShellSource,
  /action:\s*signal\.action\s*\?\?\s*signal\.payload\?\.action\s*\?\?\s*null/,
  "strategy inbox records should preserve action before radar normalization",
);
assert.match(
  appShellSource,
  /action:\s*signal\.action\s*\?\?\s*null/,
  "strategy scan records should preserve action before radar normalization",
);
assert.match(
  appShellSource,
  /action:\s*record\.action\s*\?\?\s*record\.payload\?\.action\s*\?\?\s*null/,
  "AppShell toLiveSignal handoff should pass action into the radar model",
);
assert.match(
  appShellSource,
  /payload:\s*record\.payload/,
  "AppShell toLiveSignal handoff should keep radar signal payload available",
);
assert.match(appShellSource, /timeframe:\s*record\.timeframe/, "AppShell should pass the authoritative timeframe to the live signal model");
assert.match(appShellSource, /triggerPrice:\s*record\.triggerPrice/, "AppShell should pass the authoritative trigger price to the live signal model");
assert.doesNotMatch(
  appShellSource,
  /triggerPrice:\s*row\?\.price/,
  "AppShell must not substitute current market price for trigger price",
);

await build({
  entryPoints: ["src/features/radar/radarSourcePresentation.ts"],
  outfile: presentationOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
});

const presentationModule = await import(pathToFileURL(presentationOutfile).href);
const inboxFacts = presentationModule.strategyInboxSignalFacts({ timeframe: "15m", price: 186.32 });
assert.deepEqual(inboxFacts, { timeframe: "15m", triggerPrice: 186.32 });
assert.deepEqual(
  presentationModule.strategyInboxSignalFacts({ timeframe: "1h" }),
  { timeframe: "1h", triggerPrice: undefined },
  "an inbox record without an execution price must keep trigger price undefined",
);
const scanFacts = presentationModule.strategyScanSignalFacts(
  { timeframe: "4h" },
  { price: 3518.9 },
);
assert.deepEqual(scanFacts, { timeframe: "4h", triggerPrice: 3518.9 });
assert.deepEqual(
  presentationModule.strategyScanSignalFacts({ timeframe: "5m" }, {}),
  { timeframe: "5m", triggerPrice: undefined },
  "a scan record without an execution price must keep trigger price undefined",
);

const sourceCases = [
  {
    source: "strategy",
    expectedTitle: "暂无符合条件的策略信号",
    expectedSource: "信号来源：Yansir 策略引擎",
    expectedPrefix: "最后扫描",
  },
  {
    source: "ai",
    expectedTitle: "暂无符合条件的市场异动",
    expectedSource: "信号来源：市场行情与雷达规则",
    expectedPrefix: "行情更新",
  },
  {
    source: "mine",
    expectedTitle: "我的关注暂无符合条件的异动",
    expectedSource: "信号来源：我的关注列表与市场行情",
    expectedPrefix: "自选更新",
  },
];

for (const sourceCase of sourceCases) {
  const presentation = presentationModule.buildRadarSourcePresentation({
    source: sourceCase.source,
    strategyStatus: "no-signal",
    strategyLastScan: "14:02",
    marketLastUpdate: "14:01",
    scopeLabel: "测试范围",
    filterLabel: "全部",
    watchlistCount: sourceCase.source === "mine" ? 2 : 0,
  });
  assert.equal(presentation.emptyState.title, sourceCase.expectedTitle);
  assert.ok(presentation.emptyState.meta.includes(sourceCase.expectedSource));
  assert.equal(presentation.latestPrefix, sourceCase.expectedPrefix);
  if (sourceCase.source !== "strategy") {
    assert.doesNotMatch(
      `${presentation.listenerLabel} ${presentation.emptyState.title} ${presentation.emptyState.description} ${presentation.emptyState.meta.join(" ")}`,
      /Yansir 策略|策略引擎|策略信号/,
      `${sourceCase.source} zero-result presentation must not claim strategy provenance`,
    );
  }
}

await build({
  entryPoints: ["src/features/radar/RadarWorkspaceChrome.tsx"],
  outfile: chromeOutfile,
  bundle: true,
  external: ["react", "react/jsx-runtime"],
  format: "esm",
  jsx: "automatic",
  platform: "node",
  target: "node18",
});

const chromeModule = await import(pathToFileURL(chromeOutfile).href);
const chromeMarkup = renderToStaticMarkup(
  React.createElement(chromeModule.RadarWorkspaceChrome, {
    activeSource: "strategy",
    onSourceChange: () => undefined,
    listenerLabel: "监听中",
    latestScanLabel: "14:02:00",
    categoryItems: [
      { id: "all", label: "全部", count: 24 },
      { id: "long", label: "看多" },
      { id: "short", label: "看空" },
      { id: "breakout", label: "趋势突破" },
      { id: "rebound", label: "回调反弹" },
      { id: "volume", label: "成交量异动" },
      { id: "capital", label: "资金异动" },
    ],
    activeCategory: "all",
    onCategoryChange: () => undefined,
    onOpenFilters: () => undefined,
  }),
);

assert.match(chromeMarkup, /雷达/);
assert.match(chromeMarkup, /监听中/);
assert.match(chromeMarkup, /最后扫描 14:02:00/);
assert.match(chromeMarkup, /市场异动.*策略信号.*我的/s);
assert.match(chromeMarkup, /全部.*看多.*看空.*趋势突破.*回调反弹.*成交量异动.*资金异动/s);
assert.match(chromeMarkup, /aria-label="高级筛选"/);

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
    timeframe: "5m",
    price: "64000.50",
    triggerPrice: "63950.25",
    generatedAt: "2026-07-04T08:00:00.000Z",
  },
  0,
);

assert.equal(baseSignal.symbol, "BTCUSDT");
assert.equal(baseSignal.direction, "long");
assert.equal(baseSignal.source, "strategy");
assert.equal(baseSignal.score, 87);
assert.equal(baseSignal.confidence, 91);
assert.equal(baseSignal.timeframe, "5m");
assert.equal(baseSignal.triggerPrice, "63950.25");

const addSignal = module.toLiveSignal(
  {
    id: "sig-add",
    symbol: "ADAUSDT",
    action: "add_long",
    score: 82,
    confidence: 84,
    risk: "鍙帶",
    status: "active",
    strategyName: "EMD V6",
    trigger: "瓒嬪娍鍥炶踩鍔犱粨",
    generatedAt: "2026-07-04T08:00:30.000Z",
  },
  5,
);

const reduceSignal = module.toLiveSignal(
  {
    id: "sig-reduce",
    symbol: "BNBUSDT",
    payload: { action: "reduce_short", reducePct: 25 },
    score: 79,
    confidence: 80,
    risk: "瓒嬪娍杞急",
    status: "active",
    strategyName: "EMD V6",
    trigger: "瓒嬪娍杞急鍑忎粨",
    generatedAt: "2026-07-04T08:00:35.000Z",
  },
  6,
);

assert.equal(addSignal.action, "add_long");
assert.equal(addSignal.direction, "long");
assert.equal(reduceSignal.action, "reduce_short");
assert.equal(reduceSignal.direction, "short");

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
assert.equal(riskSignal.triggerPrice, undefined);

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

const marketSignal = module.toLiveSignal(
  {
    id: "market-lab",
    symbol: "LAB",
    source: "market",
    direction: "flat",
    score: 91,
    status: "active",
    strategyName: "市场观察池",
    trigger: "价格快速拉升，需观察成交量延续和资金费率变化。",
    price: "13.51",
    change24h: "+90.67%",
    generatedAt: "2026-07-04T08:03:00.000Z",
  },
  3,
);

assert.equal(marketSignal.source, "market");
assert.equal(marketSignal.price, "13.51");
assert.equal(marketSignal.triggerPrice, undefined);
assert.equal(marketSignal.change24h, "+90.67%");

const waitingStrategySignal = module.toLiveSignal(
  {
    id: "wait-lab",
    symbol: "LAB",
    source: "strategy",
    direction: "flat",
    score: 96,
    confidence: 96,
    status: "no-signal",
    strategyName: "已纳入全市场策略扫描",
    trigger: "LAB 已纳入全市场策略扫描，当前暂未触发 Yansir 策略信号。",
    generatedAt: "2026-07-04T08:03:00.000Z",
  },
  4,
);

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

assert.match(collapsedMarkup, /ETHUSDT/);
assert.match(collapsedMarkup, /aria-expanded="false"/);
assert.doesNotMatch(collapsedMarkup, /实时雷达|Yansir Crypto/);
assert.doesNotMatch(collapsedMarkup, /live-command__row-detail/);
assert.doesNotMatch(collapsedMarkup, /触发原因|币种详情|AIClaw 复核|市场异动详情/);

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

assert.match(markup, /策略信号详情/);
assert.match(markup, /币种详情/);
assert.match(markup, /AIClaw 复核/);
assert.match(markup, /加入观察/);
assert.match(markup, /aria-expanded="true"/);
assert.match(markup, /<time>08:01<\/time><span class="radar-signal-row__pair">ETHUSDT<\/span><span class="radar-signal-row__timeframe">--<\/span><span class="radar-signal-row__direction">做空<\/span><span class="radar-signal-row__score">76<\/span><span class="radar-signal-row__price">--<\/span>/);
assert.match(markup, /<time>08:00<\/time><span class="radar-signal-row__pair">BTCUSDT<\/span><span class="radar-signal-row__timeframe">5m<\/span><span class="radar-signal-row__direction">做多<\/span><span class="radar-signal-row__score">87<\/span><span class="radar-signal-row__price">63950\.25<\/span>/);
assert.match(markup, /看空|风险/);
assert.match(markup, /做空/);
assert.match(markup, /live-command__row-detail/);
assert.equal((markup.match(/>币种详情<\/button>/g) || []).length, 1);
assert.equal((markup.match(/>AIClaw 复核<\/button>/g) || []).length, 1);
assert.equal((markup.match(/>加入观察<\/button>/g) || []).length, 1);
assert.doesNotMatch(markup, /市场异动详情|策略状态|实时雷达|Yansir Crypto|ValueClaw/);
assert.doesNotMatch(markup, /Realtime Radar|Signal Detail|Signal source|Direction|Confidence|Strategy listener active|strategy signals|s ago|LONG|SHORT|NEUTRAL/);

const actionMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [addSignal, reduceSignal],
    selectedSignalId: reduceSignal.id,
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

assert.match(actionMarkup, /做多/);
assert.match(actionMarkup, /做空/);

const selectedRowIndex = markup.indexOf("ETHUSDT");
const followingRowIndex = markup.indexOf("BTCUSDT");
const inlineDetailIndex = markup.indexOf("live-command__row-detail");
assert.ok(selectedRowIndex > -1, "selected signal row should render");
assert.ok(followingRowIndex > -1, "following signal row should render");
assert.ok(inlineDetailIndex > selectedRowIndex, "signal detail should render after the selected row");
assert.ok(inlineDetailIndex < followingRowIndex, "signal detail should render before the next signal row");

const marketMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [marketSignal, baseSignal],
    selectedSignalId: marketSignal.id,
    activeFilter: "now",
    listeningStatus: "live",
    emptyState,
    now: Date.parse("2026-07-04T08:04:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(marketMarkup, /市场异动详情/);
assert.match(marketMarkup, /<span class="radar-signal-row__pair">LAB<\/span><span class="radar-signal-row__timeframe">--<\/span><span class="radar-signal-row__direction">观望<\/span><span class="radar-signal-row__score">91<\/span><span class="radar-signal-row__price">--<\/span>/);
assert.doesNotMatch(marketMarkup, /radar-signal-row__price">13\.51/);
assert.match(marketMarkup, /\+90\.67%/);
assert.match(marketMarkup, /市场事实/);
assert.match(marketMarkup, /币种详情/);
assert.match(marketMarkup, /AIClaw 复核/);
assert.doesNotMatch(marketMarkup, /策略信号详情|AI 边界|策略状态|策略追踪/);

const waitingMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [waitingStrategySignal],
    selectedSignalId: waitingStrategySignal.id,
    activeFilter: "now",
    listeningStatus: "paused",
    emptyState,
    now: Date.parse("2026-07-04T08:04:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(waitingMarkup, /radar-signal-row__direction">观望<\/span>/);
assert.match(waitingMarkup, /radar-signal-row__score">--<\/span>/);
assert.doesNotMatch(waitingMarkup, /96\/100/);

const manySignals = Array.from({ length: 35 }, (_, index) =>
  module.toLiveSignal(
    {
      id: `many-${index}`,
      symbol: `SYM${index}`,
      direction: "BUY",
      score: 70 + (index % 10),
      strategyName: "Yansir 策略引擎",
      trigger: `第 ${index} 个策略信号`,
      generatedAt: new Date(Date.parse("2026-07-04T08:00:00.000Z") + index * 60_000).toISOString(),
    },
    index,
  ),
);

const pagedMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: manySignals,
    activeFilter: "now",
    listeningStatus: "live",
    emptyState,
    now: Date.parse("2026-07-04T09:00:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.equal((pagedMarkup.match(/live-command__row is-/g) || []).length, 30);
assert.match(pagedMarkup, /继续下滑加载更多 · 已显示 30\/35/);
assert.match(pagedMarkup, /SYM34/);
assert.doesNotMatch(pagedMarkup, /SYM4<\/strong>/);


console.log("live signal command tests passed");
