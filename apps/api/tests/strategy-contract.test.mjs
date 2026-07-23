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
const entitlementsOutFile = path.join(outDir, "entitlements.mjs");
const alertsOutFile = path.join(outDir, "alerts.service.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];
const serviceSource = readFileSync(path.join(apiRoot, "src/modules/strategy/strategy.service.ts"), "utf8");
const controllerSource = readFileSync(path.join(apiRoot, "src/modules/strategy/strategy.controller.ts"), "utf8");
const appModuleSource = readFileSync(path.join(apiRoot, "src/modules/app.module.ts"), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function waitFor(predicate, message = "condition was not met") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

assert.match(serviceSource, /function normalizeSignalPayload/);
assert.match(serviceSource, /function signalActionFromPayload/);
assert.match(serviceSource, /action:\s*signalActionFromPayload\(payload\)/);
assert.match(serviceSource, /payload,\s*\n\s*performance:/);
assert.match(controllerSource, /@Get\("scan\/global\/status"\)/);
assert.ok(
  controllerSource.indexOf('@Get("scan/global/status")') < controllerSource.indexOf('@Post("scan/schedule/start")'),
  "global scanner status must be declared before user schedule routes"
);
assert.match(appModuleSource, /path\.resolve\(process\.cwd\(\), "\.env\.local"\)/, "the API must load the workspace local environment file");
assert.match(appModuleSource, /path\.resolve\(process\.cwd\(\), "\.\.\/\.\.\/\.env\.local"\)/, "the API must load the repository local environment file");
assert.match(controllerSource, /@Get\("formal\/status"\)/, "the formal signal readiness route must be exposed");

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/strategy/strategy.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/users/entitlements.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${entitlementsOutFile}`
], { cwd: apiRoot, stdio: "inherit" });

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/alerts/alerts.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${alertsOutFile}`
], { cwd: apiRoot, stdio: "inherit" });

const {
  StrategyService,
  buildRealtimeStreamUrl,
  normalizeRealtimeSymbols,
  resolveRuntimeWebSocketCtor
} = await import(pathToFileURL(outFile));
const { buildEntitlements } = await import(pathToFileURL(entitlementsOutFile));
const { AlertsService } = await import(pathToFileURL(alertsOutFile));

const USER_ID = "00000000-0000-0000-0000-000000000001";
const USER_TWO_ID = "00000000-0000-0000-0000-000000000002";
const USER_BEYOND_FIFTY_ID = "00000000-0000-0000-0000-000000000051";
const WRONG_FIRST_USER_ID = "00000000-0000-0000-0000-000000000050";

const svipEntitlements = {
  plan: "SVIP",
  formalSignalAccess: "realtime",
  formalSignalDelayHours: 0,
  formalSignalHistoryDays: 180,
  intrabarPreview: false,
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

function usersService(entitlements = svipEntitlements) {
  const service = {
    getCurrentUser: async () => ({ user: { id: USER_ID, plan: entitlements.plan } }),
    getCurrentEntitlements: async () => ({ entitlements }),
    getFormalEntitlementsById: async (userId) => {
      const response = await service.getCurrentEntitlements(userId);
      return { userId, ...response };
    }
  };
  return service;
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
  const marketService = overrides.marketService ?? {
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
    sendFeishu: async () => ({ sent: true }),
    sendFormalFeishu: async () => ({ sent: true })
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

function planUser(plan, { signalQuota, feishuEnabled, teamSeats }) {
  return {
    id: USER_ID,
    name: `${plan} user`,
    phone: "13800000000",
    role: "member",
    plan,
    status: "active",
    expiresAt: "2027-01-01T00:00:00.000Z",
    signalUsed: 0,
    signalQuota,
    feishuEnabled,
    teamSeats
  };
}

function projectionDatabase(row) {
  return {
    enabled: true,
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql: String(sql), params });
      return String(sql).includes("total_count") ? [{ total_count: "1" }] : [row];
    }
  };
}

function persistedSignalProjection(signal) {
  return {
    signalEventId: signal.signalEventId,
    symbol: signal.symbol,
    rawSymbol: signal.rawSymbol,
    timeframe: signal.timeframe,
    direction: signal.direction,
    signalType: signal.signalType,
    title: signal.title,
    reason: signal.reason,
    engine: signal.engine,
    price: signal.price,
    score: signal.score,
    emittedAt: signal.emittedAt,
    payload: signal.payload,
    action: signal.action
  };
}

