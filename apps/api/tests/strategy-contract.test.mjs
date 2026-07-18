import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-strategy-contract");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "strategy.service.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];
const serviceSource = readFileSync(path.join(apiRoot, "src/modules/strategy/strategy.service.ts"), "utf8");

assert.match(serviceSource, /function normalizeSignalPayload/);
assert.match(serviceSource, /function signalActionFromPayload/);
assert.match(serviceSource, /action:\s*signalActionFromPayload\(payload\)/);
assert.match(serviceSource, /payload,\s*\n\s*performance:/);

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/strategy/strategy.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

const { StrategyService } = await import(pathToFileURL(outFile));

const USER_ID = "00000000-0000-0000-0000-000000000001";

const svipEntitlements = {
  plan: "SVIP",
  maxScanSymbols: 200,
  maxWatchlistSymbols: 200,
  dailySignalQuota: 2000,
  remainingSignals: 2000,
  dailyPushUsed: 0,
  dailyPushSkipped: 0,
  dailyPushFailed: 0,
  remainingDailyPushes: 2000,
  feishuAlerts: true,
  apiAccess: true,
  teamSeats: 5,
  minAlertScore: 0,
  allowedTimeframes: ["5m", "15m", "1h", "4h"],
  realtimeDelayHours: 0,
  historyDays: 180,
  maxPushPerDay: 2000,
  signalOutcomes: true
};

const diagnostics = {
  market_state_text: "long trend",
  risk_status: "reduce",
  active_engine: "pine_v6",
  current_position: "long",
  current_r: 1.7,
  remaining_position_pct: 0.65
};

const strategyResult = {
  symbol: "BTCUSDT",
  timeframe: "5m",
  bar_time: 1783230000000,
  market_state: "long_trend_no_reversal",
  diagnostics,
  metrics: {
    atr_pct: 1.23,
    rsi: 62.5
  },
  signals: [
    {
      type: "position_adjustment",
      title: "Reduce long exposure",
      engine: "pine_v6",
      side: "long",
      action: "reduce_long",
      reduce_pct: 0.35,
      price: 64000,
      stop_price: 63100,
      take_profit_price: 65100,
      score_impact: 45
    },
    {
      type: "position_adjustment",
      title: "Fresh long entry",
      engine: "pine_v6",
      side: "long",
      action: null,
      price: 64100,
      stop_price: null,
      take_profit_price: null,
      score_impact: 44
    },
    {
      type: "position_adjustment",
      title: "Reduce short exposure",
      engine: "pine_v6",
      side: "short",
      action: "reduce_short",
      reducePct: 0.2,
      price: 64200,
      stop_price: null,
      take_profit_price: 63200,
      score_impact: 43
    }
  ]
};

function usersService() {
  return {
    getCurrentUser: async () => ({ user: { id: USER_ID, plan: svipEntitlements.plan } }),
    getCurrentEntitlements: async () => ({ entitlements: svipEntitlements })
  };
}

function createService(result = strategyResult, databaseOverride = null) {
  const savedSignals = [];
  const strategyClient = {
    runStrategy: async () => result
  };
  const marketService = {
    getKlines: async (symbol, timeframe) => ({
      symbol: String(symbol || "BTCUSDT").toUpperCase(),
      timeframe: timeframe || "5m",
      source: "test-market",
      candles: [{ open_time: 1783229700000, close_time: 1783229999999, open: 1, high: 1, low: 1, close: 1, volume: 1 }]
    }),
    getRealtimeKlineTriggerSymbols: async () => ["BTCUSDT"]
  };
  const signalsService = {
    saveStrategySignals: async (signals) => {
      savedSignals.push(...signals);
      return { persisted: true, count: signals.length };
    }
  };
  const alertsService = {
    sendFeishu: async () => ({ sent: true })
  };
  const database = databaseOverride ?? {
    enabled: false,
    query: async () => []
  };
  return {
    service: new StrategyService(strategyClient, marketService, signalsService, alertsService, usersService(), database),
    savedSignals
  };
}

