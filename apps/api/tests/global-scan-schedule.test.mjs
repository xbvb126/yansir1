import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-global-scan-schedule");
const outFile = path.join(outDir, "global-scan-schedule.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/global-scan-schedule.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { nextGlobalScanSlot, timeframesForClosedSlot } = await import(pathToFileURL(outFile));

  const at140201 = nextGlobalScanSlot(new Date("2026-07-21T14:02:01.000Z"));
  assert.equal(at140201.closedAt.toISOString(), "2026-07-21T14:05:00.000Z");
  assert.equal(at140201.runAt.toISOString(), "2026-07-21T14:05:05.000Z");
  assert.equal(at140201.key, "2026-07-21T14:05:00.000Z");

  assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:05:00.000Z")), ["5m"]);
  assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:15:00.000Z")), ["5m", "15m"]);
  assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:30:00.000Z")), ["5m", "15m", "30m"]);
  assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T15:00:00.000Z")), ["5m", "15m", "30m", "1h"]);
  assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T16:00:00.000Z")), ["5m", "15m", "30m", "1h", "4h"]);

  console.log("global scan schedule tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
