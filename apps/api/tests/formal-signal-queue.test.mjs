import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-formal-signal-queue");
const outFile = path.join(outDir, "formal-signal-queue.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function waitFor(predicate, message = "condition was not met") {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

function formalJob(symbol, timeframe, klineOpenTime) {
  return {
    key: `${symbol}:${timeframe}:${klineOpenTime}`,
    symbol,
    timeframe,
    klineOpenTime,
    closedAt: new Date(klineOpenTime + 300_000),
    enqueuedAt: new Date(klineOpenTime + 300_500),
    source: "realtime"
  };
}

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/formal-signal-queue.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { FormalSignalQueue } = await import(pathToFileURL(outFile));

  {
    const starts = [];
    const completions = new Map();
    let active = 0;
    let maxActive = 0;
    const queue = new FormalSignalQueue({
      capacity: 5,
      concurrency: 2,
      now: () => new Date(1_700_001_000_000),
      execute: async (job) => {
        starts.push({ symbol: job.symbol, klineOpenTime: job.klineOpenTime });
        active += 1;
        maxActive = Math.max(maxActive, active);
        const completion = deferred();
        completions.set(job.key, completion);
        await completion.promise;
        active -= 1;
        return { status: "completed", job, signalCount: 0 };
      }
    });
    const btc5m = formalJob("BTCUSDT", "5m", 1_700_000_000_000);
    const next = formalJob("BTCUSDT", "5m", btc5m.klineOpenTime + 300_000);
    const eth5m = formalJob("ETHUSDT", "5m", btc5m.klineOpenTime);

    assert.equal(queue.enqueue(btc5m), "accepted");
    assert.equal(queue.enqueue(btc5m), "duplicate");
    assert.equal(queue.enqueue(next), "accepted");
    assert.equal(queue.enqueue(eth5m), "accepted");
    await waitFor(() => starts.length === 2, "different lanes should start without waiting for a blocked lane");
    assert.deepEqual(starts.map(({ symbol }) => symbol).sort(), ["BTCUSDT", "ETHUSDT"]);
    assert.ok(maxActive >= 2, "different keys may run concurrently");

    completions.get(btc5m.key).resolve();
    await waitFor(() => starts.filter(({ symbol }) => symbol === "BTCUSDT").length === 2);
    assert.deepEqual(
      starts.filter(({ symbol }) => symbol === "BTCUSDT").map(({ klineOpenTime }) => klineOpenTime),
      [btc5m.klineOpenTime, next.klineOpenTime],
      "same symbol/timeframe remains ordered"
    );
    completions.get(eth5m.key).resolve();
    completions.get(next.key).resolve();
    await waitFor(() => queue.getStatus().completed === 3);
    assert.deepEqual(queue.getStatus().latencyMs, { p50: 700_000, p95: 700_000 });
  }

  {
    const blocked = deferred();
    const pressureJobs = [];
    const queue = new FormalSignalQueue({
      capacity: 1,
      concurrency: 1,
      execute: async (job) => {
        await blocked.promise;
        return { status: "completed", job, signalCount: 0 };
      },
      onPressure: (job) => pressureJobs.push(job.key)
    });
    const btc5m = formalJob("BTCUSDT", "5m", 1_700_000_000_000);
    const eth5m = formalJob("ETHUSDT", "5m", 1_700_000_300_000);

    assert.equal(queue.enqueue(btc5m), "accepted");
    await waitFor(() => queue.getStatus().activeWorkers === 1);
    assert.equal(queue.enqueue(eth5m), "pressure");
    assert.equal(queue.getStatus().pressureRejected, 1);
    assert.deepEqual(pressureJobs, [eth5m.key]);
    blocked.resolve();
    await waitFor(() => queue.getStatus().completed === 1);
    queue.stop();
    assert.equal(queue.enqueue(eth5m), "pressure", "a stopped queue must reject new formal jobs");
  }

  console.log("formal signal queue tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