async function testEntitlementProjectionKeepsPersistedFormalSignalUnchanged() {
  const derivedFree = buildEntitlements(
    planUser("Free", { signalQuota: 10, feishuEnabled: false, teamSeats: "0/0" }),
    { plan: "Free", realtimeDelayHours: 0, historyDays: 365, supportsFeishu: true, maxPushPerDay: 100 }
  );
  const derivedVip = buildEntitlements(planUser("VIP", { signalQuota: 300, feishuEnabled: true, teamSeats: "0/1" }));
  const derivedSvip = buildEntitlements(planUser("SVIP", { signalQuota: 2000, feishuEnabled: true, teamSeats: "0/5" }));
  assert.equal(derivedFree.formalSignalAccess, "delayed");
  assert.equal(derivedFree.formalSignalDelayHours, 8);
  assert.equal(derivedFree.formalSignalHistoryDays, 7);
  assert.equal(derivedFree.intrabarPreview, false);
  assert.equal(derivedVip.formalSignalAccess, "realtime");
  assert.equal(derivedVip.formalSignalDelayHours, 0);
  assert.equal(derivedVip.formalSignalHistoryDays, 30);
  assert.equal(derivedVip.intrabarPreview, false);
  assert.equal(derivedSvip.formalSignalAccess, "realtime");
  assert.equal(derivedSvip.formalSignalDelayHours, 0);
  assert.equal(derivedSvip.formalSignalHistoryDays, 180);

  const row = {
    id: "00000000-0000-0000-0000-000000000777",
    symbol: "BTCUSDT",
    timeframe: "5m",
    direction: "long",
    signal_type: "trend_long_signal",
    title: "Formal closed signal",
    reason: "closed candle confirmation",
    engine: "pine_v6",
    price: "64000",
    score: 88,
    emitted_at: "2026-07-23T03:50:00.000Z",
    payload: { action: "long" },
    performance_entry_price: "64000",
    performance_price_15m: "64100",
    performance_price_1h: "64200",
    performance_price_4h: "64300",
    performance_price_24h: "65000",
    performance_return_5m: "0.001",
    performance_return_15m: "0.002",
    performance_return_1h: "0.003",
    performance_return_4h: "0.004",
    performance_return_24h: "0.01",
    performance_max_favorable_pct: "0.02",
    performance_max_adverse_pct: "-0.01",
    performance_outcome_status: "pending",
    performance_evaluated_until: "2026-07-23T04:00:00.000Z",
    performance_updated_at: "2026-07-23T04:00:00.000Z"
  };
  const freeDb = projectionDatabase(row);
  const vipDb = projectionDatabase(row);
  const free = await createService(strategyResult, { database: freeDb, usersService: usersService(derivedFree) }).service.getGlobalSignalEvents(USER_ID);
  const vip = await createService(strategyResult, { database: vipDb, usersService: usersService(derivedVip) }).service.getGlobalSignalEvents(USER_ID);

  assert.deepEqual(persistedSignalProjection(free.signals[0]), persistedSignalProjection(vip.signals[0]));
  assert.deepEqual(free.access.allowedTimeframes, ["5m"]);
  assert.deepEqual(vip.access.allowedTimeframes, ["5m", "15m"]);
  assert.equal(free.historyDays, 7);
  assert.equal(vip.historyDays, 30);
  assert.equal(free.delayHours, 8);
  assert.equal(vip.delayHours, 0);
  assert.equal(free.access.formalSignalAccess, "delayed");
  assert.equal(free.access.formalSignalDelayHours, 8);
  assert.equal(free.access.formalSignalHistoryDays, 7);
  assert.equal(derivedFree.feishuAlerts, false);
  assert.equal(derivedFree.maxPushPerDay, 0);
  assert.equal(vip.access.plan, "VIP");
  assert.equal(vip.access.formalSignalAccess, "realtime");
  assert.equal(vip.access.formalSignalDelayHours, 0);
  assert.equal(vip.access.formalSignalHistoryDays, 30);
  assert.ok(freeDb.queries[0].params.includes(8), "Free formal query retains its fixed eight-hour delay despite the legacy override");
  assert.ok(freeDb.queries[0].params.includes(7), "Free formal query retains its fixed seven-day history despite the legacy override");
  assert.equal(vipDb.queries[0].params.at(-1), 30, "VIP visibility uses its own history window");
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

function createLifecycleFixture({
  cooldownMinutes = 0,
  pushEnabled = true,
  targetWebhook = "https://example.test/webhook"
} = {}) {
  const signalEvents = new Map();
  const inbox = new Map();
  const deliveries = [];
  const cooldowns = new Set();
  const alertCalls = [];
  const operations = [];
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
          bar_time: signal.barTime,
          strategy_version: signal.strategyVersion,
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
      operations.push(normalizedSql);
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
          target_encrypted: targetWebhook,
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
            && (values[2] == null || delivery.id !== values[2])
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
          && (values[7] == null || delivery.id !== values[7])
          && ["sending", "sent"].includes(delivery.status)
        );
        return [{ in_cooldown: cooldowns.has(key) || occupiedByDelivery }];
      }
      if (normalizedSql.startsWith("insert into alert_deliveries")) {
        const skipped = normalizedSql.includes("'skipped'");
        const sending = normalizedSql.includes("'sending'");
        const pending = normalizedSql.includes("$8::varchar, 'pending', $9::jsonb");
        const failed = normalizedSql.includes("$8::varchar, 'failed', $9::text");
        const delivery = {
          user_id: values[0],
          signal_event_id: values[1],
          channel: "feishu",
          symbol: values[2],
          timeframe: values[3],
          direction: values[4],
          signal_type: values[5],
          status: skipped ? "skipped" : pending ? "pending" : failed ? "failed" : sending ? "sending" : "sent",
          reason: skipped || failed ? values[8] : null
        };
        const existing = deliveries.find((item) =>
          item.user_id === delivery.user_id
          && item.signal_event_id === delivery.signal_event_id
          && item.channel === delivery.channel
        );
        if (!existing) {
          deliveries.push(delivery);
          return sending || pending ? [{ id: `delivery-${deliveries.length}`, status: delivery.status }] : [];
        }
        if (pending && existing.status === "pending") return [{ id: `delivery-${deliveries.indexOf(existing) + 1}`, status: "pending" }];
        if (failed && existing.status !== "pending") return [];
        if (existing.status !== "sent" || !skipped) Object.assign(existing, delivery);
        return [];
      }
      if (normalizedSql.startsWith("update alert_deliveries")) {
        if (normalizedSql.includes("set status = 'sending'")) {
          const expectedStatus = values[3] ? "failed" : "pending";
          const existing = deliveries.find((delivery) =>
            delivery.user_id === values[0]
            && delivery.signal_event_id === values[1]
            && delivery.channel === values[2]
            && delivery.status === expectedStatus
          );
          if (!existing) return [];
          existing.status = "sending";
          return [{ id: `delivery-${deliveries.indexOf(existing) + 1}` }];
        }
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

  const sendFeishu = async (candidate, userId, options) => {
      alertCalls.push({ candidate, userId, options, advisoryActive: database.advisoryActive });
      return { sent: true };
  };
  const alertsService = {
    sendFeishu,
    sendFormalFeishu: (candidate, target, options) => sendFeishu(candidate, target.userId, options)
  };

  return { alertCalls, alertsService, cooldowns, database, deliveries, inbox, operations, signalEvents, signalsService };
}

