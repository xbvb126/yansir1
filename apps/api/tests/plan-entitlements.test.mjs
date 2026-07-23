import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StrategyService } from '../dist/modules/strategy/strategy.service.js';
import { AlertsService } from '../dist/modules/alerts/alerts.service.js';
import { buildEntitlements } from '../dist/modules/users/entitlements.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';

const baseEntitlements = {
  plan: 'Free',
  formalSignalAccess: 'delayed',
  formalSignalDelayHours: 8,
  formalSignalHistoryDays: 7,
  intrabarPreview: false,
  maxScanSymbols: 5,
  maxWatchlistSymbols: 5,
  dailySignalQuota: 10,
  remainingSignals: 10,
  dailyPushUsed: 0,
  dailyPushSkipped: 0,
  dailyPushFailed: 0,
  remainingDailyPushes: 0,
  feishuAlerts: false,
  apiAccess: false,
  teamSeats: 0,
  minAlertScore: 80,
  allowedTimeframes: ['5m'],
  realtimeDelayHours: 8,
  historyDays: 7,
  maxPushPerDay: 0,
  signalOutcomes: false
};

const svipEntitlements = {
  ...baseEntitlements,
  plan: 'SVIP',
  formalSignalAccess: 'realtime',
  formalSignalDelayHours: 0,
  formalSignalHistoryDays: 180,
  intrabarPreview: false,
  maxScanSymbols: 200,
  maxWatchlistSymbols: 200,
  dailySignalQuota: 2000,
  remainingSignals: 2000,
  remainingDailyPushes: 2000,
  feishuAlerts: true,
  apiAccess: true,
  teamSeats: 5,
  minAlertScore: 65,
  allowedTimeframes: ['5m', '15m', '30m', '1h', '4h'],
  realtimeDelayHours: 0,
  historyDays: 180,
  maxPushPerDay: 2000,
  signalOutcomes: true
};

const vipEntitlements = {
  ...baseEntitlements,
  plan: 'VIP',
  formalSignalAccess: 'realtime',
  formalSignalDelayHours: 0,
  formalSignalHistoryDays: 30,
  intrabarPreview: false,
  maxScanSymbols: 50,
  maxWatchlistSymbols: 50,
  dailySignalQuota: 300,
  remainingSignals: 300,
  remainingDailyPushes: 300,
  feishuAlerts: true,
  apiAccess: false,
  teamSeats: 1,
  minAlertScore: 65,
  allowedTimeframes: ['5m', '15m'],
  realtimeDelayHours: 0,
  historyDays: 30,
  maxPushPerDay: 300,
  signalOutcomes: true
};

function usersService(entitlements = baseEntitlements) {
  return {
    getCurrentUser: async () => ({ user: { id: USER_ID, plan: entitlements.plan } }),
    getCurrentEntitlements: async () => ({ entitlements })
  };
}

