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
    await callback();

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
    const firstRun = initialCallback();
    await Promise.resolve();
    await initialCallback();

    assert.equal(executions, 1);
    assert.equal(scanner.getStatus().skippedOverlappingRuns, 1);

    execution.resolve({ scannedSymbols: 1, matchedSignals: 0, failedSymbols: 0, errors: [] });
    await firstRun;
    assert.equal(timers.size, 1);
    assert.equal(nextTimerId, 3);

    const nextTimerIdAfterRun = 2;
    scanner.stop();
    assert.deepEqual(clearedTimers, [nextTimerIdAfterRun]);
    assert.equal(timers.size, 0);
    assert.equal(scanner.getStatus().enabled, false);
    assert.equal(scanner.getStatus().nextRunAt, null);
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
    await callback();

    assert.equal(scanner.getStatus().running, false);
    assert.deepEqual(scanner.getStatus().errors, ["scanner unavailable"]);
    assert.equal(scanner.getStatus().lastFinishedAt, "2026-07-21T14:05:05.000Z");
  }

  console.log("aligned global scanner tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
