import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..', '..');
const webRoot = path.resolve(testDir, '..');
const outDir = path.join(testDir, '.tmp');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'planAccess.mjs');
const esbuildBin = path.join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
const esbuildCommand = process.platform === 'win32' ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === 'win32' ? [esbuildBin] : [];
execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  'src/lib/planAccess.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${outFile}`
], { cwd: webRoot, stdio: 'inherit' });

const {
  canAddWatchlistSymbol,
  canUseFullPerformance,
  isTimeframeAllowed,
  planLevel,
  routeAccessPrompt,
  visiblePerformanceForEntitlements
} = await import(pathToFileURL(outFile));

const guest = { id: '', role: 'guest', plan: 'Free' };
const freeUser = { id: 'u-free', role: 'member', plan: 'Free' };
const vipUser = { id: 'u-vip', role: 'member', plan: 'VIP' };
const adminUser = { id: 'u-admin', role: 'admin', plan: 'SVIP' };
const freeEntitlements = {
  plan: 'Free',
  feishuAlerts: false,
  maxPushPerDay: 0,
  dailySignalQuota: 0,
  teamSeats: 0,
  allowedTimeframes: ['5m'],
  minAlertScore: 80,
  signalOutcomes: false,
  maxWatchlistSymbols: 5
};
const vipEntitlements = {
  plan: 'VIP',
  feishuAlerts: true,
  maxPushPerDay: 300,
  dailySignalQuota: 300,
  teamSeats: 1,
  allowedTimeframes: ['5m', '15m'],
  minAlertScore: 65,
  signalOutcomes: true,
  maxWatchlistSymbols: 50
};
const svipEntitlements = {
  plan: 'SVIP',
  feishuAlerts: true,
  maxPushPerDay: 2000,
  dailySignalQuota: 2000,
  teamSeats: 5,
  allowedTimeframes: ['5m', '15m', '1h', '4h'],
  minAlertScore: 65,
  signalOutcomes: true,
  maxWatchlistSymbols: 200
};

assert.equal(planLevel('Free'), 1);
assert.equal(planLevel('VIP'), 2);
assert.equal(planLevel('SVIP'), 3);
assert.equal(planLevel('高级版'), 3);

// 页面级路由权限：公开页（包括 AIClaw 外壳）不拦截；实时告警、团队、后台按登录和套餐拦截。
assert.equal(routeAccessPrompt('data', guest, freeEntitlements), null);
assert.equal(routeAccessPrompt('plans', guest, freeEntitlements), null);
assert.equal(routeAccessPrompt('login', guest, freeEntitlements), null);
assert.deepEqual(routeAccessPrompt('signal', guest, freeEntitlements), {
  title: '登录后打开告警中心',
  desc: '未登录只能查看 8 小时延迟的公开历史信号。登录并配置自选币种后，才能管理实时推送。',
  targetView: 'login',
  fallbackView: 'account',
  actionLabel: '去登录'
});
assert.equal(routeAccessPrompt('signal', vipUser, vipEntitlements), null);
assert.equal(routeAccessPrompt('signal', freeUser, freeEntitlements)?.targetView, 'plans');
assert.match(routeAccessPrompt('signal', freeUser, freeEntitlements)?.desc || '', /每日推送额度为 0/);
assert.equal(routeAccessPrompt('signal', vipUser, { ...vipEntitlements, maxPushPerDay: 0 })?.targetView, 'plans');
assert.equal(routeAccessPrompt('signal', vipUser, { ...vipEntitlements, maxPushPerDay: undefined, dailySignalQuota: 300 }), null);
assert.equal(routeAccessPrompt('team', guest, freeEntitlements)?.targetView, 'login');
assert.equal(routeAccessPrompt('team', vipUser, vipEntitlements)?.targetView, 'plans');
assert.equal(routeAccessPrompt('team', adminUser, svipEntitlements), null);
assert.equal(routeAccessPrompt('admin', guest, freeEntitlements)?.targetView, 'login');
assert.equal(routeAccessPrompt('admin', vipUser, vipEntitlements)?.title, '当前账号无后台权限');
assert.equal(routeAccessPrompt('admin', adminUser, svipEntitlements), null);
assert.equal(routeAccessPrompt('kline-lab', guest, freeEntitlements)?.targetView, 'login');
assert.equal(routeAccessPrompt('kline-lab', vipUser, vipEntitlements)?.title, '当前账号无内部验信权限');
assert.equal(routeAccessPrompt('kline-lab', adminUser, svipEntitlements), null);
assert.equal(routeAccessPrompt('claw', guest, freeEntitlements), null);
assert.equal(routeAccessPrompt('claw', freeUser, freeEntitlements), null);

// 周期权限：默认只允许 5m，Free/VIP/SVIP 分别解锁不同周期。
assert.equal(isTimeframeAllowed('5m', {}), true);
assert.equal(isTimeframeAllowed('15m', {}), false);
assert.equal(isTimeframeAllowed('5m', freeEntitlements), true);
assert.equal(isTimeframeAllowed('15m', freeEntitlements), false);
assert.equal(isTimeframeAllowed('15m', vipEntitlements), true);
assert.equal(isTimeframeAllowed('4h', vipEntitlements), false);
assert.equal(isTimeframeAllowed('4h', svipEntitlements), true);

