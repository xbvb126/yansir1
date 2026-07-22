import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "..");

const packageJson = JSON.parse(readFileSync(path.join(webRoot, "package.json"), "utf8"));
const viewSource = readFileSync(path.join(webRoot, "src", "features", "klineLab", "KlineLabView.tsx"), "utf8");
const helperSource = readFileSync(path.join(webRoot, "src", "features", "klineLab", "klineConfirmation.ts"), "utf8");

assert.equal(
  packageJson.scripts["test:kline-strategy-source"],
  "node tests/kline-lab-strategy-source.test.mjs",
  "package.json should expose the K-line strategy source contract test"
);

assert.match(
  viewSource,
  /import\s+\{[^}]*apiPost[^}]*\}\s+from\s+["']\.\.\/\.\.\/lib\/api["']/,
  "KlineLabView should import apiPost from the API helpers"
);

assert.match(
  viewSource,
  /apiPost<\s*StrategyRunResponse\s*>\(\s*["']\/api\/strategy\/run["']/,
  "KlineLabView should call the backend /api/strategy/run endpoint"
);
assert.ok(
  viewSource.includes("STRATEGY_MTF_TIMEFRAME") && viewSource.includes("STRATEGY_HTF_TIMEFRAME"),
  "KlineLabView should define explicit MTF/HTF strategy timeframes"
);
assert.match(
  viewSource,
  /mtf_timeframe:\s*STRATEGY_MTF_TIMEFRAME/,
  "KlineLabView should send the strategy MTF timeframe to the backend"
);
assert.match(
  viewSource,
  /htf_timeframe:\s*STRATEGY_HTF_TIMEFRAME/,
  "KlineLabView should send the strategy HTF timeframe to the backend"
);
assert.match(
  viewSource,
  /mtf_candles:\s*mtfCandles/,
  "KlineLabView should send MTF candles to the backend strategy run"
);
assert.match(
  viewSource,
  /htf_candles:\s*htfCandles/,
  "KlineLabView should send HTF candles to the backend strategy run"
);
assert.match(
  viewSource,
  /ensureStrategyTimeframeCandles/,
  "KlineLabView should load missing MTF/HTF candles before running the backend strategy"
);
assert.match(
  viewSource,
  /strategyRunTriggerKey/,
  "KlineLabView should derive a stable strategy run trigger key"
);
assert.match(
  viewSource,
  /\},\s*\[canRequestInbox,\s*symbol,\s*timeframe,\s*strategyRunTriggerKey,\s*refreshNonce\]\);/,
  "backend strategy runs should be keyed by a stable candle boundary trigger"
);
assert.doesNotMatch(
  viewSource,
  /\},\s*\[canRequestInbox,\s*symbol,\s*timeframe,\s*candles,\s*refreshNonce\]\);/,
  "backend strategy runs should not depend on the full candles array because live price ticks update it frequently"
);

assert.match(viewSource, /type\s+StrategyDiagnostics\s*=/, "KlineLabView should model backend StrategyDiagnostics");
assert.match(viewSource, /diagnostics\??:/, "KlineLabView should type or handle diagnostics from the strategy result");
assert.match(viewSource, /strategyDiagnostics/, "KlineLabView should keep backend diagnostics in state");
assert.match(viewSource, /strategyRunSignals/, "KlineLabView should keep backend strategy run signals in state");
assert.match(viewSource, /strategyRunState/, "KlineLabView should track backend strategy run loading state");
assert.match(viewSource, /type\s+StrategyTimelineSignal\s*=/, "KlineLabView should model backend strategy signal timeline entries");
assert.match(
  viewSource,
  /signal_timeline\??:\s*StrategyTimelineSignal\[\]/,
  "StrategyDiagnostics should expose the backend signal_timeline for TradingView parity checks"
);