async function testRunStrategyReturnsDiagnosticsWithoutPersistingProvisionalResults() {
  const { service, savedSignals } = createService();
  const response = await service.runStrategy({
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: [{ close: 64000 }]
  });

  assert.equal(response.result, strategyResult, "runStrategy must return the strategy result object unchanged");
  assert.equal(response.result.diagnostics, diagnostics, "diagnostics must pass through on the returned result");
  assert.equal(savedSignals.length, 0, "request/fixture/open-candle strategy runs must never enter the formal ledger");
  assert.deepEqual(response.persistence, { persisted: false, count: 0 });
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

  assert.equal(result.matchedSignals, 1, "formal persistence completes before asynchronous matching");
  assert.equal(result.failedSymbols, 0);
  await waitFor(() => service.getRealtimeStatus().formalPipeline.matchQueue.failed === 1);
  assert.match(
    service.getRealtimeStatus().formalPipeline.matchQueue.latestFailure.error,
    /signal_event_lookup_incomplete/
  );
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
  await waitFor(() => evaluations.completed.length === 1, "formal matching should complete the evaluation");

  assert.equal(outcome.status, "completed");
  assert.equal(marketCalls[0].endTime, job.closedAt.getTime() - 1);
  assert.equal(strategyCalls[0].candles.at(-1).open_time, job.klineOpenTime);
  assert.equal(fixture.signalEvents.size, 1);
  const [formalEvent] = fixture.signalEvents.values();
  assert.equal(
    new Date(formalEvent.emitted_at).toISOString(),
    job.closedAt.toISOString(),
    "formal emission time is the confirmed close boundary"
  );
  assert.equal(
    new Date(formalEvent.bar_time).getTime(),
    job.klineOpenTime,
    "formal bar identity remains the candle open time"
  );
  assert.match(formalEvent.strategy_version, /^pine-v6-/);
  assert.equal(formalEvent.payload.formal, true);
  assert.equal(formalEvent.payload.strategyVersion, formalEvent.strategy_version);
  assert.equal(fixture.inbox.size, 1);
  assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
  assert.deepEqual(evaluations.completed.map(({ signalCount }) => signalCount), [1]);
}

async function testFormalPersistenceReleasesBeforeSlowInitialDelivery() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const sendStarted = deferred();
  const releaseSend = deferred();
  const sendFeishu = async () => {
      sendStarted.resolve();
      await releaseSend.promise;
      return { sent: true };
  };
  const alertsService = {
    sendFeishu,
    sendFormalFeishu: sendFeishu
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, alertsService, closeEvaluations: evaluations.repository }
  );
  const job = realtimeJob();
  const execution = service["executeFormalSignalJob"](job);

  await sendStarted.promise;
  const released = await Promise.race([
    execution.then(() => true),
    new Promise((resolve) => setImmediate(() => resolve(false)))
  ]);

  assert.equal(released, true, "a slow Feishu send must not hold a formal persistence worker");
  await waitFor(() => evaluations.completed.length === 1, "strict matching must complete before the send finishes");
  assert.equal(service.getRealtimeStatus().formalPipeline.deliveryQueue.activeWorkers, 1);
  releaseSend.resolve();
  await execution;
  await waitFor(() => service.getRealtimeStatus().formalPipeline.deliveryQueue.completed === 1);
}

async function testInitialDeliveryPersistsOutboxBeforeQueueAdmission() {
  const fixture = createLifecycleFixture();
  const { service } = createService(strategyResult, fixture);
  const event = deliveryEvent("00000000-0000-0000-0000-000000000556");
  let admissions = 0;
  service["formalDeliveryQueue"].enqueue = () => {
    admissions += 1;
    const delivery = fixture.deliveries.find(({ signal_event_id }) => signal_event_id === event.id);
    assert.equal(delivery?.status, "pending", "outbox state must be durable before in-memory admission");
    return "pressure";
  };

  await service["enqueueInitialDelivery"](event, deliveryWatchlist(), new Date(event.emitted_at));

  assert.equal(admissions, 1);
  assert.equal(fixture.deliveries.length, 1);
  assert.equal(fixture.deliveries[0].status, "pending", "queue pressure leaves a retry-visible durable row");
}

async function testFormalMatchingUsesStrictExactUserEntitlements() {
  const fixture = createLifecycleFixture();
  const exactReads = [];
  const authoritativeUsersService = usersService({ ...svipEntitlements, allowedTimeframes: [] });
  authoritativeUsersService.getFormalEntitlementsById = async (userId) => {
    exactReads.push(userId);
    return { userId, entitlements: svipEntitlements };
  };
  const { service } = createService(strategyResult, { ...fixture, usersService: authoritativeUsersService });
  service["enqueueInitialDelivery"] = async () => {};
  const event = deliveryEvent("00000000-0000-0000-0000-000000000557");

  await service["matchSignalEventsToUsers"]([event], {
    source: "realtime",
    closedAt: new Date(event.emitted_at)
  });

  assert.deepEqual(exactReads, [USER_ID]);
  assert.equal(fixture.inbox.size, 1, "formal matching must use the exact strict user rather than a fallback user");
}

async function testFormalDeliveryUsesStrictExactAlertRule() {
  const fixture = createLifecycleFixture();
  const queryStrict = fixture.database.queryStrict.bind(fixture.database);
  fixture.database.queryStrict = async (sql, values = []) => {
    if (String(sql).includes("from alert_rules")) throw new Error("strict_formal_rule_lookup_failed");
    return queryStrict(sql, values);
  };
  const { service } = createService(strategyResult, fixture);

  await assert.rejects(
    service["deliverInboxSignal"](
      deliveryEvent("00000000-0000-0000-0000-000000000558"),
      deliveryWatchlist()
    ),
    /strict_formal_rule_lookup_failed/
  );
  assert.equal(fixture.alertCalls.length, 0);
}

async function testFormalProviderUsesOnlyPreparedExactUserBoundary() {
  const targetWebhook = "https://target-51.example/webhook";
  const wrongWebhook = "https://wrong-first.example/webhook";
  const fixture = createLifecycleFixture({ targetWebhook });
  const originalQuery = fixture.database.query.bind(fixture.database);
  fixture.database.query = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from user_push_settings") && normalized.includes("where user_id")) {
      return [{
        enabled: true,
        target_encrypted: wrongWebhook,
        target_masked: "wrong-first",
        min_score: 0,
        cooldown_minutes: 0
      }];
    }
    return originalQuery(sql, values);
  };

  const exactReads = [];
  const exactUsersService = {
    getFormalEntitlementsById: async (userId) => {
      exactReads.push(userId);
      return {
        userId,
        entitlements: { ...svipEntitlements, maxPushPerDay: 1 }
      };
    }
  };
  const legacyReads = [];
  const legacyUsersService = {
    getCurrentUser: async (userId) => {
      legacyReads.push(["user", userId]);
      return { user: { id: WRONG_FIRST_USER_ID, plan: "SVIP" } };
    },
    getCurrentEntitlements: async (userId) => {
      legacyReads.push(["entitlements", userId]);
      return {
        entitlements: { ...svipEntitlements, maxPushPerDay: 100 }
      };
    }
  };
  const realAlertsService = new AlertsService(fixture.database, legacyUsersService);
  const { service } = createService(strategyResult, {
    ...fixture,
    alertsService: realAlertsService,
    usersService: exactUsersService
  });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000560");
  const watchlist = deliveryWatchlist({ user_id: USER_BEYOND_FIFTY_ID });
  const fetches = [];
  const originalFetch = globalThis.fetch;
  const previousWebhook = process.env.FEISHU_WEBHOOK_URL;
  delete process.env.FEISHU_WEBHOOK_URL;

  try {
    globalThis.fetch = async (url) => {
      fetches.push(String(url));
      return { ok: true, status: 200, text: async () => "ok" };
    };
    const result = await service["deliverInboxSignal"](event, watchlist);

    assert.equal(result.sent, true);
    assert.deepEqual(exactReads, [USER_BEYOND_FIFTY_ID]);
    assert.deepEqual(fetches, [targetWebhook], "the provider must receive only the exact strict user's prepared webhook");
    assert.deepEqual(legacyReads, [], "formal provider delivery must not re-resolve a first/fallback user");
    assert.equal(fixture.deliveries[0].user_id, USER_BEYOND_FIFTY_ID);
    assert.equal(fixture.deliveries[0].status, "sent");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
    else process.env.FEISHU_WEBHOOK_URL = previousWebhook;
  }
}

