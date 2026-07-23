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
const controllerSource = readFileSync(path.join(apiRoot, "src/modules/strategy/strategy.controller.ts"), "utf8");

assert.match(serviceSource, /function normalizeSignalPayload/);
assert.match(serviceSource, /function signalActionFromPayload/);
assert.match(serviceSource, /action:\s*signalActionFromPayload\(payload\)/);
assert.match(serviceSource, /payload,\s*\n\s*performance:/);
assert.match(controllerSource, /@Get\("scan\/global\/status"\)/);
assert.ok(
  controllerSource.indexOf('@Get("scan/global/status")') < controllerSource.indexOf('@Post("scan/schedule/start")'),
  "global scanner status must be declared before user schedule routes"
);

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/strategy/strategy.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

const {
  StrategyService,
  buildRealtimeStreamUrl,
  normalizeRealtimeSymbols,
  resolveRuntimeWebSocketCtor
} = await import(pathToFileURL(outFile));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const USER_TWO_ID = "00000000-0000-0000-0000-000000000002";

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
  allowedTimeframes: ["5m", "15m", "30m", "1h", "4h"],
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
  const marketCalls = [];
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
    getStrictKlinesBefore: async (symbol, timeframe, endTime, limit) => {
      const duration = timeframeDurationMs(timeframe);
      const closedAt = endTime + 1;
      const lastOpenTime = Math.floor(closedAt / duration) * duration - duration;
      const defaultResult = {
        symbol: String(symbol || "BTCUSDT").toUpperCase(),
        timeframe,
        source: "binance",
        candles: [{
          open_time: lastOpenTime,
          close_time: lastOpenTime + duration - 1,
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1
        }]
      };
      const call = { symbol, timeframe, endTime, limit };
      marketCalls.push(call);
      return typeof overrides.strictKlines === "function"
        ? overrides.strictKlines(call, defaultResult)
        : defaultResult;
    },
    getRealtimeKlineTriggerSymbols: async () => overrides.compatibleMarketSymbols ?? ["FALLBACKUSDT"],
    getStrictRealtimeKlineTriggerSymbols: async () => {
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
  const closeEvaluations = overrides.closeEvaluations ?? {
    reserve: async () => ({ id: "close-evaluation-1", attempts: 1 }),
    complete: async () => {},
    fail: async () => {}
  };
  return {
    service: new StrategyService(strategyClient, marketService, signalsService, alertsService, overrides.usersService ?? usersService(), database, closeEvaluations),
    savedSignals,
    strategyCalls,
    marketCalls
  };
}

function realtimeJob(symbol = "BTCUSDT", timeframe = "5m", closedAt = "2026-07-23T03:50:00.000Z") {
  const closed = new Date(closedAt);
  const klineOpenTime = closed.getTime() - timeframeDurationMs(timeframe);
  return {
    key: `${symbol}:${timeframe}:${klineOpenTime}`,
    symbol,
    timeframe,
    klineOpenTime,
    closedAt: closed,
    enqueuedAt: new Date(closed.getTime() + 500),
    source: "realtime"
  };
}

function closeEvaluationFixture() {
  const completed = [];
  const failed = [];
  const reservations = new Set();
  return {
    completed,
    failed,
    repository: {
      reserve: async (job) => {
        if (reservations.has(job.key)) return null;
        reservations.add(job.key);
        return { id: `evaluation-${reservations.size}`, attempts: 1 };
      },
      complete: async (id, signalCount, finishedAt) => { completed.push({ id, signalCount, finishedAt }); },
      fail: async (id, error, finishedAt) => { failed.push({ id, error, finishedAt }); }
    }
  };
}

function globalStrategyResult(symbol, timeframe, withSignal = false, barTime = strategyResult.bar_time) {
  return {
    ...strategyResult,
    symbol,
    timeframe,
    bar_time: barTime,
    signals: withSignal ? [strategyResult.signals[0]] : []
  };
}

function timeframeDurationMs(timeframe) {
  const match = /^(\d+)(m|h)$/.exec(String(timeframe));
  if (!match) throw new Error(`Unsupported test timeframe: ${timeframe}`);
  return Number(match[1]) * (match[2] === "h" ? 60 : 1) * 60_000;
}

