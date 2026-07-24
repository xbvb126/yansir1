import assert from 'node:assert/strict';

const API_BASE_URL = normalizeBase(process.env.E2E_API_BASE_URL || 'http://127.0.0.1:3101/api');
const WEB_BASE_URL = normalizeWebBase(process.env.E2E_WEB_BASE_URL || 'http://127.0.0.1:3200/yansir/');
const PASSWORD = process.env.E2E_DEMO_PASSWORD || 'radar123';
const RUN_IP_OCTET = Math.floor(Date.now() / 1000) % 200 + 20;

const accounts = {
  free: { phone: '17700000198', expectedPlan: 'Free' },
  vip: { phone: '18600002450', expectedPlan: 'VIP' },
  svip: { phone: '13800008821', expectedPlan: 'SVIP' }
};

async function request(path, { method = 'GET', token, body, expectedStatus = 200, headers = {} } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  assert.equal(response.status, expectedStatus, `${method} ${path} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 500)}`);
  return payload;
}

const tokenCache = new Map();

async function login(account) {
  if (tokenCache.has(account.phone)) {
    return tokenCache.get(account.phone);
  }
  const payload = await request('/auth/login', {
    method: 'POST',
    body: { phone: account.phone, password: PASSWORD },
    expectedStatus: 201,
    headers: { 'x-forwarded-for': `127.${RUN_IP_OCTET}.${Object.keys(accounts).findIndex((key) => accounts[key] === account) + 1}.1` }
  });
  assert.equal(payload.user.plan, account.expectedPlan);
  assert.ok(payload.token, `${account.expectedPlan} login should return a token`);
  tokenCache.set(account.phone, payload.token);
  return payload.token;
}

function assertEntitlements(entitlements, expected) {
  assert.equal(entitlements.plan, expected.plan);
  assert.equal(entitlements.maxWatchlistSymbols, expected.maxWatchlistSymbols);
  assert.deepEqual(entitlements.allowedTimeframes, expected.allowedTimeframes);
  assert.equal(entitlements.realtimeDelayHours, expected.realtimeDelayHours);
  assert.equal(entitlements.historyDays, expected.historyDays);
  assert.equal(entitlements.minAlertScore, expected.minAlertScore);
  assert.equal(entitlements.maxPushPerDay, expected.maxPushPerDay);
  assert.equal(entitlements.feishuAlerts, expected.feishuAlerts);
  assert.equal(entitlements.apiAccess, expected.apiAccess);
  assert.equal(entitlements.signalOutcomes, expected.signalOutcomes);
}

async function testPlansAndMeAreConsistent() {
  const plans = await request('/billing/plans');
  const byName = Object.fromEntries(plans.plans.map((plan) => [plan.name, plan]));
  assertEntitlements(planToEntitlements(byName.Free), {
    plan: 'Free',
    maxWatchlistSymbols: 5,
    allowedTimeframes: ['5m'],
    realtimeDelayHours: 8,
    historyDays: 7,
    minAlertScore: 80,
    maxPushPerDay: 0,
    feishuAlerts: false,
    apiAccess: false,
    signalOutcomes: false
  });
  assertEntitlements(planToEntitlements(byName.VIP), {
    plan: 'VIP',
    maxWatchlistSymbols: 50,
    allowedTimeframes: ['5m', '15m'],
    realtimeDelayHours: 0,
    historyDays: 30,
    minAlertScore: 65,
    maxPushPerDay: 300,
    feishuAlerts: true,
    apiAccess: false,
    signalOutcomes: true
  });
  assertEntitlements(planToEntitlements(byName.SVIP), {
    plan: 'SVIP',
    maxWatchlistSymbols: 200,
    allowedTimeframes: ['5m', '15m', '30m', '1h', '4h'],
    realtimeDelayHours: 0,
    historyDays: 180,
    minAlertScore: 65,
    maxPushPerDay: 2000,
    feishuAlerts: true,
    apiAccess: true,
    signalOutcomes: true
  });

  for (const [key, account] of Object.entries(accounts)) {
    const token = await login(account);
    const me = await request('/me', { token });
    const plan = byName[account.expectedPlan];
    assert.equal(me.user.plan, account.expectedPlan, `${key} /me should expose current plan`);
    assert.deepEqual(me.entitlements.allowedTimeframes, plan.allowedTimeframes, `${key} timeframes should match /billing/plans`);
    assert.equal(me.entitlements.maxWatchlistSymbols, plan.maxWatchlistSymbols, `${key} watchlist cap should match /billing/plans`);
    assert.equal(me.entitlements.minAlertScore, plan.minAlertScore, `${key} min score should match /billing/plans`);
    assert.equal(me.entitlements.maxPushPerDay, plan.maxPushPerDay, `${key} push cap should match /billing/plans`);
  }
}