async function testStrictFormalProviderLookupFailureBecomesDurableRetry() {
  const fixture = createLifecycleFixture({ targetWebhook: "https://target-51.example/webhook" });
  const originalQueryStrict = fixture.database.queryStrict.bind(fixture.database);
  fixture.database.queryStrict = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("left join user_push_settings")) {
      throw new Error("strict_formal_provider_target_lookup_failed");
    }
    return originalQueryStrict(sql, values);
  };
  const exactUsersService = {
    getFormalEntitlementsById: async (userId) => ({
      userId,
      entitlements: { ...svipEntitlements, maxPushPerDay: 1 }
    })
  };
  let legacyReads = 0;
  const realAlertsService = new AlertsService(fixture.database, {
    getCurrentUser: async () => {
      legacyReads += 1;
      return { user: { id: WRONG_FIRST_USER_ID, plan: "SVIP" } };
    },
    getCurrentEntitlements: async () => {
      legacyReads += 1;
      return { entitlements: svipEntitlements };
    }
  });
  const { service } = createService(strategyResult, {
    ...fixture,
    alertsService: realAlertsService,
    usersService: exactUsersService
  });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000561");
  const watchlist = deliveryWatchlist({ user_id: USER_BEYOND_FIFTY_ID });
  const originalFetch = globalThis.fetch;
  let fetches = 0;

  try {
    globalThis.fetch = async () => {
      fetches += 1;
      return { ok: true, status: 200, text: async () => "ok" };
    };
    await service["enqueueInitialDelivery"](event, watchlist, new Date(event.emitted_at));
    await waitFor(
      () => fixture.deliveries.some(({ signal_event_id, status }) => signal_event_id === event.id && status === "failed"),
      "a strict provider target lookup failure must become a durable failed delivery"
    );

    const delivery = fixture.deliveries.find(({ signal_event_id }) => signal_event_id === event.id);
    assert.equal(fetches, 0);
    assert.equal(legacyReads, 0);
    assert.equal(delivery?.user_id, USER_BEYOND_FIFTY_ID);
    assert.match(delivery?.reason ?? "", /strict_formal_provider_target_lookup_failed/);
    assert.ok(
      fixture.operations.some((sql) => sql.includes("next_retry_at = now()")),
      "the durable failure must be immediately visible to the retry worker"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testFormalMatchingUsesStrictDatabasePropagation() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const compatibleStrict = fixture.database.queryStrict.bind(fixture.database);
  fixture.database.query = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from watchlists") && normalized.includes("min_score <=")) return [];
    return fixture.database.queryStrict(sql, values);
  };
  fixture.database.queryStrict = async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from watchlists") && normalized.includes("min_score <=")) {
      throw new Error("strict_watchlist_lookup_failed");
    }
    return compatibleStrict(sql, values);
  };
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository }
  );

  const outcome = await service["executeFormalSignalJob"](realtimeJob());

  assert.equal(outcome.status, "completed", "persistence can finish before asynchronous matching");
  await waitFor(() => evaluations.failed.length === 1, "strict matching failure must fail the evaluation ledger");
  assert.deepEqual(evaluations.completed, []);
  assert.match(evaluations.failed[0].error, /strict_watchlist_lookup_failed/);
  assert.equal(service.getRealtimeStatus().formalPipeline.matchQueue.failed, 1);
}

async function testDowngradedTimeframeIsRejectedAtFormalMatchBoundary() {
  const fixture = createLifecycleFixture();
  const evaluations = closeEvaluationFixture();
  const downgradedUsersService = usersService({
    ...svipEntitlements,
    plan: "Free",
    allowedTimeframes: ["5m"],
    feishuAlerts: false,
    maxPushPerDay: 0
  });
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, closeEvaluations: evaluations.repository, usersService: downgradedUsersService }
  );

  const outcome = await service["executeFormalSignalJob"](realtimeJob("BTCUSDT", "15m", "2026-07-23T04:00:00.000Z"));

  assert.equal(outcome.status, "completed");
  await waitFor(() => evaluations.completed.length === 1);
  assert.equal(fixture.inbox.size, 0, "a stale 15m watchlist cannot match after downgrade to Free");
  assert.equal(fixture.deliveries.length, 0);
}

async function testPerformanceBackfillUsesStrictDatabaseReads() {
  const database = {
    enabled: true,
    query: async () => [],
    queryStrict: async () => { throw new Error("strict_performance_lookup_failed"); }
  };
  const { service } = createService(strategyResult, { database });

  await assert.rejects(
    service.runPerformanceBackfill({ limit: 1 }),
    /strict_performance_lookup_failed/
  );
  assert.equal(service.getPerformanceStatus().performance.running, false);
  assert.match(service.getPerformanceStatus().performance.lastError, /strict_performance_lookup_failed/);
}

