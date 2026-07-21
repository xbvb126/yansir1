import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-aligned-global-scanner");
const outFile = path.join(outDir, "aligned-global-scanner.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
}

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/aligned-global-scanner.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { AlignedGlobalScanner } = await import(pathToFileURL(outFile));

  {
    let now = new Date("2026-07-21T14:02:01.000Z");
    let callback;
    let delay;
    const executions = [];
    const scanner = new AlignedGlobalScanner({
      now: () => now,
      setTimer: (fn, ms) => {
        callback = fn;
        delay = ms;
        return 1;
      },
      clearTimer: () => {},
      executeSlot: async (slot) => {
        executions.push(slot.key);
        return {
          scannedSymbols: 12,
          matchedSignals: 2,
          failedSymbols: 1,
          errors: ["BADUSDT: unavailable"]
        };
      }
    });

    scanner.start();
    assert.equal(delay, 184_000);
    assert.equal(scanner.getStatus().nextRunAt, "2026-07-21T14:05:05.000Z");

    now = new Date("2026-07-21T14:05:05.000Z");
    const callbackResult = callback();
    assert.equal(callbackResult, undefined, "timer callbacks must not leak promises to setTimeout");
    await flushAsyncWork();

    assert.deepEqual(executions, ["2026-07-21T14:05:00.000Z"]);
    assert.deepEqual(scanner.getStatus(), {
      enabled: true,
      running: false,
      lastSlotAt: "2026-07-21T14:05:00.000Z",
      lastStartedAt: "2026-07-21T14:05:05.000Z",
      lastFinishedAt: "2026-07-21T14:05:05.000Z",
      nextRunAt: "2026-07-21T14:10:05.000Z",
      lastTimeframes: ["5m"],
      scannedSymbols: 12,
      matchedSignals: 2,
      failedSymbols: 1,
      skippedOverlappingRuns: 0,
      errors: ["BADUSDT: unavailable"]
    });
  }

  {
    let now = new Date("2026-07-21T14:02:01.000Z");
    let nextTimerId = 1;
    const timers = new Map();
    const clearedTimers = [];
    let executions = 0;
    const execution = deferred();
    const scanner = new AlignedGlobalScanner({
      now: () => now,
      setTimer: (fn) => {
        const timerId = nextTimerId;
        nextTimerId += 1;
        timers.set(timerId, fn);
        return timerId;
      },
      clearTimer: (timerId) => {
        clearedTimers.push(timerId);
        timers.delete(timerId);
      },
      executeSlot: async () => {
        executions += 1;
        return execution.promise;
      }
    });

    scanner.start();
    now = new Date("2026-07-21T14:05:05.000Z");
    const initialTimerId = 1;
    const initialCallback = timers.get(initialTimerId);
    timers.delete(initialTimerId);
    initialCallback();
    await Promise.resolve();
    initialCallback();
    await flushAsyncWork();

    assert.equal(executions, 1);
    assert.equal(scanner.getStatus().skippedOverlappingRuns, 1);

    execution.resolve({ scannedSymbols: 1, matchedSignals: 0, failedSymbols: 0, errors: [] });
    await flushAsyncWork();
    assert.equal(timers.size, 1);
    assert.equal(nextTimerId, 4);

    const nextTimerIdAfterRun = 3;
    scanner.stop();
    assert.deepEqual(clearedTimers, [2, nextTimerIdAfterRun]);
    assert.equal(timers.size, 0);
    assert.equal(scanner.getStatus().enabled, false);
    assert.equal(scanner.getStatus().nextRunAt, null);
  }

  {
    let now = new Date("2026-07-21T14:02:01.000Z");
    let nextTimerId = 1;
    const timers = new Map();
    const execution = deferred();
    const scanner = new AlignedGlobalScanner({
      now: () => now,
      setTimer: (fn) => {
        const id = nextTimerId++;
        timers.set(id, fn);
        return id;
      },
      clearTimer: (id) => timers.delete(id),
      executeSlot: async () => execution.promise
    });

    scanner.start();
    const firstCallback = timers.get(1);
    timers.delete(1);
    now = new Date("2026-07-21T14:05:05.000Z");
    firstCallback();
    await Promise.resolve();
    assert.equal(scanner.getStatus().nextRunAt, "2026-07-21T14:10:05.000Z", "a running scan must expose the next future boundary");
    assert.equal(timers.size, 1, "only one future timer should exist while execution is running");

    const missedCallback = [...timers.values()][0];
    timers.clear();
    now = new Date("2026-07-21T14:17:05.000Z");
    missedCallback();
    await flushAsyncWork();

    assert.equal(scanner.getStatus().skippedOverlappingRuns, 2, "the 14:10 and 14:15 boundaries must both be counted as skipped");
    assert.equal(scanner.getStatus().nextRunAt, "2026-07-21T14:20:05.000Z");
    assert.equal(timers.size, 1, "overrun recovery must retain exactly one future timer");

    execution.resolve({ scannedSymbols: 1, matchedSignals: 0, failedSymbols: 0, errors: [] });
    await flushAsyncWork();
    assert.equal(timers.size, 1, "completion must not add a duplicate timer");
  }

  {
    let now = new Date("2026-07-21T14:02:01.000Z");
    const timers = [];
    let executions = 0;
    const scanner = new AlignedGlobalScanner({
      now: () => now,
      setTimer: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimer: () => {},
      executeSlot: async () => {
        executions += 1;
        if (executions === 1) return { scannedSymbols: 9, matchedSignals: 4, failedSymbols: 2, errors: ["partial"] };
        throw new Error("top-level failure");
      }
    });

    scanner.start();
    now = new Date("2026-07-21T14:05:05.000Z");
    timers.shift()();
    await flushAsyncWork();
    now = new Date("2026-07-21T14:10:05.000Z");
    timers.shift()();
    await flushAsyncWork();

    const status = scanner.getStatus();
    assert.equal(status.scannedSymbols, 0);
    assert.equal(status.matchedSignals, 0);
    assert.equal(status.failedSymbols, 0);
    assert.deepEqual(status.errors, ["top-level failure"]);
  }

  {
    let now = new Date("2026-07-21T14:02:01.000Z");
    let callback;
    const scanner = new AlignedGlobalScanner({
      now: () => now,
      setTimer: (fn) => {
        callback = fn;
        return 2;
      },
      clearTimer: () => {},
      executeSlot: async () => {
        throw new Error("scanner unavailable");
      }
    });

    scanner.start();
    now = new Date("2026-07-21T14:05:05.000Z");
    callback();
    await flushAsyncWork();

    assert.equal(scanner.getStatus().running, false);
    assert.deepEqual(scanner.getStatus().errors, ["scanner unavailable"]);
    assert.equal(scanner.getStatus().lastFinishedAt, "2026-07-21T14:05:05.000Z");
  }

  console.log("aligned global scanner tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
