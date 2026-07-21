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

function createService(result = strategyResult, overrides = {}) {
  const savedSignals = [];
  const strategyCalls = [];
  const strategyClient = {
    runStrategy: async (payload) => {
      strategyCalls.push(payload);
      return typeof result === "function" ? result(payload) : result;
    }
  };
  const marketService = {
    getKlines: async (symbol, timeframe) => ({
      symbol: String(symbol || "BTCUSDT").toUpperCase(),
      timeframe: timeframe || "5m",
      source: "test-market",
      candles: [{ open_time: 1783229700000, close_time: 1783229999999, open: 1, high: 1, low: 1, close: 1, volume: 1 }]
    }),
    getRealtimeKlineTriggerSymbols: async () => {
      if (typeof overrides.marketSymbols === "function") return overrides.marketSymbols();
      return overrides.marketSymbols ?? ["BTCUSDT", "ETHUSDT", "BADUSDT"];
    }
  };
  const signalsService = overrides.signalsService ?? {
    saveStrategySignals: async (signals) => {
      savedSignals.push(...signals);
      return { persisted: true, count: signals.length };
    }
  };
  const alertsService = overrides.alertsService ?? {
    sendFeishu: async () => ({ sent: true })
  };
  const database = overrides.database ?? {
    enabled: false,
    query: async () => []
  };
  return {
    service: new StrategyService(strategyClient, marketService, signalsService, alertsService, overrides.usersService ?? usersService(), database),
    savedSignals,
    strategyCalls
  };
}

function globalStrategyResult(symbol, timeframe, withSignal = false) {
  return {
    ...strategyResult,
    symbol,
    timeframe,
    signals: withSignal ? [strategyResult.signals[0]] : []
  };
}

function createLifecycleFixture() {
  const signalEvents = new Map();
  const inbox = new Map();
  const deliveries = [];
  let nextEventId = 1;

  const signalsService = {
    saveStrategySignals: async (signals) => {
      let inserted = 0;
      for (const signal of signals) {
        if (signalEvents.has(signal.dedupeKey)) continue;
        const event = {
          id: `00000000-0000-0000-0000-${String(nextEventId++).padStart(12, "0")}`,
          dedupe_key: signal.dedupeKey,
          symbol: signal.symbol,
          timeframe: signal.timeframe,
          direction: signal.direction,
          signal_type: signal.signalType,
          title: signal.title,
          reason: signal.reason,
          engine: signal.payload.engine,
          price: String(signal.price),
          score: signal.score,
          emitted_at: signal.emittedAt,
          payload: signal.payload
        };
        signalEvents.set(signal.dedupeKey, event);
        inserted += 1;
      }
      return { persisted: true, count: inserted };
    }
  };

  const database = {
    enabled: true,
    query: async (sql, values = []) => {
      const normalizedSql = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalizedSql.includes("from signal_events") && normalizedSql.includes("dedupe_key = any")) {
        return values[0].flatMap((key) => signalEvents.has(key) ? [signalEvents.get(key)] : []);
      }
      if (normalizedSql.includes("from watchlists") && normalizedSql.includes("min_score <=")) {
        return [{
          id: "00000000-0000-0000-0000-000000000010",
          user_id: USER_ID,
          symbol: values[0],
          timeframes: [values[1]],
          enabled: true,
          min_score: 0,
          signal_scope: "all",
          push_enabled: true,
          created_at: new Date("2026-07-21T00:00:00.000Z"),
          updated_at: new Date("2026-07-21T00:00:00.000Z"),
          disabled_at: null
        }];
      }
      if (normalizedSql.startsWith("insert into user_signal_inbox")) {
        const key = `${values[0]}:${values[1]}`;
        if (inbox.has(key)) return [];
        const row = { id: `inbox-${inbox.size + 1}`, user_id: values[0], signal_event_id: values[1] };
        inbox.set(key, row);
        return [{ id: row.id }];
      }
      if (normalizedSql.includes("from users u") && normalizedSql.includes("user_push_settings")) {
        return [{
          enabled: true,
          min_score: 0,
          cooldown_minutes: 0,
          target_encrypted: "https://example.test/webhook",
          target_masked: "https://example.test/***",
          binding_webhook_url: null
        }];
      }
      if (normalizedSql.includes("from alert_rules")) {
        return [{
          symbols: ["BTCUSDT"],
          timeframe: "5m",
          min_score: 0,
          directions: ["long", "short"],
          cooldown_minutes: 0,
          interval_seconds: 300
        }];
      }
      if (normalizedSql.includes("count(*)::text as sent_count") && normalizedSql.includes("from alert_deliveries")) {
        return [{ sent_count: deliveries.filter((delivery) => delivery.status === "sent").length }];
      }
      if (normalizedSql.includes("from signal_delivery_cooldowns")) return [{ in_cooldown: false }];
      if (normalizedSql.startsWith("insert into alert_deliveries")) {
        deliveries.push({
          user_id: values[0],
          signal_event_id: values[1],
          channel: "feishu",
          status: "sent"
        });
        return [];
      }
      if (normalizedSql.startsWith("insert into signal_delivery_cooldowns")) return [];
      throw new Error(`Unhandled test query: ${normalizedSql}`);
    }
  };

  const alertsService = {
    sendFeishu: async (candidate, userId) => {
      await database.query(
        "insert into alert_deliveries (user_id, signal_event_id, channel, status) values ($1, $2, 'feishu', 'sent')",
        [userId, candidate.signalEventId]
      );
      return { sent: true };
    }
  };

  return { alertsService, database, deliveries, inbox, signalEvents, signalsService };
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

