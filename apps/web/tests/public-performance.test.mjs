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
  assert.deepEqual(performance.publicPerformanceState({ loading: false, error: null, staleAt: null, rows: [] }), { kind: "empty" });
  assert.equal(performance.formatPublicPercent(null), "计算中");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("public performance tests passed");