function createLifecycleFixture({ cooldownMinutes = 0, pushEnabled = true } = {}) {
  const signalEvents = new Map();
  const inbox = new Map();
  const deliveries = [];
  const cooldowns = new Set();
  const alertCalls = [];
  let nextEventId = 1;

  const signalsService = {
    saveStrategySignals: async (signals) => {
      let inserted = 0;
      for (const signal of signals) {
        if (signalEvents.has(signal.dedupeKey)) {
          inserted += 1;
          continue;
        }
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

  async function executeQuery(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
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
          enabled: pushEnabled,
          min_score: 0,
          cooldown_minutes: cooldownMinutes,
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
      if (normalizedSql.startsWith("select status") && normalizedSql.includes("from alert_deliveries")) {
        const existing = deliveries.find((delivery) =>
          delivery.user_id === values[0]
          && delivery.signal_event_id === values[1]
          && delivery.channel === values[2]
        );
        return existing ? [{ status: existing.status }] : [];
      }
      if (normalizedSql.includes("count(*)::text as sent_count") && normalizedSql.includes("from alert_deliveries")) {
        return [{
          sent_count: deliveries.filter((delivery) =>
            delivery.user_id === values[0]
            && delivery.channel === values[1]
            && ["sending", "sent"].includes(delivery.status)
          ).length
        }];
      }
      if (normalizedSql.includes("from signal_delivery_cooldowns")) {
        const key = values.slice(0, 6).join(":");
        const occupiedByDelivery = deliveries.some((delivery) =>
          delivery.user_id === values[0]
          && delivery.channel === values[1]
          && delivery.symbol === values[2]
          && delivery.timeframe === values[3]
          && delivery.direction === values[4]
          && delivery.signal_type === values[5]
          && ["sending", "sent"].includes(delivery.status)
        );
        return [{ in_cooldown: cooldowns.has(key) || occupiedByDelivery }];
      }
      if (normalizedSql.startsWith("insert into alert_deliveries")) {
        const skipped = normalizedSql.includes("'skipped'");
        const sending = normalizedSql.includes("'sending'");
        const delivery = {
          user_id: values[0],
          signal_event_id: values[1],
          channel: "feishu",
          symbol: values[2],
          timeframe: values[3],
          direction: values[4],
          signal_type: values[5],
          status: skipped ? "skipped" : sending ? "sending" : "sent",
          reason: skipped ? values[8] : null
        };
        const existing = deliveries.find((item) =>
          item.user_id === delivery.user_id
          && item.signal_event_id === delivery.signal_event_id
          && item.channel === delivery.channel
        );
        if (!existing) {
          deliveries.push(delivery);
          return sending ? [{ id: `delivery-${deliveries.length}` }] : [];
        }
        if (existing.status !== "sent" || !skipped) Object.assign(existing, delivery);
        return [];
      }
      if (normalizedSql.startsWith("update alert_deliveries")) {
        const existing = deliveries.find((delivery) =>
          delivery.user_id === values[0]
          && delivery.signal_event_id === values[1]
          && delivery.channel === values[2]
          && delivery.status === "sending"
        );
        if (!existing) return [];
        existing.status = values[3];
        existing.reason = values[5] ?? null;
        return [{ id: `delivery-${deliveries.indexOf(existing) + 1}` }];
      }
      if (normalizedSql.startsWith("insert into signal_delivery_cooldowns")) {
        cooldowns.add(values.slice(0, 6).join(":"));
        return [];
      }
      throw new Error(`Unhandled test query: ${normalizedSql}`);
  }

  const database = {
    enabled: true,
    advisoryTails: new Map(),
    advisoryActive: 0,
    ordinaryQueriesInsideAdvisory: 0,
    advisoryReleases: 0,
    async query(sql, values = []) {
      if (this.advisoryActive > 0) this.ordinaryQueriesInsideAdvisory += 1;
      return executeQuery(sql, values);
    },
    async queryStrict(sql, values = []) {
      if (this.advisoryActive > 0) this.ordinaryQueriesInsideAdvisory += 1;
      return executeQuery(sql, values);
    },
    async withTransaction(operation) {
      return operation({ query: executeQuery });
    },
    async withAdvisoryTransaction(key, operation) {
      const previous = this.advisoryTails.get(key) ?? Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const tail = previous.catch(() => undefined).then(() => gate);
      this.advisoryTails.set(key, tail);
      await previous.catch(() => undefined);
      this.advisoryActive += 1;
      try {
        return await operation({ query: executeQuery });
      } finally {
        this.advisoryActive -= 1;
        this.advisoryReleases += 1;
        release();
        if (this.advisoryTails.get(key) === tail) this.advisoryTails.delete(key);
      }
    }
  };

  const alertsService = {
    sendFeishu: async (candidate, userId, options) => {
      alertCalls.push({ candidate, userId, options, advisoryActive: database.advisoryActive });
      return { sent: true };
    }
  };

  return { alertCalls, alertsService, cooldowns, database, deliveries, inbox, signalEvents, signalsService };
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
    const fixture = createLifecycleFixture();
    const { service, strategyCalls } = createService(async ({ symbol, timeframe, candles }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (symbol === "BADUSDT") throw new Error("strategy unavailable");
      return globalStrategyResult(symbol, timeframe, symbol === "BTCUSDT", candles.at(-1).open_time);
    }, fixture);

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
    assert.equal(maxActive, 4, "two symbol workers must be able to evaluate both due timeframes without reducing symbol throughput");
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
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time),
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

async function testGlobalScanUsesOnlyClosedAuthoritativeCandlesAndDeduplicatesRequests() {
  const closedAt = new Date("2026-07-21T16:00:00.000Z");
  const dueTimeframes = ["5m", "15m", "30m", "1h", "4h"];
  const { service, marketCalls, strategyCalls } = createService(
    ({ symbol, timeframe, candles, mtf_candles: mtfCandles, htf_candles: htfCandles, market_data_source: source }) => {
      const expectedBarTime = closedAt.getTime() - timeframeDurationMs(timeframe);
      assert.equal(source, "binance");
      assert.equal(candles.at(-1).open_time, expectedBarTime, `${timeframe} must evaluate the candle closed at the slot`);
      assert.ok(
        [...candles, ...mtfCandles, ...htfCandles].every((candle) => candle.close_time < closedAt.getTime()),
        `${timeframe} base/context candles must all be closed before the slot cutoff`
      );
      return globalStrategyResult(symbol, timeframe, false, expectedBarTime);
    },
    {
      marketSymbols: ["BTCUSDT"],
      strictKlines: (_call, result) => ({
        ...result,
        candles: [
          ...result.candles,
          {
            open_time: closedAt.getTime(),
            close_time: closedAt.getTime() + timeframeDurationMs(result.timeframe) - 1,
            open: 2,
            high: 2,
            low: 2,
            close: 2,
            volume: 2
          }
        ]
      })
    }
  );

  const result = await service["runGlobalScanSlot"]({
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAt.getTime() + 5_000),
    timeframes: dueTimeframes
  });

  assert.equal(result.failedSymbols, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(strategyCalls.length, dueTimeframes.length);
  assert.equal(marketCalls.length, dueTimeframes.length, "five due jobs should share the five unique symbol/timeframe requests instead of issuing fifteen");
  assert.deepEqual(new Set(marketCalls.map(({ timeframe }) => timeframe)), new Set(dueTimeframes));
  assert.ok(marketCalls.every(({ endTime }) => endTime === closedAt.getTime() - 1));
}

async function testGlobalScanRejectsFixtureOrMixedMarketSourcesBeforeStrategyExecution() {
  const fixture = createLifecycleFixture();
  const { service, strategyCalls } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    {
      ...fixture,
      marketSymbols: ["BTCUSDT"],
      strictKlines: (_call, result) => result.timeframe === "1h" ? { ...result, source: "fixture" } : result
    }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /non_authoritative_market_data/);
  assert.equal(strategyCalls.length, 0);
  assert.equal(fixture.signalEvents.size, 0);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanRejectsUnexpectedResultBarBeforePersistence() {
  const fixture = createLifecycleFixture();
  const closedAt = new Date("2026-07-21T14:05:00.000Z");
  const { service } = createService(
    ({ symbol, timeframe }) => globalStrategyResult(symbol, timeframe, true, closedAt.getTime()),
    { ...fixture, marketSymbols: ["BTCUSDT"] }
  );

  const result = await service["runGlobalScanSlot"]({
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAt.getTime() + 5_000),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /unexpected_global_scan_bar_time/);
  assert.equal(fixture.signalEvents.size, 0);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanTreatsUnpersistedSignalsAsFailedFormalJobs() {
  const fixture = createLifecycleFixture();
  const signalsService = {
    saveStrategySignals: async () => ({ persisted: false, count: 0 })
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, signalsService, marketSymbols: ["BTCUSDT"] }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /signal_persistence_unavailable/);
  assert.equal(fixture.signalEvents.size, 0);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanRequiresStrictConfiguredDatabasePersistence() {
  const fixture = createLifecycleFixture();
  const signalsService = {
    saveStrategySignals: async (signals, options) => {
      if (options?.strict) throw new Error("configured_database_write_failed");
      return { persisted: true, count: signals.length };
    }
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, signalsService, marketSymbols: ["BTCUSDT"] }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /configured_database_write_failed/);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanRejectsPersistedCountMismatch() {
  const fixture = createLifecycleFixture();
  const signalsService = {
    saveStrategySignals: async () => ({ persisted: true, count: 0 })
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, signalsService, marketSymbols: ["BTCUSDT"] }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /signal_persistence_incomplete/);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanRejectsIncompleteStrictEventLookup() {
  const fixture = createLifecycleFixture();
  const compatibleQueryStrict = fixture.database.queryStrict.bind(fixture.database);
  fixture.database.queryStrict = async (sql, values = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalizedSql.includes("from signal_events") && normalizedSql.includes("dedupe_key = any")) return [];
    return compatibleQueryStrict(sql, values);
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, marketSymbols: ["BTCUSDT"] }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /signal_event_lookup_incomplete/);
  assert.equal(fixture.signalEvents.size, 1, "persistence completed before the lookup health failure");
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testGlobalScanFuturesFailureCreatesNoFormalLifecycle() {
  const fixture = createLifecycleFixture();
  const { service, strategyCalls } = createService(strategyResult, {
    ...fixture,
    marketSymbols: ["BTCUSDT"],
    strictKlines: async () => { throw new Error("authoritative_market_data_unavailable:BTCUSDT:5m:futures"); }
  });

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 0);
  assert.equal(result.failedSymbols, 1);
  assert.match(result.errors[0], /authoritative_market_data_unavailable/);
  assert.equal(strategyCalls.length, 0);
  assert.equal(fixture.signalEvents.size, 0);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
}

async function testRealtimeFormalExecutorUsesOnlyTheClosedCandleAndDeliversOnce() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service, marketCalls, strategyCalls } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );
  const job = realtimeJob("BTCUSDT", "5m", "2026-07-23T03:50:00.000Z");

  const outcome = await service["executeFormalSignalJob"](job);

  assert.equal(outcome.status, "completed");
  assert.equal(marketCalls[0].endTime, job.closedAt.getTime() - 1);
  assert.equal(strategyCalls[0].candles.at(-1).open_time, job.klineOpenTime);
  assert.equal(fixture.signalEvents.size, 1);
  assert.equal(fixture.inbox.size, 1);
  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
  assert.deepEqual(evaluations.completed.map(({ signalCount }) => signalCount), [1]);
}