async function testPerformanceWindowsStartAtConfirmedCloseTime() {
  const emittedAt = new Date(Math.floor(Date.now() / 300_000) * 300_000 - 30 * 60_000);
  const barTime = new Date(emittedAt.getTime() - 60 * 60_000);
  const event = {
    id: "00000000-0000-0000-0000-000000000555",
    symbol: "BTCUSDT",
    timeframe: "1h",
    direction: "long",
    price: "64000",
    emitted_at: emittedAt,
    bar_time: barTime
  };
  let strictCalls = 0;
  let performanceParams = null;
  const database = {
    enabled: true,
    queryStrict: async (_sql, params = []) => {
      strictCalls += 1;
      if (strictCalls === 1) return [event];
      performanceParams = params;
      return [];
    }
  };
  const marketCalls = [];
  const marketService = {
    getKlinesBetween: async (symbol, timeframe, startTime, endTime) => {
      marketCalls.push({ symbol, timeframe, startTime, endTime });
      return {
        source: "binance",
        candles: [0, 1, 2, 3].map((index) => ({
          open_time: emittedAt.getTime() + index * 300_000,
          close_time: emittedAt.getTime() + (index + 1) * 300_000 - 1,
          open: 64000 + index * 100,
          high: 64100 + index * 100,
          low: 63900 + index * 100,
          close: 64100 + index * 100,
          volume: 1
        }))
      };
    }
  };
  const { service } = createService(strategyResult, { database, marketService });

  await service.runPerformanceBackfill({ limit: 1 });

  assert.equal(marketCalls.length, 1);
  assert.equal(
    marketCalls[0].startTime,
    emittedAt.getTime() - 5 * 60_000,
    "performance windows must start from the confirmed close/emission, not the candle open"
  );
  assert.equal(
    performanceParams?.[2],
    64300,
    "a Binance candle closing at the 15m boundary minus 1ms is the 15m outcome candle"
  );
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
  await waitFor(() => evaluations.completed.length === 1);
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
    await waitFor(() => evaluations.completed.length === 1);
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
    await waitFor(() => evaluations.completed.length === 1);
    await waitFor(() => service.getRealtimeStatus().formalPipeline.deliveryQueue.completed === 1);
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

function testFormalRecentCountersUseFifteenMinuteWindow() {
  const { service } = createService();
  service["formalPipeline"] = {
    ...service["formalPipeline"],
    recentFailures: 1,
    recentTimedOut: 1
  };
  service["formalOutcomeHistory"] = [{
    at: Date.now() - 16 * 60_000,
    outcome: "failed",
    source: "realtime",
    timedOut: true
  }];

  const formalPipeline = service.getRealtimeStatus().formalPipeline;
  assert.equal(formalPipeline.recentSuccesses, 0);
  assert.equal(formalPipeline.recentFailures, 0);
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

function deliveryWatchlist(overrides = {}) {
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
    disabled_at: null,
    ...overrides
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
  const sendFeishu = async () => {
      assert.equal(fixture.database.advisoryActive, 0, "external sends run after reservation transactions release");
      activeSends += 1;
      maxActiveSends = Math.max(maxActiveSends, activeSends);
      await new Promise((resolve) => setImmediate(resolve));
      activeSends -= 1;
      return { sent: true };
  };
  const alertsService = {
    sendFeishu,
    sendFormalFeishu: sendFeishu
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
  const sendFeishu = async () => {
      sendCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { sent: true };
  };
  const alertsService = {
    sendFeishu,
    sendFormalFeishu: sendFeishu
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
    const sendFeishu = async () => {
        advisoryActiveWhenSendStarted = fixture.database.advisoryActive;
        return new Promise(() => {});
    };
    const alertsService = {
      sendFeishu,
      sendFormalFeishu: sendFeishu
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

function preclaimedRetryCandidate(event, deliveryId = "delivery-self") {
  return {
    deliveryId,
    userId: USER_ID,
    signalEventId: event.id,
    event,
    watchlist: deliveryWatchlist()
  };
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

async function testFormalDeliveryRetryRechecksCurrentTimeframeEntitlement() {
  const fixture = createLifecycleFixture();
  const downgradedUsersService = usersService();
  downgradedUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, allowedTimeframes: ["5m"] }
  });
  const { service } = createService(strategyResult, { ...fixture, usersService: downgradedUsersService });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000309", { timeframe: "15m" });
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
    deliveryId: "delivery-3",
    userId: USER_ID,
    signalEventId: event.id,
    event,
    watchlist: { ...deliveryWatchlist(), timeframes: ["5m", "15m"] }
  });

  assert.equal(outcome?.skipped, true);
  assert.equal(fixture.alertCalls.length, 0);
  assert.equal(fixture.deliveries[0].status, "skipped");
  assert.equal(fixture.deliveries[0].reason, "plan_timeframe_not_allowed");
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

async function testPreclaimedRetryPreparationFailureReturnsToFailed() {
  const fixture = createLifecycleFixture();
  const strictUsersService = usersService();
  strictUsersService.getCurrentEntitlements = async () => { throw new Error("strict_formal_user_lookup_failed"); };
  strictUsersService.getFormalEntitlementsById = strictUsersService.getCurrentEntitlements;
  const { service } = createService(strategyResult, { ...fixture, usersService: strictUsersService });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000559");
  fixture.deliveries.push({
    id: "delivery-preparation-failure",
    user_id: USER_ID,
    signal_event_id: event.id,
    channel: "feishu",
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction: event.direction,
    signal_type: event.signal_type,
    status: "sending",
    retry_count: 1,
    reason: null
  });

  const outcome = await service["retryFormalDelivery"](
    preclaimedRetryCandidate(event, "delivery-preparation-failure")
  );

  assert.equal(outcome.failed, true);
  assert.equal(fixture.deliveries[0].status, "failed");
  assert.match(fixture.deliveries[0].reason, /strict_formal_user_lookup_failed/);
}

async function testPreclaimedRetryExcludesItselfFromDailyLimit() {
  const fixture = createLifecycleFixture();
  const onePushUsersService = usersService();
  onePushUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, maxPushPerDay: 1 }
  });
  const { service } = createService(strategyResult, { ...fixture, usersService: onePushUsersService });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000308");
  fixture.deliveries.push({
    id: "delivery-self",
    user_id: USER_ID,
    signal_event_id: event.id,
    channel: "feishu",
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction: event.direction,
    signal_type: event.signal_type,
    status: "sending",
    reason: null
  });

  const outcome = await service["retryFormalDelivery"](preclaimedRetryCandidate(event));
  assert.equal(outcome?.sent, true, "the claimed retry itself must not consume the only remaining daily slot");
  assert.equal(fixture.alertCalls.length, 1);
  assert.equal(fixture.deliveries[0].status, "sent");
}