// 自选额度：未选中时按套餐额度拦截，已选中项允许保存/移除，不因额度满误拦截。
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: 5, activeSymbolCount: 4 }), true);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: 5, activeSymbolCount: 5 }), false);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: 5, activeSymbolCount: 5 }, true), true);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: 0, activeSymbolCount: 0 }), false);
assert.equal(canAddWatchlistSymbol({}, false), false);

// 战绩权限：Free 只能预览 15m/1h，VIP/SVIP 或 signalOutcomes 权益返回完整字段。
assert.equal(canUseFullPerformance(freeEntitlements), false);
assert.equal(canUseFullPerformance(vipEntitlements), true);
assert.equal(canUseFullPerformance({ ...freeEntitlements, signalOutcomes: true }), true);
assert.equal(canUseFullPerformance({ plan: 'VIP', signalOutcomes: false }), true);
const fullPerformance = {
  entryPrice: 100,
  prices: { '15m': 101, '1h': 102, '4h': 103, '24h': 104 },
  returns: { '5m': 0.005, '15m': 0.01, '1h': 0.02, '4h': 0.03, '24h': 0.04 },
  maxFavorablePct: 0.05,
  maxAdversePct: -0.02,
  outcomeStatus: 'success',
  evaluatedUntil: '2026-06-21T12:00:00.000Z'
};
assert.deepEqual(visiblePerformanceForEntitlements(fullPerformance, freeEntitlements), {
  entryPrice: 100,
  prices: { '15m': 101, '1h': 102, '4h': 103, '24h': 104 },
  returns: { '15m': 0.01, '1h': 0.02 },
  maxFavorablePct: null,
  maxAdversePct: null,
  outcomeStatus: 'success',
  evaluatedUntil: '2026-06-21T12:00:00.000Z',
  lockedFields: ['4h', '24h', 'maxFavorablePct', 'maxAdversePct'],
  previewOnly: true
});
const vipPerformance = visiblePerformanceForEntitlements(fullPerformance, vipEntitlements);
assert.equal(vipPerformance.previewOnly, false);
assert.deepEqual(vipPerformance.lockedFields, []);
assert.equal(vipPerformance.maxFavorablePct, 0.05);
assert.equal(vipPerformance.returns['24h'], 0.04);
assert.equal(visiblePerformanceForEntitlements(null, freeEntitlements), null);

// 边界条件：缺失/异常权益必须安全降级，不能误开放高阶入口。
assert.equal(planLevel(undefined), 1);
assert.equal(planLevel(''), 1);
assert.equal(routeAccessPrompt('signal', freeUser, { ...vipEntitlements, feishuAlerts: true, maxPushPerDay: -1 })?.targetView, 'plans');
assert.equal(routeAccessPrompt('signal', vipUser, { ...vipEntitlements, feishuAlerts: true, maxPushPerDay: '300' })?.targetView ?? null, null);
assert.equal(routeAccessPrompt('signal', { id: '', role: 'member', plan: 'VIP' }, vipEntitlements)?.targetView, 'login');
assert.equal(routeAccessPrompt('unknown-private', freeUser, freeEntitlements), null, 'unknown views should remain non-blocking unless explicitly guarded');

// 周期和自选额度边界：空周期只回退 5m，大小写不自动放行；负数/字符串额度要保守处理。
assert.equal(isTimeframeAllowed('15m', { allowedTimeframes: [] }), false);
assert.equal(isTimeframeAllowed('15M', vipEntitlements), false);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: '5', activeSymbolCount: '4' }), true);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: '5', activeSymbolCount: '5' }), false);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: -1, activeSymbolCount: 0 }), false);
assert.equal(canAddWatchlistSymbol({ maxWatchlistSymbols: Number.NaN, activeSymbolCount: 0 }), false);

// 战绩边界：空 returns / 字符串收益不应崩溃；Free 仍锁定完整字段，SVIP 原样透传。
const sparsePerformance = {
  entryPrice: null,
  prices: {},
  returns: { '15m': '0.01' },
  maxFavorablePct: 0.05,
  maxAdversePct: -0.02,
  outcomeStatus: null,
  evaluatedUntil: null
};
const sparsePreview = visiblePerformanceForEntitlements(sparsePerformance, freeEntitlements);
assert.deepEqual(sparsePreview.returns, { '15m': '0.01', '1h': null });
assert.equal(sparsePreview.maxFavorablePct, null);
assert.equal(sparsePreview.previewOnly, true);
const sparseFull = visiblePerformanceForEntitlements(sparsePerformance, svipEntitlements);
assert.equal(sparseFull.maxFavorablePct, 0.05);
assert.deepEqual(sparseFull.lockedFields, []);

rmSync(outDir, { recursive: true, force: true });
console.log('frontend entitlement tests passed');