async function testRealtimeFormalExecutorRejectsTheNewlyOpenedBar() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(
      symbol,
      timeframe,
      true,
      candles.at(-1).open_time + timeframeDurationMs(timeframe)
    ),
    { ...fixture, closeEvaluations: evaluations.repository }
  );

  const outcome = await service["executeFormalSignalJob"](realtimeJob());

  assert.equal(outcome.status, "failed");
  assert.match(outcome.error, /unexpected_formal_bar_time/);
  assert.equal(fixture.signalEvents.size, 0);
  assert.equal(fixture.inbox.size, 0);
  assert.deepEqual(evaluations.completed, []);
  assert.equal(evaluations.failed.length, 1);
}

async function testRealtimeFormalExecutorDoesNotDeliverUnpersistedSignals() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const signalsService = {
    saveStrategySignals: async () => ({ persisted: false, count: 0 })
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository, signalsService }
  );

  const outcome = await service["executeFormalSignalJob"](realtimeJob());

  assert.equal(outcome.status, "failed");
  assert.match(outcome.error, /signal_persistence_unavailable/);
  assert.equal(fixture.inbox.size, 0);
  assert.equal(fixture.deliveries.length, 0);
  assert.equal(evaluations.failed.length, 1);
}

async function testRealtimeFormalExecutorCompletesZeroSignalEvaluation() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );

  const outcome = await service["executeFormalSignalJob"](realtimeJob());

  assert.equal(outcome.status, "completed");
  assert.equal(outcome.signalCount, 0);
  assert.deepEqual(evaluations.completed.map(({ signalCount }) => signalCount), [0]);
  assert.equal(fixture.inbox.size, 0);
}