async function testPreclaimedRetryStillCountsOtherDailyDeliveries() {
  const fixture = createLifecycleFixture();
  const onePushUsersService = usersService();
  onePushUsersService.getCurrentEntitlements = async () => ({
    entitlements: { ...svipEntitlements, maxPushPerDay: 1 }
  });
  const { service } = createService(strategyResult, { ...fixture, usersService: onePushUsersService });
  const event = deliveryEvent("00000000-0000-0000-0000-000000000309");
  fixture.deliveries.push(
    { id: "delivery-self", user_id: USER_ID, signal_event_id: event.id, channel: "feishu", symbol: event.symbol, timeframe: event.timeframe, direction: event.direction, signal_type: event.signal_type, status: "sending", reason: null },
    { id: "delivery-other", user_id: USER_ID, signal_event_id: "00000000-0000-0000-0000-000000000399", channel: "feishu", symbol: event.symbol, timeframe: event.timeframe, direction: event.direction, signal_type: event.signal_type, status: "sent", reason: null }
  );

  const outcome = await service["retryFormalDelivery"](preclaimedRetryCandidate(event));
  assert.equal(outcome?.skipped, true);
  assert.equal(fixture.alertCalls.length, 0);
  assert.equal(fixture.deliveries.find(({ id }) => id === "delivery-self")?.reason, "daily_push_limit");
}

async function testPreclaimedRetryExcludesItselfFromCooldown() {
  const fixture = createLifecycleFixture({ cooldownMinutes: 15 });
  const { service } = createService(strategyResult, fixture);
  const event = deliveryEvent("00000000-0000-0000-0000-000000000310");
  fixture.deliveries.push({
    id: "delivery-self",
    user_id: USER_ID,
    signal_event_id: event.id,
    channel: "feishu",
    symbol: event.symbol,
    timeframe: event.timeframe,
    direction: event.direction,
    signal_type: event.signal_type,
    status: "sending",
    reason: null
  });

  const outcome = await service["retryFormalDelivery"](preclaimedRetryCandidate(event));
  assert.equal(outcome?.sent, true, "the claimed retry itself must not trigger its own database cooldown");
  assert.equal(fixture.alertCalls.length, 1);
}

async function testPreclaimedRetryStillCountsOtherCooldownDeliveries() {
  const fixture = createLifecycleFixture({ cooldownMinutes: 15 });
  const { service } = createService(strategyResult, fixture);
  const event = deliveryEvent("00000000-0000-0000-0000-000000000311");
  fixture.deliveries.push(
    { id: "delivery-self", user_id: USER_ID, signal_event_id: event.id, channel: "feishu", symbol: event.symbol, timeframe: event.timeframe, direction: event.direction, signal_type: event.signal_type, status: "sending", reason: null },
    { id: "delivery-other", user_id: USER_ID, signal_event_id: "00000000-0000-0000-0000-000000000398", channel: "feishu", symbol: event.symbol, timeframe: event.timeframe, direction: event.direction, signal_type: event.signal_type, status: "sent", reason: null }
  );

  const outcome = await service["retryFormalDelivery"](preclaimedRetryCandidate(event));
  assert.equal(outcome?.skipped, true);
  assert.equal(fixture.alertCalls.length, 0);
  assert.equal(fixture.deliveries.find(({ id }) => id === "delivery-self")?.reason, "db_cooldown");
}

async function testGlobalScanPersistsAndDeliversEachMatchOnce() {
  const fixture = createLifecycleFixture();
  const { service } = createService(
    ({ symbol, timeframe, candles }) => globalStrategyResult(symbol, timeframe, true, candles.at(-1).open_time),
    { ...fixture, marketSymbols: ["BTCUSDT"] }
  );
  const closedAt = new Date(Math.floor(Date.now() / 300_000) * 300_000);
  const slot = {
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAt.getTime() + 5_000),
    timeframes: ["5m"]
  };

  await service["runGlobalScanSlot"](slot);
  await service["runGlobalScanSlot"](slot);
  await waitFor(() => fixture.inbox.size === 1);
  await waitFor(() => service.getRealtimeStatus().formalPipeline.deliveryQueue.completed === 1);

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

  const closedAt = new Date(Math.floor(Date.now() / 300_000) * 300_000);
  const result = await service["runGlobalScanSlot"]({
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAt.getTime() + 5_000),
    timeframes: ["5m"]
  });

  assert.equal(result.matchedSignals, 1);
  assert.equal(strategyCalls.length, 1, "system execution must bypass the user's API entitlement and quota");
  assert.equal(fixture.signalEvents.size, 1);
  await waitFor(() => fixture.inbox.size === 1);
  await waitFor(() => fixture.deliveries.length === 1);
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

async function testFormalReadinessReportsDatabaseAndRuntimeState() {
  const mockDatabase = {
    enabled: false,
    health: async () => ({ mode: "mock", connected: false }),
    query: async () => []
  };
  const { service: mockService } = createService(strategyResult, { database: mockDatabase });
  const mockDbStatus = await mockService.getFormalSignalStatus();
  assert.deepEqual(
    { ready: mockDbStatus.ready, reason: mockDbStatus.reason },
    {
      ready: false,
      reason: "database_unavailable"
    }
  );

  const connectedDatabase = {
    enabled: true,
    health: async () => ({ mode: "postgres", connected: true }),
    query: async () => []
  };
  const { service: connectedService } = createService(strategyResult, { database: connectedDatabase });
  connectedService["realtime"] = {
    ...connectedService["realtime"],
    enabled: true,
    connected: true,
    lastEventAt: "2026-07-23T04:00:00.000Z"
  };
  const connectedSocket = {};
  connectedService["realtimeSockets"] = [connectedSocket];
  connectedService["openRealtimeSockets"].add(connectedSocket);
  const connectedStatus = await connectedService.getFormalSignalStatus();
  assert.equal(connectedStatus.queue.capacity, 10000);
  assert.equal(typeof connectedStatus.reconciliation.enabled, "boolean");
  assert.deepEqual(connectedStatus.realtime, {
    enabled: true,
    connected: true,
    lastClosedEventAt: "2026-07-23T04:00:00.000Z"
  });
}

