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