async function testRealtimeFormalExecutorSkipsDuplicateJobs() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service, strategyCalls } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );
  const job = realtimeJob();

  const first = await service["executeFormalSignalJob"](job);
  const second = await service["executeFormalSignalJob"](job);

  assert.equal(first.status, "completed");
  assert.equal(second.status, "duplicate");
  assert.equal(strategyCalls.length, 1);
}

async function testReconciledSignalsCreateInboxButSkipPushesOlderThanFiveMinutes() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );
  const job = { ...realtimeJob(), source: "reconciliation" };
  const originalDateNow = Date.now;
  Date.now = () => job.closedAt.getTime() + 6 * 60_000;
  try {
    const outcome = await service["executeFormalSignalJob"](job);
    assert.equal(outcome.status, "completed");
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(fixture.inbox.size, 1, "a reconciled signal must remain visible in the idempotent inbox");
  assert.deepEqual(
    fixture.deliveries.map(({ status, reason }) => ({ status, reason })),
    [{ status: "skipped", reason: "reconciliation_too_old" }]
  );
  assert.equal(fixture.alertCalls.length, 0, "late reconciliation must not reserve or call Feishu");
}

async function testRecentReconciledSignalsRemainEligibleForPush() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );
  const job = { ...realtimeJob(), source: "reconciliation" };
  const originalDateNow = Date.now;
  Date.now = () => job.closedAt.getTime() + 4 * 60_000;
  try {
    const outcome = await service["executeFormalSignalJob"](job);
    assert.equal(outcome.status, "completed");
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(fixture.inbox.size, 1);
  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
  assert.equal(fixture.alertCalls.length, 1);
}

