import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-formal-signal-reconciler");
const outFile = path.join(outDir, "formal-signal-reconciler.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/formal-signal-reconciler.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { FormalSignalReconciler } = await import(pathToFileURL(outFile));
  const completedKeys = new Set();
  const enqueued = [];
  const reconciler = new FormalSignalReconciler({
    targets: async () => ({ symbols: ["BTCUSDT", "ETHUSDT"], timeframes: ["5m", "15m"] }),
    closeEvaluations: {
      getLatestPersistedCloseAt: async () => new Date("2026-07-23T03:30:00.000Z"),
      getEarliestIncompleteCloseAt: async () => null,
      findCompletedKeys: async (keys) => new Set(keys.filter((key) => completedKeys.has(key)))
    },
    enqueue: (job) => {
      enqueued.push(job);
      return "accepted";
    },
    intervalSeconds: 900,
    lookbackMinutes: 1440,
    batchSize: 300
  });

  const now = new Date("2026-07-23T04:00:00.000Z");
  const first = await reconciler.runOnce(now);
  assert.ok(first.candidates > 0);
  assert.ok(enqueued.every((job) => job.source === "reconciliation"));
  assert.ok(enqueued.every((job) => job.closedAt <= now));
  assert.ok(!enqueued.some((job) => completedKeys.has(job.key)));
  assert.equal(first.enqueued, enqueued.length);

  for (const job of enqueued) completedKeys.add(job.key);
  const countAfterFirstPass = enqueued.length;
  const second = await reconciler.runOnce(now);
  assert.equal(second.enqueued, 0, "succeeded jobs must not be replayed by a subsequent reconciliation pass");
  assert.equal(enqueued.length, countAfterFirstPass);

  const oldReconciler = new FormalSignalReconciler({
    targets: async () => ({ symbols: ["BTCUSDT"], timeframes: ["5m"] }),
    closeEvaluations: {
      getLatestPersistedCloseAt: async () => new Date("2026-07-20T04:00:00.000Z"),
      getEarliestIncompleteCloseAt: async () => null,
      findCompletedKeys: async () => new Set()
    },
    enqueue: () => "accepted"
  });
  const oldStatus = await oldReconciler.runOnce(now);
  assert.equal(oldStatus.lastError, "recovery_window_exceeded");

  const retryJobs = [];
  const retryReconciler = new FormalSignalReconciler({
    targets: async () => ({ symbols: ["BTCUSDT"], timeframes: ["5m"] }),
    closeEvaluations: {
      getLatestPersistedCloseAt: async () => new Date("2026-07-23T03:55:00.000Z"),
      getEarliestIncompleteCloseAt: async () => new Date("2026-07-23T03:30:00.000Z"),
      findCompletedKeys: async () => new Set()
    },
    enqueue: (job) => {
      retryJobs.push(job);
      return "accepted";
    }
  });
  await retryReconciler.runOnce(now);
  assert.ok(
    retryJobs.some((job) => job.closedAt.getTime() <= new Date("2026-07-23T03:35:00.000Z").getTime()),
    "a failed close before the latest successful evaluation remains eligible for reconciliation"
  );

  console.log("formal signal reconciler tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
