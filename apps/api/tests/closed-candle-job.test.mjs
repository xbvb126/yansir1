import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-closed-candle-job");
const outFile = path.join(outDir, "closed-candle-job.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/closed-candle-job.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const {
    closedCandleOpenTimesBetween,
    expectedFormalBarTime,
    formalSignalJobFromClosedKline
  } = await import(pathToFileURL(outFile));

  assert.equal(formalSignalJobFromClosedKline({
    t: Date.parse("2026-07-23T03:45:00.000Z"),
    T: Date.parse("2026-07-23T03:49:59.999Z"),
    s: "btcusdt",
    i: "5m",
    x: false
  }), null);

  const job = formalSignalJobFromClosedKline({
    t: Date.parse("2026-07-23T03:45:00.000Z"),
    T: Date.parse("2026-07-23T03:49:59.999Z"),
    s: "BTCUSDT",
    i: "5m",
    x: true
  }, new Date("2026-07-23T03:50:00.250Z"));

  assert.equal(job.key, "BTCUSDT:5m:1784778300000");
  assert.equal(job.closedAt.toISOString(), "2026-07-23T03:50:00.000Z");
  assert.equal(expectedFormalBarTime("5m", job.closedAt), job.klineOpenTime);

  assert.throws(() => formalSignalJobFromClosedKline({
    t: Date.parse("2026-07-23T03:44:00.000Z"),
    T: Date.parse("2026-07-23T03:49:59.999Z"),
    s: "BTCUSDT",
    i: "5m",
    x: true
  }), /unexpected_closed_kline_boundary/);

  assert.throws(() => formalSignalJobFromClosedKline({
    t: Date.parse("2026-07-23T03:40:00.000Z"),
    T: Date.parse("2026-07-23T03:49:59.998Z"),
    s: "BTCUSDT",
    i: "5m",
    x: true
  }), /unexpected_closed_kline_boundary/);

  assert.throws(
    () => expectedFormalBarTime("toString", new Date("2026-07-23T03:50:00.000Z")),
    /unsupported_formal_timeframe/);

  assert.deepEqual(
    closedCandleOpenTimesBetween(
      "5m",
      new Date("2026-07-23T03:35:00.000Z"),
      new Date("2026-07-23T03:50:00.000Z")
    ),
    [
      Date.parse("2026-07-23T03:35:00.000Z"),
      Date.parse("2026-07-23T03:40:00.000Z"),
      Date.parse("2026-07-23T03:45:00.000Z")
    ]
  );

  console.log("closed candle job tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