async function testRealtimeStatusExposesFormalPipelineTelemetry() {
  const evaluations = closeEvaluationFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time),
    { closeEvaluations: evaluations.repository }
  );
  const job = realtimeJob();

  assert.equal(service["formalSignalQueue"].enqueue(job), "accepted");
  for (let attempt = 0; attempt < 50 && service.getRealtimeStatus().formalPipeline.queue.completed !== 1; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const { formalPipeline } = service.getRealtimeStatus();
  assert.equal(formalPipeline.queue.completed, 1);
  assert.equal(formalPipeline.queue.failed, 0);
  assert.equal(formalPipeline.recentSuccesses, 1);
  assert.equal(formalPipeline.recentFailures, 0);
  assert.match(formalPipeline.latestSuccessfulCalculationAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(formalPipeline.latestPersistenceAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(formalPipeline.latestFailure, null);
}

async function testFormalPipelineRecordsReserveRejection() {
  const { service } = createService(strategyResult, {
    closeEvaluations: {
      reserve: async () => { throw new Error("evaluation reservation unavailable"); },
      complete: async () => {},
      fail: async () => {}
    }
  });
  const job = realtimeJob();

  assert.equal(service["formalSignalQueue"].enqueue(job), "accepted");
  for (let attempt = 0; attempt < 50 && service.getRealtimeStatus().formalPipeline.queue.failed !== 1; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const { formalPipeline } = service.getRealtimeStatus();
  assert.equal(formalPipeline.queue.failed, 1);
  assert.equal(formalPipeline.recentFailures, 1);
  assert.match(formalPipeline.latestFailure?.error ?? "", /evaluation reservation unavailable/);
}

async function testFormalPipelineRecordsFailureWhenLedgerFailWriteRejects() {
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    {
      signalsService: { saveStrategySignals: async () => ({ persisted: false, count: 0 }) },
      closeEvaluations: {
        reserve: async () => ({ id: "close-evaluation-1", attempts: 1 }),
        complete: async () => {},
        fail: async () => { throw new Error("evaluation failure write unavailable"); }
      }
    }
  );
  const job = realtimeJob();

  assert.equal(service["formalSignalQueue"].enqueue(job), "accepted");
  for (let attempt = 0; attempt < 50 && service.getRealtimeStatus().formalPipeline.queue.failed !== 1; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const { formalPipeline } = service.getRealtimeStatus();
  assert.equal(formalPipeline.queue.failed, 1);
  assert.equal(formalPipeline.recentFailures, 1);
  assert.match(formalPipeline.latestFailure?.error ?? "", /signal_persistence_unavailable/);
}

function deliveryEvent(id, overrides = {}) {
  return {
    id,
    symbol: "BTCUSDT",
    timeframe: "5m",
    direction: "long",
    signal_type: "trend_long_signal",
    title: "Concurrent signal",
    reason: "test",
    engine: "pine_v6",
    price: "64000",
    score: 90,
    emitted_at: new Date("2026-07-21T14:05:00.000Z"),
    payload: {},
    ...overrides
  };
}

function deliveryWatchlist() {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: USER_ID,
    symbol: "BTCUSDT",
    timeframes: ["5m"],
    enabled: true,
    min_score: 0,
    signal_scope: "all",
    push_enabled: true,
    created_at: new Date("2026-07-21T00:00:00.000Z"),
    updated_at: new Date("2026-07-21T00:00:00.000Z"),
    disabled_at: null
  };
}

async function testConcurrentSameUserDeliveriesReserveDailyLimit() {
  const fixture = createLifecycleFixture();
  const limitedUsersService = usersService();
  limitedUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, maxPushPerDay: 1 }
  });
  const serviceA = createService(strategyResult, { ...fixture, usersService: limitedUsersService }).service;
  const serviceB = createService(strategyResult, { ...fixture, usersService: limitedUsersService }).service;

  await Promise.all([
    serviceA["deliverInboxSignal"](deliveryEvent("00000000-0000-0000-0000-000000000101"), deliveryWatchlist()),
    serviceB["deliverInboxSignal"](deliveryEvent("00000000-0000-0000-0000-000000000102"), deliveryWatchlist())
  ]);

  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
  assert.equal(fixture.deliveries.filter(({ reason }) => reason === "daily_push_limit").length, 1);
}

async function testConcurrentSameUserDeliveriesReserveCooldown() {
  const fixture = createLifecycleFixture({ cooldownMinutes: 15 });
  const cooldownUsersService = usersService();
  cooldownUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, maxPushPerDay: 10 }
  });
  const serviceA = createService(strategyResult, { ...fixture, usersService: cooldownUsersService }).service;
  const serviceB = createService(strategyResult, { ...fixture, usersService: cooldownUsersService }).service;

  await Promise.all([
    serviceA["deliverInboxSignal"](deliveryEvent("00000000-0000-0000-0000-000000000201"), deliveryWatchlist()),
    serviceB["deliverInboxSignal"](deliveryEvent("00000000-0000-0000-0000-000000000202"), deliveryWatchlist())
  ]);

  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
  assert.equal(fixture.deliveries.filter(({ reason }) => reason === "db_cooldown").length, 1);
}

async function testAdvisoryReservationUsesOnlyItsClientAndReleasesBeforeFeishu() {
  const fixture = createLifecycleFixture();
  const { service } = createService(strategyResult, fixture);

  await service["deliverInboxSignal"](
    deliveryEvent("00000000-0000-0000-0000-000000000301"),
    deliveryWatchlist()
  );

  assert.equal(fixture.database.ordinaryQueriesInsideAdvisory, 0, "locked callback must not reacquire the shared pool");
  assert.equal(fixture.alertCalls.length, 1);
  assert.equal(fixture.alertCalls[0].advisoryActive, 0, "Feishu must start only after the advisory transaction commits");
  assert.equal(fixture.database.advisoryActive, 0);
  assert.ok(fixture.database.advisoryReleases >= 1);
}

async function testConcurrentDistinctUsersDoNotBlockEachOther() {
  const fixture = createLifecycleFixture();
  let activeSends = 0;
  let maxActiveSends = 0;
  const alertsService = {
    sendFeishu: async () => {
      assert.equal(fixture.database.advisoryActive, 0, "external sends run after reservation transactions release");
      activeSends += 1;
      maxActiveSends = Math.max(maxActiveSends, activeSends);
      await new Promise((resolve) => setImmediate(resolve));
      activeSends -= 1;
      return { sent: true };
    }
  };
  const serviceA = createService(strategyResult, { ...fixture, alertsService }).service;
  const serviceB = createService(strategyResult, { ...fixture, alertsService }).service;

  await Promise.all([
    serviceA["deliverInboxSignal"](
      deliveryEvent("00000000-0000-0000-0000-000000000302"),
      deliveryWatchlist()
    ),
    serviceB["deliverInboxSignal"](
      deliveryEvent("00000000-0000-0000-0000-000000000303"),
      { ...deliveryWatchlist(), user_id: USER_TWO_ID }
    )
  ]);

  assert.equal(maxActiveSends, 2, "different users should not share a delivery lock");
  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 2);
  assert.equal(fixture.database.ordinaryQueriesInsideAdvisory, 0);
}