function createDb({ enabled = true, watchlists = [], signalRows = [], pushRows = [], sentToday = 0 } = {}) {
  const db = {
    enabled,
    queries: [],
    watchlists: [...watchlists],
    pushRows: [...pushRows],
    async query(sql, params = []) {
      this.queries.push({ sql: String(sql), params });
      const text = String(sql);
      if (text.includes('select id::text from users')) return [{ id: USER_ID }];
      if (text.includes('select id::text, user_id::text, symbol, timeframes')) return this.watchlists;
      if (text.includes('insert into watchlists')) {
        const [userId, symbol, enabledFlag, timeframes, minScore, signalScope, pushEnabled] = params;
        const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
        const existingIndex = this.watchlists.findIndex((row) => row.user_id === userId && row.symbol === symbol);
        const row = {
          id: `wl-${symbol}`,
          user_id: userId,
          symbol,
          timeframes,
          enabled: enabledFlag,
          min_score: minScore,
          signal_scope: signalScope,
          push_enabled: pushEnabled,
          created_at: now,
          updated_at: now,
          disabled_at: enabledFlag ? null : now
        };
        if (existingIndex >= 0) this.watchlists[existingIndex] = row;
        else this.watchlists.push(row);
        return [];
      }
      if (text.includes('select count(*)::text as total_count')) return [{ total_count: String(signalRows.length) }];
      if (text.includes('from user_signal_inbox inbox') && text.includes('left join signal_performance')) return signalRows;
      if (text.includes('from signal_events se') && text.includes('left join signal_performance')) return signalRows;
      if (text.includes('from alert_deliveries') && text.includes('count(*)::text as sent_count')) return [{ sent_count: String(sentToday) }];
      if (text.includes('from users u') && text.includes('left join user_push_settings')) return this.pushRows;
      if (text.includes('from user_push_settings') && text.includes("channel = 'feishu'")) return this.pushRows;
      if (text.includes('from feishu_bindings')) return [];
      if (text.includes('insert into user_push_settings')) {
        this.lastPushSettingsParams = params;
        this.pushRows = [{ enabled: params[1], target_encrypted: params[2], target_masked: params[3], min_score: params[4], cooldown_minutes: params[5], binding_webhook_url: params[2] }];
        return [];
      }
      if (text.includes('insert into feishu_bindings')) {
        this.lastFeishuBindingParams = params;
        return [];
      }
      if (text.includes('insert into alert_deliveries')) {
        this.lastDeliveryParams = params;
        return [];
      }
      return [];
    }
  };
  return db;
}

function strategyService({ entitlements = baseEntitlements, db = createDb({ enabled: false }) } = {}) {
  const strategyClient = {
    runStrategy: async (payload) => ({
      symbol: payload.symbol || 'BTCUSDT',
      timeframe: payload.timeframe || '5m',
      signals: [],
      market_state: 'range_no_reversal',
      metrics: {},
      bar_time: Date.now()
    })
  };
  const marketService = {
    getKlines: async (symbol, timeframe) => ({ symbol: symbol || 'BTCUSDT', timeframe, source: 'test', candles: [] }),
    getRealtimeKlineTriggerSymbols: async () => ['BTCUSDT']
  };
  const signalsService = { saveStrategySignals: async () => ({ persisted: true, count: 0 }) };
  const alertsService = { sendFeishu: async () => ({ sent: true }) };
  return new StrategyService(strategyClient, marketService, signalsService, alertsService, usersService(entitlements), db);
}

function alertsService({ entitlements = baseEntitlements, db = createDb({ enabled: true }) } = {}) {
  return new AlertsService(db, usersService(entitlements));
}

function sampleSignalRow(overrides = {}) {
  return {
    inbox_id: 'inbox-1',
    inbox_status: 'unread',
    inbox_created_at: '2026-01-02T00:00:00.000Z',
    id: 'signal-1',
    symbol: 'BTCUSDT',
    timeframe: '5m',
    direction: 'long',
    signal_type: 'trend_long_signal',
    title: '趋势买入',
    reason: 'test reason',
    engine: 'pine_v6',
    price: '100',
    score: 88,
    emitted_at: '2026-01-01T00:00:00.000Z',
    payload: {},
    performance_entry_price: '100',
    performance_price_15m: '101',
    performance_price_1h: '102',
    performance_price_4h: '104',
    performance_price_24h: '110',
    performance_return_5m: '0.005',
    performance_return_15m: '0.01',
    performance_return_1h: '0.02',
    performance_return_4h: '0.04',
    performance_return_24h: '0.1',
    performance_max_favorable_pct: '0.12',
    performance_max_adverse_pct: '-0.03',
    performance_outcome_status: 'success',
    performance_evaluated_until: '2026-01-02T00:00:00.000Z',
    performance_updated_at: '2026-01-02T00:05:00.000Z',
    ...overrides
  };
}