assert.match(viewSource, /function\s+StrategyOutputPanel\b/, "KlineLabView should render a primary strategy output panel");
assert.ok(viewSource.includes("策略输出"), "the primary strategy output panel should use the clean label 策略输出");
assert.ok(
  viewSource.includes("后端已完成诊断"),
  "the K-line lab badge should distinguish backend diagnostics from missing strategy output"
);
assert.ok(
  viewSource.includes("0 条信号"),
  "the strategy output panel should show a zero-signal backend result instead of an empty placeholder"
);
assert.ok(
  viewSource.includes("本周期后端策略未触发交易信号"),
  "the strategy output panel should explain that backend diagnostics can validly return no trade signal"
);
assert.ok(
  viewSource.includes("buildStrategyMarkers"),
  "KlineLabView should build a strategy marker layer for the K-line chart"
);
assert.ok(
  viewSource.includes("kline-strategy-marker"),
  "KlineChart should render visible strategy markers over the candles"
);
assert.ok(
  viewSource.includes("StrategyOverlays"),
  "KlineLabView should model backend strategy overlays"
);
assert.ok(
  viewSource.includes("kline-strategy-zone"),
  "KlineChart should render backend support/resistance zones"
);
assert.ok(
  viewSource.includes("kline-risk-line"),
  "KlineChart should render backend stop-loss and take-profit risk lines"
);
assert.ok(
  viewSource.includes("kline-extreme-band"),
  "KlineChart should render backend reversal extreme bands"
);
assert.ok(
  viewSource.includes("无交易信号"),
  "the chart should mark a completed backend diagnostic run even when it produced zero trade signals"
);
assert.match(
  viewSource,
  /<StrategyOutputPanel[\s\S]*signals=\{strategyRunSignals\}[\s\S]*diagnostics=\{strategyDiagnostics\}/,
  "StrategyOutputPanel should render backend signals and diagnostics as the source of truth"
);
assert.match(
  viewSource,
  /<KlineChart[\s\S]*strategyOverlays=\{strategyDiagnostics\?\.overlays[\s\S]*strategySignals=\{strategyRunSignals\}[\s\S]*strategyDiagnostics=\{strategyDiagnostics\}[\s\S]*strategyStatus=\{strategyRunState\}/,
  "KlineChart should receive backend strategy overlays and output for chart layers"
);

assert.match(viewSource, /function\s+parseTradingViewParityInput\b/, "KlineLabView should parse pasted TradingView alert exports");
assert.match(viewSource, /function\s+compareTradingViewSignals\b/, "KlineLabView should compare TradingView alerts against backend signal_timeline");
assert.match(viewSource, /function\s+TradingViewParityPanel\b/, "KlineLabView should render a TradingView parity panel");
assert.ok(viewSource.includes("TradingView 对账"), "the parity panel should be visibly labeled TradingView 对账");
assert.ok(
  viewSource.includes("粘贴 TradingView webhook JSON / JSONL / CSV"),
  "the parity panel should accept pasted TradingView webhook exports"
);
assert.ok(viewSource.includes("匹配"), "the parity panel should summarize matched alerts");
assert.ok(viewSource.includes("缺失"), "the parity panel should summarize missing TradingView alerts");
assert.ok(viewSource.includes("额外"), "the parity panel should summarize extra TradingView alerts");
assert.ok(viewSource.includes("字段不一致"), "the parity panel should summarize field mismatches");

const parityOpeningTag = viewSource.match(/<TradingViewParityPanel[\s\S]*?\/>/)?.[0] ?? "";
assert.ok(parityOpeningTag, "KlineLabView should mount TradingViewParityPanel");
assert.match(
  parityOpeningTag,
  /signalTimeline=\{strategyDiagnostics\?\.signal_timeline\s*\?\?\s*\[\]\}/,
  "TradingViewParityPanel should compare against backend diagnostics.signal_timeline only"
);
assert.doesNotMatch(
  parityOpeningTag,
  /(confirmation|classifyKlineSignal|candleQualityReference|selectedSignal)/,
  "TradingViewParityPanel should not be sourced from frontend K-line quality helpers or inbox selection"
);

const strategyOutputOpeningTag = viewSource.match(/<StrategyOutputPanel[\s\S]*?\/>/)?.[0] ?? "";
assert.ok(strategyOutputOpeningTag, "KlineLabView should mount StrategyOutputPanel");

assert.match(
  viewSource,
  /const\s+\w*(?:CandleQuality|candleQuality)\w*\s*=\s*useMemo\([\s\S]*classifyKlineSignal/,
  "classifyKlineSignal should be scoped as a candle-quality reference, not a strategy signal judgment"
);
assert.ok(
  /K线质量参考|K線質量參考|candle quality reference/i.test(viewSource),
  "KlineLabView should label the frontend helper as K线质量参考 / candle quality reference"
);
assert.doesNotMatch(
  strategyOutputOpeningTag,
  /(confirmation|classifyKlineSignal|selectedSignal)/,
  "the primary strategy output panel should not be sourced from the frontend confirmation helper or inbox selection"
);

assert.match(
  helperSource,
  /K线质量|K線質量|candle quality/i,
  "klineConfirmation.ts should identify itself as a K-line candle-quality reference"
);
assert.doesNotMatch(
  helperSource,
  /"Signal presence"|"No signal"|"Watch next candle"|"LONG confirmed"|"SHORT confirmed"/,
  "klineConfirmation.ts display strings should avoid primary signal-confirmation language"
);

console.log("kline lab strategy source contract passed");