async function testConcurrentSameSignalEventIsReservedOnceAcrossInstances() {
  const fixture = createLifecycleFixture();
  let sendCalls = 0;
  const alertsService = {
    sendFeishu: async () => {
      sendCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { sent: true };
    }
  };
  const serviceA = createService(strategyResult, { ...fixture, alertsService }).service;
  const serviceB = createService(strategyResult, { ...fixture, alertsService }).service;
  const event = deliveryEvent("00000000-0000-0000-0000-000000000304");

  await Promise.all([
    serviceA["deliverInboxSignal"](event, deliveryWatchlist()),
    serviceB["deliverInboxSignal"](event, deliveryWatchlist())
  ]);

  assert.equal(sendCalls, 1);
  assert.equal(fixture.deliveries.filter(({ signal_event_id }) => signal_event_id === event.id).length, 1);
  assert.equal(fixture.deliveries.find(({ signal_event_id }) => signal_event_id === event.id)?.status, "sent");
}

async function testStalledFeishuTimesOutAfterReservationTransactionReleases() {
  const previousTimeout = process.env.STRATEGY_FEISHU_TIMEOUT_MS;
  process.env.STRATEGY_FEISHU_TIMEOUT_MS = "20";
  try {
    const fixture = createLifecycleFixture();
    let advisoryActiveWhenSendStarted = null;
    const alertsService = {
      sendFeishu: async () => {
        advisoryActiveWhenSendStarted = fixture.database.advisoryActive;
        return new Promise(() => {});
      }
    };
    const { service } = createService(strategyResult, { ...fixture, alertsService });
    const event = deliveryEvent("00000000-0000-0000-0000-000000000305");
    const completion = service["deliverInboxSignal"](event, deliveryWatchlist()).then(() => "completed");
    const outcome = await Promise.race([
      completion,
      new Promise((resolve) => setTimeout(() => resolve("test_guard_timeout"), 500))
    ]);

    assert.equal(outcome, "completed", "stalled provider must be bounded by the formal delivery timeout");
    assert.equal(advisoryActiveWhenSendStarted, 0);
    assert.equal(fixture.database.advisoryActive, 0);
    const delivery = fixture.deliveries.find(({ signal_event_id }) => signal_event_id === event.id);
    assert.equal(delivery?.status, "failed");
    assert.match(delivery?.reason ?? "", /feishu_delivery_timeout/);
  } finally {
    if (previousTimeout === undefined) delete process.env.STRATEGY_FEISHU_TIMEOUT_MS;
    else process.env.STRATEGY_FEISHU_TIMEOUT_MS = previousTimeout;
  }
}

async function testFormalDeliveryRetryRechecksCurrentEntitlements() {
  const fixture = createLifecycleFixture();
  const downgradedUsersService = usersService();
  downgradedUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, feishuAlerts: false }
  });
  const { service } = createService(strategyResult, { ...fixture, usersService: downgradedUsersService });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000306");
  fixture.deliveries.push({
    user_id: USER_ID,
    signal_event_id: event.id,
    channel: "feishu",
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction: event.direction,
    signal_type: event.signal_type,
    status: "failed",
    reason: "provider_failed"
  });

  const outcome = await service["retryFormalDelivery"]({
    deliveryId: "delivery-1",
    userId: USER_ID,
    signalEventId: event.id,
    event,
    watchlist: deliveryWatchlist()
  });

  assert.equal(outcome?.skipped, true);
  assert.equal(fixture.alertCalls.length, 0);
  assert.deepEqual(
    fixture.deliveries.map(({ status, reason }) => ({ status, reason })),
    [{ status: "skipped", reason: "plan_or_feishu_disabled" }],
    "a retry must not bypass the user's current plan"
  );
}

async function testFormalDeliveryRetryRechecksDisabledPushSetting() {
  const fixture = createLifecycleFixture({ pushEnabled: false });
  const { service } = createService(strategyResult, fixture);
  const event = deliveryEvent("00000000-0000-0000-0000-000000000307");
  fixture.deliveries.push({
    user_id: USER_ID,
    signal_event_id: event.id,
    channel: "feishu",
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction: event.direction,
    signal_type: event.signal_type,
    status: "failed",
    reason: "provider_failed"
  });

  const outcome = await service["retryFormalDelivery"]({
    deliveryId: "delivery-2",
    userId: USER_ID,
    signalEventId: event.id,
    event,
    watchlist: deliveryWatchlist()
  });

  assert.equal(outcome?.skipped, true);
  assert.equal(fixture.alertCalls.length, 0);
  assert.equal(fixture.deliveries[0].status, "skipped");
  assert.equal(fixture.deliveries[0].reason, "push_setting_disabled");
}