function entitlementUser(plan, { signalQuota, feishuEnabled, teamSeats }) {
  return {
    id: USER_ID,
    name: `${plan} user`,
    phone: '13800000000',
    role: 'member',
    plan,
    status: 'active',
    expiresAt: '2027-01-01T00:00:00.000Z',
    signalUsed: 0,
    signalQuota,
    feishuEnabled,
    teamSeats
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

async function testApprovedFormalSignalEntitlementMatrix() {
  const keys = [
    'formalSignalAccess', 'formalSignalDelayHours', 'formalSignalHistoryDays', 'maxWatchlistSymbols',
    'allowedTimeframes', 'historyDays', 'feishuAlerts', 'maxPushPerDay',
    'signalOutcomes', 'apiAccess', 'intrabarPreview'
  ];
  const free = buildEntitlements(entitlementUser('Free', { signalQuota: 10, feishuEnabled: false, teamSeats: '0/0' }));
  const vip = buildEntitlements(entitlementUser('VIP', { signalQuota: 300, feishuEnabled: true, teamSeats: '0/1' }));
  const svip = buildEntitlements(entitlementUser('SVIP', { signalQuota: 2000, feishuEnabled: true, teamSeats: '0/5' }));

  assert.deepEqual(pick(free, keys), {
    formalSignalAccess: 'delayed',
    formalSignalDelayHours: 8,
    formalSignalHistoryDays: 7,
    maxWatchlistSymbols: 5,
    allowedTimeframes: ['5m'],
    historyDays: 7,
    feishuAlerts: false,
    maxPushPerDay: 0,
    signalOutcomes: false,
    apiAccess: false,
    intrabarPreview: false
  });
  assert.deepEqual(pick(vip, keys), {
    formalSignalAccess: 'realtime',
    formalSignalDelayHours: 0,
    formalSignalHistoryDays: 30,
    maxWatchlistSymbols: 50,
    allowedTimeframes: ['5m', '15m'],
    historyDays: 30,
    feishuAlerts: true,
    maxPushPerDay: 300,
    signalOutcomes: true,
    apiAccess: false,
    intrabarPreview: false
  });
  assert.deepEqual(pick(svip, keys), {
    formalSignalAccess: 'realtime',
    formalSignalDelayHours: 0,
    formalSignalHistoryDays: 180,
    maxWatchlistSymbols: 200,
    allowedTimeframes: ['5m', '15m', '30m', '1h', '4h'],
    historyDays: 180,
    feishuAlerts: true,
    maxPushPerDay: 2000,
    signalOutcomes: true,
    apiAccess: true,
    intrabarPreview: false
  });

  const unpushableFree = buildEntitlements(
    entitlementUser('Free', { signalQuota: 10, feishuEnabled: false, teamSeats: '0/0' }),
    { plan: 'Free', supportsFeishu: true, maxPushPerDay: 25, realtimeDelayHours: 0, historyDays: 365 }
  );
  assert.equal(unpushableFree.formalSignalAccess, 'delayed');
  assert.equal(unpushableFree.formalSignalDelayHours, 8);
  assert.equal(unpushableFree.formalSignalHistoryDays, 7);
  assert.equal(unpushableFree.realtimeDelayHours, 8);
  assert.equal(unpushableFree.historyDays, 7);
  assert.equal(unpushableFree.maxPushPerDay, 0);
  assert.equal(unpushableFree.remainingDailyPushes, 0);
}

async function expectRejectsMessage(fn, expected) {
  await assert.rejects(fn, (error) => {
    assert.match(error.message, expected);
    return true;
  });
}

async function testAdvancedApiRequiresSvip() {
  const service = strategyService({ entitlements: baseEntitlements });
  await expectRejectsMessage(() => service.runStrategy({ symbol: 'BTCUSDT' }, USER_ID), /不支持高级 API/);
  await expectRejectsMessage(() => service.scanSymbols({ symbols: ['BTC'], timeframe: '5m' }, USER_ID), /不支持批量扫描 API/);
  await expectRejectsMessage(() => service.scanAndAlert({ symbols: ['BTC'], timeframe: '5m' }, USER_ID), /不支持扫描告警 API/);
  await expectRejectsMessage(() => service.startScanSchedule({ runImmediately: false }, USER_ID), /不支持高级 API/);
  await expectRejectsMessage(() => service.startRealtimeTracking({}, USER_ID), /不支持高级 API/);
  await expectRejectsMessage(() => service.runPerformanceBackfill({}, USER_ID), /不支持高级 API/);
  await expectRejectsMessage(() => service.startPerformanceUpdater({ runImmediately: false }, USER_ID), /不支持高级 API/);
  await expectRejectsMessage(() => service.stopPerformanceUpdater(USER_ID), /不支持高级 API/);
}

async function testSvipCanUseAdvancedScan() {
  const service = strategyService({ entitlements: svipEntitlements });
  const result = await service.scanSymbols({ symbols: ['BTC', 'ETH'], timeframe: '4h' }, USER_ID);
  assert.equal(result.permission.plan, 'SVIP');
  assert.deepEqual(result.timeframes, ['4h']);
  assert.equal(result.summary.scanned, 2);
}

async function testAlertRuleTimeframeAndMinScore() {
  const freeService = strategyService({ entitlements: baseEntitlements });
  await expectRejectsMessage(() => freeService.updateAlertRule({ timeframe: '15m' }, USER_ID), /不支持周期：15m/);
  const updated = await freeService.updateAlertRule({ timeframe: '5m', minScore: 60 }, USER_ID);
  assert.equal(updated.rule.minScore, 80);
}

async function testWatchlistTimeframeCapacityAndMinScore() {
  const freeService = strategyService({ entitlements: baseEntitlements });
  await expectRejectsMessage(() => freeService.updateUserWatchlist({ items: [{ symbol: 'BTC', timeframes: ['15m'] }] }, USER_ID), /不支持周期：15m/);

  const existingRows = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'].map((symbol) => ({
    id: `wl-${symbol}`,
    user_id: USER_ID,
    symbol: `${symbol}USDT`,
    timeframes: ['5m'],
    enabled: true,
    min_score: 80,
    signal_scope: 'all',
    push_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    disabled_at: null
  }));
  const capacityDb = createDb({ watchlists: existingRows });
  const capacityService = strategyService({ entitlements: baseEntitlements, db: capacityDb });
  await expectRejectsMessage(() => capacityService.updateUserWatchlist({ items: [{ symbol: 'DOGE', timeframes: ['5m'], enabled: true }] }, USER_ID), /最多自选 5 个币种/);

  const saveDb = createDb({ watchlists: [] });
  const saveService = strategyService({ entitlements: baseEntitlements, db: saveDb });
  const response = await saveService.updateUserWatchlist({ items: [{ symbol: 'ADA', timeframes: ['5m'], minScore: 60 }] }, USER_ID);
  assert.equal(saveDb.watchlists[0].min_score, 80);
  assert.equal(response.watchlist[0].minScore, 80);
  assert.equal(response.limits.remainingSymbolSlots, 4);
}