function createHealthyFormalReadinessService() {
  const database = {
    enabled: true,
    health: async () => ({ mode: "postgres", connected: true }),
    query: async () => [],
    queryStrict: async () => [],
    withTransaction: async (operation) => operation({ query: async () => [] })
  };
  const closeEvaluations = {
    reserve: async () => ({ id: "close-evaluation-1", attempts: 1 }),
    complete: async () => {},
    fail: async () => {},
    getLatestPersistedCloseAt: async () => null,
    getEarliestIncompleteCloseAt: async () => null,
    findCompletedKeys: async () => new Set()
  };
  const { service } = createService(strategyResult, { database, closeEvaluations });
  service["realtime"] = {
    ...service["realtime"],
    enabled: true,
    connected: true,
    lastEventAt: "2026-07-23T04:00:00.000Z"
  };
  const socket = { readyState: 1, close: () => {} };
  service["realtimeSockets"] = [socket];
  service["openRealtimeSockets"].add(socket);
  return { service, socket };
}

async function startHealthyFormalWorkers(service) {
  service["formalSignalReconciler"].start();
  service["formalDeliveryRetry"].start();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function testFormalReadinessRequiresHealthyWorkerDependencies() {
  const { service } = createHealthyFormalReadinessService();
  try {
    const beforeStart = await service.getFormalSignalStatus();
    assert.equal(beforeStart.ready, false);
    assert.equal(beforeStart.reason, "reconciliation_disabled");

    await startHealthyFormalWorkers(service);
    const started = await service.getFormalSignalStatus();
    assert.equal(started.ready, true, "only lifecycle-started healthy workers make the formal pipeline ready");

    service["formalSignalReconciler"].stop();
    const reconciliationStopped = await service.getFormalSignalStatus();
    assert.equal(reconciliationStopped.reason, "reconciliation_disabled");

    service["formalSignalReconciler"].start();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    service["formalSignalReconciler"]["options"].closeEvaluations.getLatestPersistedCloseAt = async () => {
      throw new Error("reconciliation_backend_error");
    };
    await service["formalSignalReconciler"].runOnce();
    const reconciliationFailed = await service.getFormalSignalStatus();
    assert.equal(reconciliationFailed.reason, "reconciliation_error");

    service["formalSignalReconciler"]["options"].closeEvaluations.getLatestPersistedCloseAt = async () => null;
    await service["formalSignalReconciler"].runOnce();
    service["formalDeliveryRetry"].stop();
    const retryStopped = await service.getFormalSignalStatus();
    assert.equal(retryStopped.reason, "delivery_retry_disabled");

    service["formalDeliveryRetry"].start();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    service["formalDeliveryRetry"]["options"].database.queryStrict = async () => {
      throw new Error("delivery_retry_backend_error");
    };
    await service["formalDeliveryRetry"].runOnce();
    const retryFailed = await service.getFormalSignalStatus();
    assert.equal(retryFailed.reason, "delivery_retry_error");
  } finally {
    service["closeRealtimeSocket"](false);
    service.onModuleDestroy();
  }
}

async function testFormalReadinessTracksAllInFlightAgeAndRecentPressure() {
  const { service } = createHealthyFormalReadinessService();
  try {
    await startHealthyFormalWorkers(service);
    const calculationBase = service["formalSignalQueue"].getStatus();
    const matchBase = service["formalMatchQueue"].getStatus();
    const deliveryBase = service["formalDeliveryQueue"].getStatus();
    const healthyCalculation = { ...calculationBase, oldestInFlightAt: null, pressureActive: false };
    const healthyMatch = { ...matchBase, oldestInFlightAt: null, pressureActive: false };
    const healthyDelivery = { ...deliveryBase, oldestInFlightAt: null, pressureActive: false };

    service["formalSignalQueue"].getStatus = () => ({
      ...healthyCalculation,
      oldestInFlightAt: new Date(Date.now() - 60_001).toISOString()
    });
    assert.equal((await service.getFormalSignalStatus()).reason, "queue_latency_exceeded");

    service["formalSignalQueue"].getStatus = () => ({ ...healthyCalculation, pressureActive: true });
    assert.equal((await service.getFormalSignalStatus()).reason, "queue_pressure");

    service["formalSignalQueue"].getStatus = () => healthyCalculation;
    service["formalMatchQueue"].getStatus = () => ({ ...healthyMatch, pressureActive: true });
    assert.equal((await service.getFormalSignalStatus()).reason, "match_queue_pressure");

    service["formalMatchQueue"].getStatus = () => healthyMatch;
    service["formalDeliveryQueue"].getStatus = () => ({
      ...healthyDelivery,
      oldestInFlightAt: new Date(Date.now() - 60_001).toISOString()
    });
    assert.equal((await service.getFormalSignalStatus()).reason, "delivery_queue_latency_exceeded");

    service["formalDeliveryQueue"].getStatus = () => ({
      ...healthyDelivery,
      pressureRejected: 9,
      pressureActive: false
    });
    assert.equal(
      (await service.getFormalSignalStatus()).ready,
      true,
      "lifetime delivery pressure must not keep readiness false after the recent pressure window clears"
    );
  } finally {
    service["closeRealtimeSocket"](false);
    service.onModuleDestroy();
  }
}

async function testFormalReadinessUsesActualOpenSocketsAcrossChunks() {
  const originalWebSocket = globalThis.WebSocket;
  const sockets = [];

  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      sockets.push(this);
    }

    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  const { service } = createHealthyFormalReadinessService();
  try {
    await startHealthyFormalWorkers(service);
    service["realtime"] = {
      ...service["realtime"],
      enabled: true,
      connected: false,
      symbols: Array.from({ length: 181 }, (_, index) => `COIN${index}USDT`),
      timeframes: ["5m"]
    };
    service["realtimeSockets"] = [];
    service["openRealtimeSocket"]();
    assert.equal(sockets.length, 2, "181 streams require two socket chunks");

    sockets[0].readyState = FakeWebSocket.OPEN;
    sockets[0].onopen();
    assert.equal((await service.getFormalSignalStatus()).ready, true);

    sockets[0].readyState = 3;
    sockets[0].onclose();
    const afterLastOpenSocketCloses = await service.getFormalSignalStatus();
    assert.equal(afterLastOpenSocketCloses.realtime.connected, false);
    assert.equal(afterLastOpenSocketCloses.ready, false);
    assert.equal(afterLastOpenSocketCloses.reason, "realtime_disconnected");
  } finally {
    service["closeRealtimeSocket"](false);
    service.onModuleDestroy();
    if (originalWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = originalWebSocket;
  }
}

async function testFormalSignalDestroyClosesSocketsAndStopsWorkers() {
  const originalWebSocket = globalThis.WebSocket;
  const sockets = [];

  class FakeWebSocket {
    constructor() {
      this.readyState = 0;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.closeCalls = 0;
      sockets.push(this);
    }

    close() {
      this.closeCalls += 1;
      this.readyState = 3;
      this.onclose?.();
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  const { service } = createHealthyFormalReadinessService();
  try {
    await startHealthyFormalWorkers(service);
    service["openRealtimeSockets"].clear();
    service["realtime"] = {
      ...service["realtime"],
      enabled: true,
      connected: false,
      symbols: Array.from({ length: 181 }, (_, index) => `COIN${index}USDT`),
      timeframes: ["5m"]
    };
    service["realtimeSockets"] = [];
    service["openRealtimeSocket"]();
    sockets[0].onopen();

    service.onModuleDestroy();

    assert.deepEqual(sockets.map((socket) => socket.closeCalls), [1, 1]);
    assert.equal(service["realtimeSockets"].length, 0);
    assert.equal(service["openRealtimeSockets"].size, 0);
    assert.equal(service["realtime"].connected, false);
    assert.ok(sockets.every((socket) => socket.onclose === null), "destroy must neutralize close handlers before closing sockets");
    assert.equal(service["realtimeReconnectTimer"], null);
    assert.equal(service["formalSignalReconciler"].getStatus().enabled, false);
    assert.equal(service["formalDeliveryRetry"].getStatus().enabled, false);
    assert.equal(service["formalSignalQueue"]["stopped"], true);
  } finally {
    service["closeRealtimeSocket"](false);
    if (originalWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = originalWebSocket;
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

async function testConfiguredFormalSymbolsAvoidExternalDiscovery() {
  const previous = process.env.STRATEGY_FORMAL_SYMBOLS;
  process.env.STRATEGY_FORMAL_SYMBOLS = "btcusdt, ETHUSDT,btc";
  let discoveryCalls = 0;
  const { service } = createService(strategyResult, {
    marketSymbols: async () => {
      discoveryCalls += 1;
      throw new Error("external discovery must not run");
    }
  });
  try {
    assert.deepEqual(await service["resolveGlobalScanSymbols"](), ["BTCUSDT", "ETHUSDT"]);
    assert.deepEqual(
      await service["resolveRealtimeSymbols"]({}, {
        symbols: ["SOLUSDT"],
        timeframe: "5m",
        minScore: 65,
        directions: ["long", "short"],
        cooldownMinutes: 15,
        intervalSeconds: 300
      }),
      ["BTCUSDT", "ETHUSDT"]
    );
    assert.equal(discoveryCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.STRATEGY_FORMAL_SYMBOLS;
    else process.env.STRATEGY_FORMAL_SYMBOLS = previous;
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
  testEntitlementProjectionKeepsPersistedFormalSignalUnchanged,
  testRealtimeWebSocketFallsBackToWsPackage,
  testConfiguredFormalSymbolsAvoidExternalDiscovery,
  testRealtimeSymbolsAndStreamUrlAreBinanceCompatible,
  testRunStrategyReturnsDiagnosticsWithoutPersistingProvisionalResults,
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
  testFormalPersistenceReleasesBeforeSlowInitialDelivery,
  testInitialDeliveryPersistsOutboxBeforeQueueAdmission,
  testFormalMatchingUsesStrictDatabasePropagation,
  testFormalMatchingUsesStrictExactUserEntitlements,
  testFormalDeliveryUsesStrictExactAlertRule,
  testFormalProviderUsesOnlyPreparedExactUserBoundary,
  testStrictFormalProviderLookupFailureBecomesDurableRetry,
  testDowngradedTimeframeIsRejectedAtFormalMatchBoundary,
  testPerformanceBackfillUsesStrictDatabaseReads,
  testPerformanceWindowsStartAtConfirmedCloseTime,
  testRealtimeFormalExecutorRejectsTheNewlyOpenedBar,
  testRealtimeFormalExecutorDoesNotDeliverUnpersistedSignals,
  testRealtimeFormalExecutorCompletesZeroSignalEvaluation,
  testRealtimeFormalExecutorSkipsDuplicateJobs,
  testReconciledSignalsCreateInboxButSkipPushesOlderThanFiveMinutes,
  testRecentReconciledSignalsRemainEligibleForPush,
  testRealtimeStatusExposesFormalPipelineTelemetry,
  testFormalRecentCountersUseFifteenMinuteWindow,
  testFormalPipelineRecordsReserveRejection,
  testFormalPipelineRecordsFailureWhenLedgerFailWriteRejects,
  testConcurrentSameUserDeliveriesReserveDailyLimit,
  testConcurrentSameUserDeliveriesReserveCooldown,
  testAdvisoryReservationUsesOnlyItsClientAndReleasesBeforeFeishu,
  testConcurrentDistinctUsersDoNotBlockEachOther,
  testConcurrentSameSignalEventIsReservedOnceAcrossInstances,
  testStalledFeishuTimesOutAfterReservationTransactionReleases,
  testFormalDeliveryRetryRechecksCurrentEntitlements,
  testFormalDeliveryRetryRechecksCurrentTimeframeEntitlement,
  testFormalDeliveryRetryRechecksDisabledPushSetting,
  testPreclaimedRetryPreparationFailureReturnsToFailed,
  testPreclaimedRetryExcludesItselfFromDailyLimit,
  testPreclaimedRetryStillCountsOtherDailyDeliveries,
  testPreclaimedRetryExcludesItselfFromCooldown,
  testPreclaimedRetryStillCountsOtherCooldownDeliveries,
  testGlobalScanPersistsAndDeliversEachMatchOnce,
  testGlobalScanPersistsBlockedUserMatchWithoutSending,
  testGlobalScannerHonorsOptOutAndStopsOnShutdown,
  testGlobalScanStatusContract,
  testFormalReadinessReportsDatabaseAndRuntimeState,
  testFormalReadinessRequiresHealthyWorkerDependencies,
  testFormalReadinessTracksAllInFlightAgeAndRecentPressure,
  testFormalReadinessUsesActualOpenSocketsAcrossChunks,
  testFormalSignalDestroyClosesSocketsAndStopsWorkers
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
