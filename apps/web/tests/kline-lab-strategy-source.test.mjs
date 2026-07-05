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

assert.match(viewSource, /function\s+StrategyOutputPanel\b/, "KlineLabView should render a primary strategy output panel");
assert.ok(viewSource.includes("策略输出"), "the primary strategy output panel should use the clean label 策略输出");
assert.match(
  viewSource,
  /<StrategyOutputPanel[\s\S]*signals=\{strategyRunSignals\}[\s\S]*diagnostics=\{strategyDiagnostics\}/,
  "StrategyOutputPanel should render backend signals and diagnostics as the source of truth"
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