async function testInboxAppliesPlanWindowAndPerformanceLock() {
  const row = sampleSignalRow();
  const db = createDb({ signalRows: [row] });
  const service = strategyService({ entitlements: baseEntitlements, db });
  const response = await service.getUserSignalInbox(USER_ID, { mode: 'all', timeframe: '5m', limit: '10' });
  assert.equal(response.access.plan, 'Free');
  assert.deepEqual(response.access.allowedTimeframes, ['5m']);
  assert.equal(response.access.performancePreviewOnly, true);
  assert.equal(response.signals[0].performance.returns['15m'], 0.01);
  assert.equal(response.signals[0].performance.returns['4h'], null);
  assert.deepEqual(response.signals[0].performance.access.lockedFields, ['4h', '24h', 'maxFavorablePct', 'maxAdversePct']);
  const countQuery = db.queries.find((query) => query.sql.includes('from user_signal_inbox inbox') && query.sql.includes('count(*)'));
  assert.ok(countQuery.sql.includes("se.emitted_at >= now() - ($4::integer * interval '1 day')"));
  assert.deepEqual(countQuery.params[1], ['5m']);
  assert.ok(countQuery.sql.includes("se.emitted_at <= now() - ($3::integer * interval '1 hour')"));
  assert.equal(countQuery.params[2], 8);
  assert.equal(countQuery.params[3], 7);
}