function planToEntitlements(plan) {
  assert.ok(plan, 'expected plan exists');
  return {
    plan: plan.name,
    maxWatchlistSymbols: plan.maxWatchlistSymbols,
    allowedTimeframes: plan.allowedTimeframes,
    realtimeDelayHours: plan.realtimeDelayHours,
    historyDays: plan.historyDays,
    minAlertScore: plan.minAlertScore,
    maxPushPerDay: plan.maxPushPerDay,
    feishuAlerts: plan.feishu,
    apiAccess: plan.apiAccess,
    signalOutcomes: plan.signalOutcomes
  };
}

async function testPublicSignalsAreDelayedAndPerformanceLocked() {
  const payload = await request('/strategy/public-signals?limit=5&page=1');
  assert.equal(payload.delayHours, 8);
  assert.equal(payload.historyDays, 7);
  assert.equal(payload.access.performancePreviewOnly, true);
  assert.deepEqual(payload.access.lockedPerformanceFields, ['4h', '24h', 'maxFavorablePct', 'maxAdversePct']);
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  for (const signal of payload.signals) {
    assert.ok(new Date(signal.time).getTime() <= cutoff + 60_000, `public signal ${signal.id} must be 8h delayed`);
    if (signal.performance) {
      assert.equal(signal.performance.access.full, false);
      assert.equal(signal.performance.access.previewOnly, true);
      assert.equal(signal.performance.returns['4h'], null);
      assert.equal(signal.performance.returns['24h'], null);
      assert.equal(signal.performance.maxFavorablePct, null);
      assert.equal(signal.performance.maxAdversePct, null);
      assert.ok(['pending', 'completed'].includes(signal.performance.outcomeStatus), 'public rows expose completion only');
      assert.doesNotMatch(JSON.stringify(signal.performance), /success|failed/, 'public rows must not reveal 24h outcome direction');
    }
  }
}

async function testLiveApiGuardsRejectLowerPlans() {
  const freeToken = await login(accounts.free);
  const vipToken = await login(accounts.vip);
  await request('/strategy/realtime/start', { method: 'POST', token: freeToken, body: {}, expectedStatus: 400 });
  await request('/strategy/scan', { method: 'POST', token: vipToken, body: { symbols: ['BTCUSDT'], timeframes: ['5m'] }, expectedStatus: 400 });
  await request('/strategy/performance/run', { method: 'POST', token: vipToken, body: { limit: 1 }, expectedStatus: 400 });
}

async function testWatchlistAndInboxRespectPlanLimits() {
  const freeToken = await login(accounts.free);
  const svipToken = await login(accounts.svip);

  await request('/strategy/watchlist', {
    method: 'PUT',
    token: freeToken,
    body: { items: [{ symbol: 'BTCUSDT', timeframes: ['15m'], enabled: true, minScore: 65, pushEnabled: false }] },
    expectedStatus: 400
  });

  const freeInbox = await request('/strategy/inbox?mode=all&limit=10&timeframe=15m', { token: freeToken });
  assert.equal(freeInbox.access.plan, 'Free');
  assert.deepEqual(freeInbox.access.allowedTimeframes, ['5m']);
  assert.equal(freeInbox.access.performancePreviewOnly, true);
  assert.equal(freeInbox.signals.length, 0, 'Free must not receive disallowed 15m inbox rows');

  const svipInbox = await request('/strategy/inbox?mode=all&limit=5', { token: svipToken });
  assert.equal(svipInbox.access.plan, 'SVIP');
  assert.deepEqual(svipInbox.access.allowedTimeframes, ['5m', '15m', '30m', '1h', '4h']);
  assert.equal(svipInbox.access.performancePreviewOnly, false);
}