async function testGlobalScanPersistsAndDeliversEachMatchOnce() {
  const fixture = createLifecycleFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
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

async function testGlobalScanPersistsBlockedUserMatchWithoutSending() {
  const fixture = createLifecycleFixture();
  const blockedUsersService = usersService();
  blockedUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, apiAccess: false, remainingSignals: 0, feishuAlerts: false }
  });
  const { service, strategyCalls } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, marketSymbols: ["BTCUSDT"], usersService: blockedUsersService }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 1);
  assert.equal(strategyCalls.length, 1, "system execution must bypass the user's API entitlement and quota");
  assert.equal(fixture.signalEvents.size, 1);
  assert.equal(fixture.inbox.size, 1);
  assert.equal(fixture.deliveries.filter((delivery) => delivery.status === "sent").length, 0);
  assert.deepEqual(
    fixture.deliveries.map(({ status, reason }) => ({ status, reason })),
    [{ status: "skipped", reason: "plan_or_feishu_disabled" }]
  );
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
    let normalRealtimeStarts = 0;
    let normalPerformanceStarts = 0;
    disabled.startRealtimeTracking = async () => { normalRealtimeStarts += 1; };
    disabled.startPerformanceUpdater = async () => { normalPerformanceStarts += 1; };
    disabled.onModuleInit();
    assert.equal(disabled.getGlobalScanStatus().scanner.enabled, false);
    assert.equal(timers.length, 2, "opt-out must leave normal realtime and performance startup behavior intact");
    await Promise.all(timers.map((timer) => timer.callback()));
    assert.equal(normalRealtimeStarts, 1);
    assert.equal(normalPerformanceStarts, 1);
    disabled.onModuleDestroy();
    timers.length = 0;
    cleared.clear();

    delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    const defaultDisabled = createService().service;
    let realtimeStarts = 0;
    let performanceStarts = 0;
    defaultDisabled.startRealtimeTracking = async () => { realtimeStarts += 1; };
    defaultDisabled.startPerformanceUpdater = async () => { performanceStarts += 1; };
    defaultDisabled.onModuleInit();
    assert.equal(defaultDisabled.getGlobalScanStatus().scanner.enabled, false, "global scanning is an explicit diagnostic opt-in");
    assert.equal(timers.length, 2, "default startup schedules only realtime and performance work");
    defaultDisabled.onModuleDestroy();
    assert.equal(cleared.size, 2, "destroy must cancel every pending startup timer");
    await Promise.all(timers.map((timer) => timer.callback()));
    assert.equal(realtimeStarts, 0, "a cleared realtime startup callback must remain inert after destroy");
    assert.equal(performanceStarts, 0, "a cleared performance startup callback must remain inert after destroy");

    timers.length = 0;
    cleared.clear();
    process.env.STRATEGY_GLOBAL_SCAN_ENABLED = "true";
    const enabled = createService().service;
    enabled.onModuleInit();
    assert.equal(enabled.getGlobalScanStatus().scanner.enabled, true);
    assert.ok(enabled.getGlobalScanStatus().scanner.nextRunAt);
    assert.equal(timers.length, 3, "explicit diagnostic opt-in includes the global scanner timer");
    enabled.onModuleDestroy();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (previousEnabled === undefined) delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    else process.env.STRATEGY_GLOBAL_SCAN_ENABLED = previousEnabled;
  }
}

async function testGlobalScanStatusContract() {
  const previousEnabled = process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = () => {};

  try {
    delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    const { service } = createService();
    service.onModuleInit();

    assert.deepEqual(service.getGlobalScanStatus(), {
      scanner: service["globalScanner"].getStatus(),
      reconciliation: service["formalSignalReconciler"].getStatus(),
      deliveryRetry: service["formalDeliveryRetry"].getStatus()
    });

    const { scanner, reconciliation, deliveryRetry } = service.getGlobalScanStatus();
    assert.equal(scanner.enabled, false);
    assert.equal(scanner.nextRunAt, null);
    assert.deepEqual(scanner.errors, []);
    for (const counter of ["scannedSymbols", "matchedSignals", "failedSymbols", "skippedOverlappingRuns"]) {
      assert.equal(typeof scanner[counter], "number", `${counter} must be numeric`);
    }
    assert.equal(reconciliation.enabled, false);
    assert.equal(reconciliation.intervalSeconds, 900);
    assert.equal(deliveryRetry.enabled, true);
    assert.equal(deliveryRetry.intervalSeconds, 60);
    service.onModuleDestroy();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (previousEnabled === undefined) delete process.env.STRATEGY_GLOBAL_SCAN_ENABLED;
    else process.env.STRATEGY_GLOBAL_SCAN_ENABLED = previousEnabled;
  }
}

function testRealtimeWebSocketFallsBackToWsPackage() {
  const original = globalThis.WebSocket;
  try {
    delete globalThis.WebSocket;
    assert.equal(typeof resolveRuntimeWebSocketCtor(), "function", "realtime listener must use the ws package when Node has no global WebSocket");

    function FakeWebSocket() {}
    globalThis.WebSocket = FakeWebSocket;
    assert.equal(resolveRuntimeWebSocketCtor(), FakeWebSocket, "native/global WebSocket should still take precedence when available");
  } finally {
    if (original === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = original;
  }
}

async function testGlobalScanRetriesOneTransientTransportFailure() {
  let attempts = 0;
  const { service } = createService(async ({ symbol, timeframe, candles }) => {
    attempts += 1;
    if (attempts === 1) throw new Error("fetch failed");
    return globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time);
  }, { marketSymbols: ["BTCUSDT"] });

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.equal(attempts, 2);
  assert.equal(result.failedSymbols, 0);
  assert.deepEqual(result.errors, []);
}