async function testSvipInboxGetsFullPerformance() {
  const db = createDb({ signalRows: [sampleSignalRow()] });
  const service = strategyService({ entitlements: svipEntitlements, db });
  const response = await service.getUserSignalInbox(USER_ID, { mode: 'all', timeframe: '4h' });
  assert.equal(response.access.performancePreviewOnly, false);
  assert.equal(response.signals[0].performance.returns['4h'], 0.04);
  assert.equal(response.signals[0].performance.maxFavorablePct, 0.12);
}

async function testThirtyMinuteSubscriptionAndInboxVisibilityIsExplicitlySvip() {
  const fallbackEntitlements = buildEntitlements({
    id: USER_ID,
    name: 'SVIP user',
    phone: '13800000000',
    role: 'member',
    plan: 'SVIP',
    status: 'active',
    expiresAt: '2027-01-01T00:00:00.000Z',
    signalUsed: 0,
    signalQuota: 2000,
    feishuEnabled: true,
    teamSeats: '0/5'
  });
  assert.deepEqual(fallbackEntitlements.allowedTimeframes, ['5m', '15m', '30m', '1h', '4h']);
  assert.equal(buildEntitlements({
    id: USER_ID,
    name: 'VIP user',
    phone: '13800000001',
    role: 'member',
    plan: 'VIP',
    status: 'active',
    expiresAt: '2027-01-01T00:00:00.000Z',
    signalUsed: 0,
    signalQuota: 300,
    feishuEnabled: true,
    teamSeats: '0/1'
  }).allowedTimeframes.includes('30m'), false, '30m policy must remain an explicit SVIP entitlement');

  const row = { ...sampleSignalRow(), timeframe: '30m' };
  const db = createDb({ signalRows: [row] });
  const service = strategyService({ entitlements: svipEntitlements, db });
  const watchlist = await service.updateUserWatchlist({
    items: [{ symbol: 'BTCUSDT', timeframes: ['30m'], enabled: true, minScore: 65 }]
  }, USER_ID);
  assert.deepEqual(db.watchlists[0].timeframes, ['30m']);
  assert.deepEqual(watchlist.watchlist[0].timeframes, ['30m']);

  const inbox = await service.getUserSignalInbox(USER_ID, { mode: 'all', timeframe: '30m' });
  assert.ok(inbox.access.allowedTimeframes.includes('30m'));
  assert.equal(inbox.signals[0].timeframe, '30m');
  const countQuery = db.queries.find((query) => query.sql.includes('from user_signal_inbox inbox') && query.sql.includes('count(*)'));
  assert.ok(countQuery.params[1].includes('30m'));
  assert.deepEqual(countQuery.params[3], ['30m']);

  const schemaSource = readFileSync(new URL('../../../infra/schema.sql', import.meta.url), 'utf8');
  const seedSource = readFileSync(new URL('../../../infra/seed.sql', import.meta.url), 'utf8');
  assert.match(schemaSource, /default array\['5m', '15m', '30m', '1h', '4h'\]/);
  assert.match(seedSource, /'svip'[\s\S]*array\['5m', '15m', '30m', '1h', '4h'\]/i);
}

async function testPublicSignalsAreDelayedAndPreviewOnly() {
  const db = createDb({ signalRows: [sampleSignalRow()] });
  const service = strategyService({ db });
  const response = await service.getPublicDelayedSignals({ limit: '5', symbol: 'BTC' });
  assert.equal(response.delayHours, 8);
  assert.equal(response.historyDays, 7);
  assert.equal(response.access.formalSignalAccess, 'delayed');
  assert.equal(response.access.formalSignalDelayHours, 8);
  assert.equal(response.access.formalSignalHistoryDays, 7);
  assert.equal(response.access.performancePreviewOnly, true);
  assert.equal(response.signals[0].performance.returns['1h'], 0.02);
  assert.equal(response.signals[0].performance.returns['24h'], null);
  const countQuery = db.queries.find((query) => query.sql.includes('from signal_events se where'));
  assert.ok(countQuery.sql.includes("se.emitted_at <= now() - interval '8 hours'"));
  assert.ok(countQuery.sql.includes("se.emitted_at >= now() - interval '7 days'"));
}