async function testGlobalScanRunsTheFullMarketWithBoundedPartialFailure() {
  const previousConcurrency = process.env.STRATEGY_GLOBAL_SCAN_CONCURRENCY;
  process.env.STRATEGY_GLOBAL_SCAN_CONCURRENCY = "2";
  let active = 0;
  let maxActive = 0;
  try {
    const { service, strategyCalls } = createService(async ({ symbol, timeframe }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (symbol === "BADUSDT") throw new Error("strategy unavailable");
      return globalStrategyResult(symbol, timeframe, symbol === "BTCUSDT");
    });

    const result = await service["runGlobalScanSlot"]({
      key: "2026-07-21T14:15:00.000Z",
      closedAt: new Date("2026-07-21T14:15:00.000Z"),
      runAt: new Date("2026-07-21T14:15:05.000Z"),
      timeframes: ["5m", "15m"]
    });

    assert.equal(result.scannedSymbols, 3);
    assert.equal(result.matchedSignals, 2);
    assert.equal(result.failedSymbols, 1);
    assert.equal(result.errors.length, 2);
    assert.ok(maxActive <= 2, `expected at most two concurrent strategy jobs, saw ${maxActive}`);
    assert.deepEqual(strategyCalls.map(({ symbol, timeframe }) => `${symbol}:${timeframe}`).sort(), [
      "BADUSDT:15m", "BADUSDT:5m", "BTCUSDT:15m", "BTCUSDT:5m", "ETHUSDT:15m", "ETHUSDT:5m"
    ]);
  } finally {
    if (previousConcurrency === undefined) delete process.env.STRATEGY_GLOBAL_SCAN_CONCURRENCY;
    else process.env.STRATEGY_GLOBAL_SCAN_CONCURRENCY = previousConcurrency;
  }
}

async function testGlobalScanIsIndependentOfUserScanEntitlements() {
  const deniedUsersService = usersService();
  deniedUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, apiAccess: false, remainingSignals: 0 }
  });
  const { service, strategyCalls } = createService(
    ({ symbol, timeframe }) => globalStrategyResult(symbol, timeframe, false),
    { marketSymbols: ["BTCUSDT"], usersService: deniedUsersService }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.scannedSymbols, 1);
  assert.equal(strategyCalls.length, 1);
}

async function testGlobalScanRejectsEmptyDiscoveryWithoutFallback() {
  const { service, strategyCalls } = createService(strategyResult, { marketSymbols: [] });
  await assert.rejects(
    service["runGlobalScanSlot"]({
      key: "2026-07-21T14:05:00.000Z",
      closedAt: new Date("2026-07-21T14:05:00.000Z"),
      runAt: new Date("2026-07-21T14:05:05.000Z"),
      timeframes: ["5m"]
    }),
    /global_scan_symbols_unavailable/
  );
  assert.equal(strategyCalls.length, 0);
}