async function testGlobalScanRefetchesMarketDataAfterTransientFailure() {
  let marketAttempts = 0;
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, false, candles.at(-1).open_time),
    {
      marketSymbols: ["BTCUSDT"],
      strictKlines: (_call, result) => {
        marketAttempts += 1;
        if (marketAttempts === 1) throw new Error("authoritative_market_data_unavailable:BTCUSDT:5m:futures:timeout");
        return result;
      }
    }
  );

  const result = await service["runGlobalScanSlot"]({
    key: "2026-07-21T14:05:00.000Z",
    closedAt: new Date("2026-07-21T14:05:00.000Z"),
    runAt: new Date("2026-07-21T14:05:05.000Z"),
    timeframes: ["5m"]
  });

  assert.ok(marketAttempts >= 2);
  assert.equal(result.failedSymbols, 0);
}

function testRealtimeSymbolsAndStreamUrlAreBinanceCompatible() {
  assert.deepEqual(
    normalizeRealtimeSymbols(["BTC", "ETHUSDT", "???????OO???USDT", "��??��??USDT", "1000SHIB"]),
    ["BTCUSDT", "ETHUSDT", "1000SHIBUSDT"],
    "realtime subscriptions must drop invalid symbols before opening the combined stream"
  );
  assert.equal(
    buildRealtimeStreamUrl(["btcusdt@kline_5m", "ethusdt@kline_15m"]),
    "wss://data-stream.binance.vision/stream?streams=btcusdt@kline_5m/ethusdt@kline_15m",
    "realtime subscriptions should default to the Binance data stream host that works in local runtime"
  );
}

const tests = [
  testRealtimeWebSocketFallsBackToWsPackage,
  testRealtimeSymbolsAndStreamUrlAreBinanceCompatible,
  testRunStrategyPersistsActionReduceDiagnosticsAndDistinctDedupeKeys,
  testAlertCandidatesExposeActionAndReduceReasonBranches,
  testGlobalScanRunsTheFullMarketWithBoundedPartialFailure,
  testGlobalScanIsIndependentOfUserScanEntitlements,
  testGlobalScanRetriesOneTransientTransportFailure,
  testGlobalScanRefetchesMarketDataAfterTransientFailure,
  testGlobalScanRejectsEmptyDiscoveryWithoutFallback,
  testGlobalScanRejectsDiscoveryFailureWithoutFallback,
  testGlobalScanCapsErrorsAndCountsFailedSymbolsOnce,
  testGlobalScanUsesOnlyClosedAuthoritativeCandlesAndDeduplicatesRequests,
  testGlobalScanRejectsFixtureOrMixedMarketSourcesBeforeStrategyExecution,
  testGlobalScanRejectsUnexpectedResultBarBeforePersistence,
  testGlobalScanTreatsUnpersistedSignalsAsFailedFormalJobs,
  testGlobalScanRequiresStrictConfiguredDatabasePersistence,
  testGlobalScanRejectsPersistedCountMismatch,
  testGlobalScanRejectsIncompleteStrictEventLookup,
  testGlobalScanFuturesFailureCreatesNoFormalLifecycle,
  testRealtimeFormalExecutorUsesOnlyTheClosedCandleAndDeliversOnce,
  testRealtimeFormalExecutorRejectsTheNewlyOpenedBar,
  testRealtimeFormalExecutorDoesNotDeliverUnpersistedSignals,
  testRealtimeFormalExecutorCompletesZeroSignalEvaluation,
  testRealtimeFormalExecutorSkipsDuplicateJobs,
  testReconciledSignalsCreateInboxButSkipPushesOlderThanFiveMinutes,
  testRecentReconciledSignalsRemainEligibleForPush,
  testRealtimeStatusExposesFormalPipelineTelemetry,
  testFormalPipelineRecordsReserveRejection,
  testFormalPipelineRecordsFailureWhenLedgerFailWriteRejects,
  testConcurrentSameUserDeliveriesReserveDailyLimit,
  testConcurrentSameUserDeliveriesReserveCooldown,
  testAdvisoryReservationUsesOnlyItsClientAndReleasesBeforeFeishu,
  testConcurrentDistinctUsersDoNotBlockEachOther,
  testConcurrentSameSignalEventIsReservedOnceAcrossInstances,
  testStalledFeishuTimesOutAfterReservationTransactionReleases,
  testFormalDeliveryRetryRechecksCurrentEntitlements,
  testFormalDeliveryRetryRechecksDisabledPushSetting,
  testGlobalScanPersistsAndDeliversEachMatchOnce,
  testGlobalScanPersistsBlockedUserMatchWithoutSending,
  testGlobalScannerHonorsOptOutAndStopsOnShutdown,
  testGlobalScanStatusContract
];

try {
  const failures = [];
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      failures.push(error);
      console.error(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} strategy contract regression(s) failed`);
  console.log("strategy contract tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