async function testFeishuConfigPlanGuardsAndClamping() {
  const freeAlerts = alertsService({ entitlements: baseEntitlements, db: createDb() });
  await expectRejectsMessage(() => freeAlerts.updateFeishuConfig({ enabled: true, webhookUrl: 'https://example.test/hook' }, USER_ID), /不支持实时飞书推送/);

  const vipDb = createDb({ pushRows: [{ target_encrypted: null, binding_webhook_url: null }] });
  const vipAlerts = alertsService({ entitlements: vipEntitlements, db: vipDb });
  const config = await vipAlerts.updateFeishuConfig({ enabled: true, webhookUrl: 'https://example.test/hook', minScore: 40, cooldownMinutes: 2000 }, USER_ID);
  assert.equal(vipDb.lastPushSettingsParams[4], 65);
  assert.equal(vipDb.lastPushSettingsParams[5], 1440);
  assert.equal(config.config.minScore, 65);
  assert.equal(config.config.cooldownMinutes, 1440);
}

async function testFeishuDailyLimitRecordsSkippedDelivery() {
  const db = createDb({ sentToday: 300, pushRows: [{ enabled: true, target_encrypted: 'https://example.test/hook', target_masked: '***hook', min_score: 65, cooldown_minutes: 15 }] });
  const vipAlerts = alertsService({ entitlements: vipEntitlements, db });
  const result = await vipAlerts.sendFeishu({ symbol: 'BTC', direction: 'long', score: 90, title: '测试', timeframe: '5m' }, USER_ID);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /今日推送次数已达套餐上限 300 条/);
  assert.equal(db.lastDeliveryParams[8], 'skipped');
  assert.match(db.lastDeliveryParams[10], /今日推送次数已达套餐上限/);
}

async function testDailyPushUsageExposesOnlySentAsConsumed() {
  const usersServiceSource = readFileSync(new URL('../src/modules/users/users.service.ts', import.meta.url), 'utf8');
  const repositorySource = readFileSync(new URL('../src/modules/users/users.repository.ts', import.meta.url), 'utf8');
  assert.match(usersServiceSource, /dailyPushUsed:\s*usage\.sent/);
  assert.match(usersServiceSource, /dailyPushSkipped:\s*usage\.skipped/);
  assert.match(usersServiceSource, /dailyPushFailed:\s*usage\.failed/);
  assert.match(usersServiceSource, /remainingDailyPushes:\s*Math\.max\(0, maxPushPerDay - usage\.sent\)/);
  assert.match(repositorySource, /count\(\*\) filter \(where status = 'sent'\)::int as sent/);
  assert.match(repositorySource, /count\(\*\) filter \(where status = 'skipped'\)::int as skipped/);
  assert.match(repositorySource, /count\(\*\) filter \(where status = 'failed'\)::int as failed/);
}

async function testWatchlistBoundaryUpdatesDoNotConsumeExtraSlots() {
  const existingRows = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'].map((symbol) => ({
    id: `wl-${symbol}`,
    user_id: USER_ID,
    symbol: `${symbol}USDT`,
    timeframes: ['5m'],
    enabled: true,
    min_score: 80,
    signal_scope: 'all',
    push_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    disabled_at: null
  }));
  const db = createDb({ watchlists: existingRows });
  const service = strategyService({ entitlements: baseEntitlements, db });
  const response = await service.updateUserWatchlist({ items: [{ symbol: 'BTCUSDT', timeframes: ['5m'], enabled: true, minScore: 60 }] }, USER_ID);
  assert.equal(response.limits.activeSymbolCount, 5, 'updating an existing enabled symbol must not consume an extra slot');
  assert.equal(db.watchlists.find((row) => row.symbol === 'BTCUSDT')?.min_score, 80, 'existing symbol still clamps minScore to plan minimum');
}