async function testGlobalScanRejectsDiscoveryFailureWithoutFallback() {
  const { service, strategyCalls } = createService(strategyResult, {
    marketSymbols: async () => { throw new Error("binance unavailable"); }
  });
  await assert.rejects(
    service["runGlobalScanSlot"]({
      key: "2026-07-21T14:05:00.000Z",
      closedAt: new Date("2026-07-21T14:05:00.000Z"),
      runAt: new Date("2026-07-21T14:05:05.000Z"),
      timeframes: ["5m"]
    }),
    /global_scan_symbols_unavailable/
  );
  assert.equal(strategyCalls.length, 0);
}

async function testGlobalScanCapsErrorsAndCountsFailedSymbolsOnce() {
  const marketSymbols = ["A", "B", "C", "D", "E"];
  const { service } = createService(async () => { throw new Error("failed"); }, { marketSymbols });
  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:15:00.000Z",
    closedAt: new Date("2026-07-21T14:15:00.000Z"),
    runAt: new Date("2026-07-21T14:15:05.000Z"),
    timeframes: ["5m", "15m"]
  });

  assert.equal(result.failedSymbols, 5);
  assert.equal(result.errors.length, 8);
}

async function testGlobalScanPersistsAndDeliversEachMatchOnce() {
  const fixture = createLifecycleFixture();
  const { service } = createService(
    ({ symbol, timeframe }) => globalStrategyResult(symbol, timeframe, true),
    { ...fixture, marketSymbols: ["BTCUSDT"] }
  );
  const slot = {
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  };

  await service["runGlobalScanSlot"](slot);
  await service["runGlobalScanSlot"](slot);

  assert.equal(fixture.signalEvents.size, 1);
  assert.equal(fixture.inbox.size, 1);
  const sentKeys = fixture.deliveries
    .filter((delivery) => delivery.status === "sent")
    .map(({ user_id, signal_event_id, channel }) => `${user_id}:${signal_event_id}:${channel}`);
  assert.equal(sentKeys.length, 1);
  assert.equal(new Set(sentKeys).size, sentKeys.length);
}

async function testGlobalScannerHonorsOptOutAndStopsOnShutdown() {
  const previousEnabled = process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  const cleared = new Set();
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { cleared.add(timer); };

  try {
    process.env.STRATEGY_GLOBAL_SCAN_ENABLED = "false";
    const disabled = createService().service;
    disabled.onModuleInit();
    assert.equal(disabled.getGlobalScanStatus().enabled, false);

    delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    const enabled = createService().service;
    enabled.onModuleInit();
    assert.equal(enabled.getGlobalScanStatus().enabled, true);
    assert.ok(enabled.getGlobalScanStatus().nextRunAt);
    enabled.onModuleDestroy();
    assert.equal(enabled.getGlobalScanStatus().enabled, false);
    assert.equal(enabled.getGlobalScanStatus().nextRunAt, null);
    assert.ok(cleared.size >= 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (previousEnabled === undefined) delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    else process.env.STRATEGY_GLOBAL_SCAN_ENABLED = previousEnabled;
  }
}

try {
  await testRunStrategyPersistsActionReduceDiagnosticsAndDistinctDedupeKeys();
  await testAlertCandidatesExposeActionAndReduceReasonBranches();
  await testGlobalScanRunsTheFullMarketWithBoundedPartialFailure();
  await testGlobalScanIsIndependentOfUserScanEntitlements();
  await testGlobalScanRejectsEmptyDiscoveryWithoutFallback();
  await testGlobalScanRejectsDiscoveryFailureWithoutFallback();
  await testGlobalScanCapsErrorsAndCountsFailedSymbolsOnce();
  await testGlobalScanPersistsAndDeliversEachMatchOnce();
  await testGlobalScannerHonorsOptOutAndStopsOnShutdown();
  console.log("strategy contract tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
