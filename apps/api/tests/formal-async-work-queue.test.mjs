import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-formal-async-work-queue");
const outFile = path.join(outDir, "formal-async-work-queue.mjs");
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

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/formal-async-work-queue.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { FormalAsyncWorkQueue } = await import(pathToFileURL(outFile));
  const blocked = deferred();
  const enqueuedAt = new Date("2026-07-23T12:00:00.000Z");
  let currentTime = new Date("2026-07-23T12:00:01.000Z");
  const queue = new FormalAsyncWorkQueue({
    capacity: 1,
    concurrency: 1,
    now: () => new Date(currentTime)
  });

  assert.equal(queue.enqueue({
    key: "BTCUSDT:5m:formal-match",
    closedAt: new Date("2026-07-23T11:55:00.000Z"),
    enqueuedAt,
    execute: () => blocked.promise
  }), "accepted");
  await waitFor(() => queue.getStatus().activeWorkers === 1);
  assert.equal(
    queue.getStatus().oldestActiveAt,
    enqueuedAt.toISOString(),
    "an active blocked task must remain visible to readiness age checks"
  );
  assert.equal(queue.getStatus().oldestInFlightAt, enqueuedAt.toISOString());
  assert.equal(queue.enqueue({
    key: "ETHUSDT:5m:formal-match",
    closedAt: new Date("2026-07-23T11:55:00.000Z"),
    enqueuedAt: currentTime,
    execute: async () => {}
  }), "pressure");
  assert.equal(queue.getStatus().latestPressureAt, currentTime.toISOString());
  assert.equal(queue.getStatus().pressureActive, true);

  blocked.resolve();
  await waitFor(() => queue.getStatus().completed === 1);
  assert.equal(queue.getStatus().oldestActiveAt, null);
  assert.equal(queue.getStatus().oldestInFlightAt, null);
  currentTime = new Date(currentTime.getTime() + 60_001);
  assert.equal(queue.getStatus().pressureRejected, 1);
  assert.equal(queue.getStatus().pressureActive, false);

  console.log("formal async work queue tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
