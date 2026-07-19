import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-public-performance");
mkdirSync(outDir, { recursive: true });
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

function bundle(entry, name) {
  const outfile = path.join(outDir, `${name}.mjs`);
  execFileSync(process.execPath, [esbuildBin, entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], { cwd: root });
  return import(pathToFileURL(outfile));
}

try {
  const performance = await bundle("src/features/portal/publicPerformance.ts", "public-performance");
  const row = performance.toTrackRecordRow({
    id: "sig-1",
    symbol: "BTC",
    direction: "long",
    score: 82,
    time: "2026-07-18T00:00:00.000Z",
    performance: {
      returns: { "15m": 0.01, "1h": -0.005, "4h": null, "24h": null },
      outcomeStatus: "pending",
      access: { previewOnly: true, lockedFields: ["4h", "24h"] }
    }
  });
  assert.equal(row.return15m, "+1.00%");
  assert.equal(row.return1h, "-0.50%");
  assert.equal(row.return24h, "会员解锁");
  assert.equal(row.pending, true);
  assert.equal(row.completionStatus, "pending");

  const shortWindowLockedRow = performance.toTrackRecordRow({
    id: "sig-locked-short-windows",
    symbol: "ETH",
    direction: "short",
    score: 74,
    time: "2026-07-18T01:00:00.000Z",
    performance: {
      returns: { "15m": 0.02, "1h": 0.03, "24h": -0.04 },
      outcomeStatus: "completed",
      access: { previewOnly: true, lockedFields: ["15m", "1h"] }
    }
  });
  assert.equal(shortWindowLockedRow.return15m, "会员解锁");
  assert.equal(shortWindowLockedRow.return1h, "会员解锁");
  assert.equal(shortWindowLockedRow.return24h, "-4.00%");
  assert.equal(shortWindowLockedRow.completionStatus, "completed");

  const unlockedNull24h = performance.toTrackRecordRow({
    id: "sig-null-24h",
    symbol: "SOL",
    direction: "long",
    score: 71,
    time: "2026-07-18T02:00:00.000Z",
    performance: {
      returns: { "15m": 0.08, "1h": 0.12, "24h": null },
      outcomeStatus: "pending",
      access: { previewOnly: false, lockedFields: [] }
    }
  });
  assert.equal(unlockedNull24h.return24h, "计算中", "a null 24h return must not be inferred from shorter windows");

  const unlockedAbsent24h = performance.toTrackRecordRow({
    id: "sig-absent-24h",
    symbol: "XRP",
    direction: "long",
    score: 69,
    time: "2026-07-18T03:00:00.000Z",
    performance: {
      returns: { "15m": 0.05, "1h": 0.09 },
      outcomeStatus: "pending",
      access: { previewOnly: false, lockedFields: [] }
    }
  });
  assert.equal(unlockedAbsent24h.return24h, "计算中", "an absent 24h return must not be inferred from shorter windows");

  const trust = performance.toTrustSummaryView({
    windowDays: 7,
    generatedAt: "2026-07-19T00:00:00.000Z",
    methodologyVersion: "fixed-window-v1",
    totalSignals: 2980,
    completed24hCount: 1842,
    pending24hCount: 1138,
    directionalHitRate1h: 0.618,
    averageDirectionalReturn1h: 0.0042,
  });
  assert.deepEqual(trust, {
    hitRate: "61.8%",
    averageReturn: "+0.42%",
    sampleCount: "2,980",
    sampleCaption: "公开信号样本",
    isEmpty: false,
  });

  const emptyTrust = performance.toTrustSummaryView({
    windowDays: 7,
    generatedAt: "2026-07-19T00:00:00.000Z",
    methodologyVersion: "fixed-window-v1",
    totalSignals: 0,
    completed24hCount: 0,
    pending24hCount: 0,
    directionalHitRate1h: null,
    averageDirectionalReturn1h: null,
  });
  assert.equal(emptyTrust.hitRate, "计算中");
  assert.equal(emptyTrust.averageReturn, "计算中");
  assert.equal(emptyTrust.sampleCaption, "暂无满足公开条件的样本");
  assert.equal(emptyTrust.isEmpty, true);

  const inconsistentEmptyTrust = performance.toTrustSummaryView({
    windowDays: 7,
    generatedAt: "2026-07-19T00:00:00.000Z",
    methodologyVersion: "fixed-window-v1",
    totalSignals: 0,
    completed24hCount: 0,
    pending24hCount: 0,
    directionalHitRate1h: 0.75,
    averageDirectionalReturn1h: 0.0125,
  });
  assert.equal(inconsistentEmptyTrust.hitRate, "计算中", "zero signals must suppress an inconsistent hit rate");
  assert.equal(inconsistentEmptyTrust.averageReturn, "计算中", "zero signals must suppress an inconsistent average return");

  assert.equal(typeof performance.describeTrackRecordEmptyState, "function", "empty-state copy must be derived from active filters and server metadata");
  assert.equal(
    performance.describeTrackRecordEmptyState({ symbol: "BTC", direction: "long", delayHours: 8, historyDays: 7 }),
    "当前筛选：BTC · 看多。公开信号延迟 8 小时，历史范围 7 天；可清空币种或切换方向后重试，系统不会补造信号。"
  );
  assert.equal(
    performance.describeTrackRecordEmptyState({ symbol: "", direction: "all", delayHours: null, historyDays: null }),
    "当前筛选：全部币种 · 全部方向。服务端延迟与公开历史范围读取中；可调整筛选后重试，系统不会补造信号。"
  );

  assert.equal(performance.publicReturnTone("+0.42%"), "positive");
  assert.equal(performance.publicReturnTone("-0.31%"), "negative");
  assert.equal(performance.publicReturnTone("计算中"), "neutral");
  assert.equal(performance.publicReturnTone("会员解锁"), "locked");

  assert.deepEqual(performance.publicPerformanceState({ loading: false, error: null, staleAt: null, rows: [] }), { kind: "empty" });
  assert.deepEqual(performance.publicPerformanceState({ loading: true, error: null, staleAt: null, rows: [] }), { kind: "loading" });
  assert.deepEqual(
    performance.publicPerformanceState({ loading: false, error: "offline", staleAt: "2026-07-18T04:00:00.000Z", rows: [row] }),
    { kind: "unavailable", message: "offline", cached: [row], staleAt: "2026-07-18T04:00:00.000Z" }
  );
  assert.deepEqual(
    performance.publicPerformanceState({ loading: false, error: null, staleAt: "2026-07-18T05:00:00.000Z", rows: [row] }),
    { kind: "ready", rows: [row], staleAt: "2026-07-18T05:00:00.000Z" }
  );
  assert.equal(performance.formatPublicPercent(null), "计算中");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("public performance tests passed");