async function testFeishuConfigRejectsFreeAndAllowsVipSettings() {
  const freeToken = await login(accounts.free);
  const vipToken = await login(accounts.vip);
  await request('/alerts/feishu/config', {
    method: 'PUT',
    token: freeToken,
    body: { enabled: true, minScore: 80, cooldownMinutes: 15 },
    expectedStatus: 400
  });

  const before = await request('/alerts/feishu/config', { token: vipToken });
  try {
    const saved = await request('/alerts/feishu/config', {
      method: 'PUT',
      token: vipToken,
      body: { enabled: false, minScore: 1, cooldownMinutes: 9999 }
    });
    assert.equal(saved.config.minScore, 65, 'VIP minScore must be clamped to plan minimum');
    assert.equal(saved.config.cooldownMinutes, 1440, 'cooldown must be clamped to one day');
  } finally {
    await request('/alerts/feishu/config', {
      method: 'PUT',
      token: vipToken,
      body: {
        enabled: before.config.enabled,
        minScore: before.config.minScore,
        cooldownMinutes: before.config.cooldownMinutes,
        webhookUrl: before.config.webhookUrl || ''
      }
    });
  }
}

async function testServedFrontendContainsUpgradeGateCopy() {
  const response = await fetch(WEB_BASE_URL);
  assert.equal(response.status, 200, `${WEB_BASE_URL} should serve the frontend`);
  const html = await response.text();
  const assetMatch = html.match(/src=\"([^\"]+\.js)\"/);
  assert.ok(assetMatch, 'frontend HTML should reference a JS asset');
  const assetUrl = new URL(assetMatch[1], WEB_BASE_URL).toString();
  const assetResponse = await fetch(assetUrl);
  assert.equal(assetResponse.status, 200, `${assetUrl} should load`);
  assert.match(assetResponse.headers.get('content-type') || '', /javascript/);
  const js = await assetResponse.text();
  assert.match(js, /升级解锁|会员权益|完整战绩/, 'built frontend should include upgrade-gate copy');
}

async function testPublicSignalBoundaryFiltersAreSafe() {
  const payload = await request('/strategy/public-signals?page=-10&limit=9999&symbol=btc,BTCUSDT,,eth&timeframe=5m,2m,4h&direction=long,bad,short&signalType=trend_long_signal,../../bad&minScore=999&from=not-a-date');
  assert.equal(payload.pagination.page, 1);
  assert.equal(payload.pagination.limit, 100);
  assert.deepEqual(payload.filters.symbols, ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(payload.filters.timeframes, ['5m', '4h']);
  assert.deepEqual(payload.filters.directions, ['long', 'short']);
  assert.deepEqual(payload.filters.signalTypes, ['trend_long_signal']);
  assert.equal(payload.filters.minScore, 100);
  assert.equal(payload.filters.from, null);
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  for (const signal of payload.signals) {
    assert.ok(new Date(signal.time).getTime() <= cutoff + 60_000, 'boundary-filtered public signal must remain delayed');
    assert.ok(['BTC', 'ETH'].includes(signal.symbol), `unexpected public symbol ${signal.symbol}`);
  }
}

async function testWatchlistBoundaryFailuresDoNotPolluteState() {
  const freeToken = await login(accounts.free);
  const before = await request('/strategy/watchlist', { token: freeToken });
  await request('/strategy/watchlist', {
    method: 'PUT',
    token: freeToken,
    body: { items: [{ symbol: 'EDGECASE', timeframes: ['15m', '1h'], enabled: true, minScore: 1, pushEnabled: true }] },
    expectedStatus: 400
  });
  const after = await request('/strategy/watchlist', { token: freeToken });
  assert.deepEqual(after.watchlist.map((item) => `${item.symbol}:${item.enabled}`).sort(), before.watchlist.map((item) => `${item.symbol}:${item.enabled}`).sort(), 'failed watchlist update must not mutate user state');
}

function normalizeBase(baseUrl) {
  return baseUrl.replace(/\/$/, '');
}

function normalizeWebBase(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

const tests = [
  testPlansAndMeAreConsistent,
  testPublicSignalsAreDelayedAndPerformanceLocked,
  testLiveApiGuardsRejectLowerPlans,
  testWatchlistAndInboxRespectPlanLimits,
  testFeishuConfigRejectsFreeAndAllowsVipSettings,
  testServedFrontendContainsUpgradeGateCopy,
  testPublicSignalBoundaryFiltersAreSafe,
  testWatchlistBoundaryFailuresDoNotPolluteState
];

for (const test of tests) {
  await test();
  console.log(`✓ ${test.name}`);
}

console.log(`套餐权限端到端 E2E 测试通过：${tests.length} 项`);