async function testWatchlistCanDisableLegacyDisallowedTimeframesWhenPlanDowngrades() {
  const db = createDb({ watchlists: [{
    id: 'wl-eth',
    user_id: USER_ID,
    symbol: 'ETHUSDT',
    timeframes: ['15m', '1h'],
    enabled: true,
    min_score: 65,
    signal_scope: 'all',
    push_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    disabled_at: null
  }] });
  const service = strategyService({ entitlements: baseEntitlements, db });
  const response = await service.updateUserWatchlist({ items: [{ symbol: 'ETHUSDT', timeframes: ['15m', '1h'], enabled: false }] }, USER_ID);
  assert.equal(response.watchlist.find((row) => row.symbol === 'ETHUSDT')?.enabled, false, 'downgraded users must be able to remove legacy disallowed watchlists');
  assert.equal(response.limits.activeSymbolCount, 0);
}

async function testPublicSignalQueryClampsAndSanitizesBoundaryFilters() {
  const db = createDb({ signalRows: [sampleSignalRow()] });
  const service = strategyService({ db });
  const response = await service.getPublicDelayedSignals({
    page: '-5',
    limit: '9999',
    symbols: ['btc, BTCUSDT, , eth', 'sol'],
    timeframes: '5m,2m,4h,bad',
    directions: 'long,sideways,short',
    signalTypes: 'trend_long_signal,../../bad,reversal_short_signal',
    minScore: '999',
    from: 'not-a-date',
    to: '2026-01-03T00:00:00.000Z'
  });
  assert.equal(response.pagination.page, 1);
  assert.equal(response.pagination.limit, 100);
  assert.deepEqual(response.filters.symbols, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  assert.deepEqual(response.filters.timeframes, ['5m', '4h']);
  assert.deepEqual(response.filters.directions, ['long', 'short']);
  assert.deepEqual(response.filters.signalTypes, ['trend_long_signal', 'reversal_short_signal']);
  assert.equal(response.filters.minScore, 100);
  assert.equal(response.filters.from, null);
  assert.equal(response.filters.to, '2026-01-03T00:00:00.000Z');
}

async function testFeishuBlankWebhookDoesNotEnablePushAndClampsInvalidSettings() {
  const db = createDb({ pushRows: [{ target_encrypted: null, binding_webhook_url: null }] });
  const vipAlerts = alertsService({ entitlements: vipEntitlements, db });
  const config = await vipAlerts.updateFeishuConfig({ enabled: true, webhookUrl: '   ', minScore: Number.NaN, cooldownMinutes: -10 }, USER_ID);
  assert.equal(db.lastPushSettingsParams[1], false, 'enabled=true with blank webhook must not create an active push channel');
  assert.equal(db.lastPushSettingsParams[4], 65, 'invalid minScore falls back to plan minimum');
  assert.equal(db.lastPushSettingsParams[5], 0, 'negative cooldown clamps to zero');
  assert.equal(config.config.enabled, false);
}

const tests = [
  testApprovedFormalSignalEntitlementMatrix,
  testAdvancedApiRequiresSvip,
  testSvipCanUseAdvancedScan,
  testAlertRuleTimeframeAndMinScore,
  testWatchlistTimeframeCapacityAndMinScore,
  testInboxAppliesPlanWindowAndPerformanceLock,
  testSvipInboxGetsFullPerformance,
  testThirtyMinuteSubscriptionAndInboxVisibilityIsExplicitlySvip,
  testPublicSignalsAreDelayedAndPreviewOnly,
  testFeishuConfigPlanGuardsAndClamping,
  testFeishuDailyLimitRecordsSkippedDelivery,
  testDailyPushUsageExposesOnlySentAsConsumed,
  testWatchlistBoundaryUpdatesDoNotConsumeExtraSlots,
  testWatchlistCanDisableLegacyDisallowedTimeframesWhenPlanDowngrades,
  testPublicSignalQueryClampsAndSanitizesBoundaryFilters,
  testFeishuBlankWebhookDoesNotEnablePushAndClampsInvalidSettings
];

for (const test of tests) {
  await test();
  console.log(`✓ ${test.name}`);
}

console.log(`套餐权限后端测试通过：${tests.length} 项`);