async function testRunStrategyPersistsActionReduceDiagnosticsAndDistinctDedupeKeys() {
  const { service, savedSignals } = createService();
  const response = await service.runStrategy({
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: [{ close: 64000 }]
  });

  assert.equal(response.result, strategyResult, "runStrategy must return the strategy result object unchanged");
  assert.equal(response.result.diagnostics, diagnostics, "diagnostics must pass through on the returned result");
  assert.equal(savedSignals.length, 3);

  const [reduceLong, freshLong, reduceShort] = savedSignals;
  assert.deepEqual(reduceLong.dedupeKey.split(":").slice(-2), ["long", "reduce_long"]);
  assert.deepEqual(freshLong.dedupeKey.split(":").slice(-2), ["long", "long"]);
  assert.equal(new Set(savedSignals.map((signal) => signal.dedupeKey)).size, savedSignals.length);

  assert.deepEqual(reduceLong.payload, {
    engine: "pine_v6",
    action: "reduce_long",
    reducePct: 0.35,
    marketState: "long_trend_no_reversal",
    diagnostics,
    metrics: strategyResult.metrics,
    stopPrice: 63100,
    takeProfitPrice: 65100
  });
  assert.equal(freshLong.payload.action, null);
  assert.equal(freshLong.payload.reducePct, null);
  assert.equal(reduceShort.payload.action, "reduce_short");
  assert.equal(reduceShort.payload.reducePct, 0.2);
  assert.equal(reduceShort.payload.diagnostics, diagnostics);
}

async function testAlertCandidatesExposeActionAndReduceReasonBranches() {
  const { service } = createService();
  const response = await service.scanAndAlert({
    symbols: ["BTC"],
    timeframe: "5m",
    minScore: 0,
    directions: ["long", "short"],
    dryRun: true
  }, USER_ID);

  const candidates = response.alert.candidates;
  assert.equal(candidates.length, 3);

  const reduceLong = candidates.find((candidate) => candidate.action === "reduce_long");
  const freshLong = candidates.find((candidate) => candidate.direction === "long" && candidate.action === undefined);
  const reduceShort = candidates.find((candidate) => candidate.action === "reduce_short");

  assert.equal(reduceLong.signalType, "position_adjustment");
  assert.match(reduceLong.reason, /reduce_long/);
  assert.equal(freshLong.signalType, "position_adjustment");
  assert.equal(freshLong.action, undefined);
  assert.doesNotMatch(freshLong.reason, /reduce_long|reduce_short/);
  assert.equal(reduceShort.signalType, "position_adjustment");
  assert.match(reduceShort.reason, /reduce_short/);
}

async function testPublicPerformanceSummaryUsesDelayedSevenDayWindow() {
  let capturedSql = "";
  const database = {
    enabled: true,
    query: async (sql) => {
      capturedSql = sql;
      return [{ total_signals: "12", completed_24h_count: "9", pending_24h_count: "3", directional_hit_rate_1h: "0.666666", average_directional_return_1h: "0.0125" }];
    }
  };
  const { service } = createService(strategyResult, database);
  const summary = await service.getPublicPerformanceSummary();
  assert.match(capturedSql, /interval '8 hours'/);
  assert.match(capturedSql, /interval '7 days'/);
  assert.match(capturedSql, /direction in \('long', 'short'\)/);
  assert.match(capturedSql, /market_observation/);
  assert.deepEqual(summary, {
    windowDays: 7,
    generatedAt: summary.generatedAt,
    methodologyVersion: "fixed-window-v1",
    totalSignals: 12,
    completed24hCount: 9,
    pending24hCount: 3,
    directionalHitRate1h: 0.666666,
    averageDirectionalReturn1h: 0.0125
  });
}

async function testPublicPerformanceSummaryIsEmptyWithoutDatabase() {
  const { service } = createService();
  const summary = await service.getPublicPerformanceSummary();
  assert.equal(summary.totalSignals, 0);
  assert.equal(summary.directionalHitRate1h, null);
}

try {
  await testRunStrategyPersistsActionReduceDiagnosticsAndDistinctDedupeKeys();
  await testAlertCandidatesExposeActionAndReduceReasonBranches();
  await testPublicPerformanceSummaryUsesDelayedSevenDayWindow();
  await testPublicPerformanceSummaryIsEmptyWithoutDatabase();
  console.log("strategy contract tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
