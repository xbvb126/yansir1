import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-formal-delivery-retry");
const outFile = path.join(outDir, "formal-delivery-retry.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

function createClock(iso = "2026-07-23T04:00:00.000Z") {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    advanceTo: (next) => { current = new Date(next); }
  };
}

function delivery(id, overrides = {}) {
  return {
    id,
    user_id: "00000000-0000-0000-0000-000000000001",
    signal_event_id: `00000000-0000-0000-0000-0000000000${id}`,
    status: "failed",
    retry_count: 0,
    next_retry_at: null,
    last_attempt_at: null,
    reason: "provider_failed",
    ...overrides
  };
}

function retryStore(deliveries, clock) {
  const strictQueries = [];
  let transactionActive = 0;
  let transactionCalls = 0;
  const queryStrict = async (sql) => {
    strictQueries.push(sql);
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("update alert_deliveries") && normalized.includes("stale_delivery_reservation")) {
      for (const row of deliveries) {
        if (row.status === "sending" && new Date(row.last_attempt_at).getTime() <= clock.now().getTime() - 300_000) {
          row.status = "failed";
          row.reason = "stale_delivery_reservation";
          row.next_retry_at = clock.now().toISOString();
        }
      }
      return [];
    }
    if (normalized.startsWith("update alert_deliveries") && normalized.includes("watchlist_no_longer_matches")) {
      for (const row of deliveries) {
        if (row.status === "failed" && row.matches_watchlist === false) {
          row.status = "skipped";
          row.reason = "watchlist_no_longer_matches";
          row.next_retry_at = null;
        }
      }
      return [];
    }
    if (normalized.startsWith("with due as") && normalized.includes("update alert_deliveries")) {
      return deliveries
        .filter((row) => row.status === "failed" && row.matches_watchlist !== false && row.retry_count < 3 && (!row.next_retry_at || new Date(row.next_retry_at) <= clock.now()))
        .slice(0, 50)
        .map((row) => {
          row.status = "sending";
          row.retry_count += 1;
          row.last_attempt_at = clock.now().toISOString();
          row.next_retry_at = null;
          return { delivery_id: row.id, user_id: row.user_id, signal_event_id: row.signal_event_id };
        });
    }
    if (normalized.includes("count(*)::text as exhausted")) {
      return [{ exhausted: String(deliveries.filter((row) => row.status === "failed" && row.retry_count >= 3).length) }];
    }
    throw new Error(`Unhandled retry query: ${normalized}`);
  };
  return {
    enabled: true,
    strictQueries,
    get transactionActive() { return transactionActive; },
    get transactionCalls() { return transactionCalls; },
    query: async () => { throw new Error("retry worker must use strict database access"); },
    queryStrict,
    withTransaction: async (operation) => {
      transactionCalls += 1;
      transactionActive += 1;
      try {
        return await operation({ query: queryStrict });
      } finally {
        transactionActive -= 1;
      }
    }
  };
}

function reserveAndDeliver(deliveries, clock, provider) {
  return async (candidate) => {
    const row = deliveries.find((item) => item.id === candidate.deliveryId);
    if (!row || row.status !== "sending" || row.retry_count > 3) return { skipped: true };
    provider.assertOutsideTransaction?.();
    if (provider.result.sent) {
      row.status = "sent";
      return { sent: true };
    }
    row.status = "failed";
    row.next_retry_at = new Date(clock.now().getTime() + (2 ** Math.max(0, row.retry_count - 1)) * 60_000).toISOString();
    return { failed: true };
  };
}

mkdirSync(outDir, { recursive: true });
try {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/formal-delivery-retry.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { FormalDeliveryRetry } = await import(pathToFileURL(outFile));
  const clock = createClock();
  const deliveries = [delivery("1")];
  const provider = { result: { sent: false } };
  const store = retryStore(deliveries, clock);
  provider.assertOutsideTransaction = () => assert.equal(store.transactionActive, 0, "provider I/O must occur after the claim transaction commits");
  const retry = new FormalDeliveryRetry({
    database: store,
    retryDelivery: reserveAndDeliver(deliveries, clock, provider),
    now: clock.now
  });

  const first = await retry.runOnce();
  assert.equal(first.picked, 1);
  assert.equal(first.failed, 1);
  assert.equal(deliveries[0].retry_count, 1);
  assert.ok(new Date(deliveries[0].next_retry_at) > clock.now());
  assert.ok(
    store.strictQueries.some((sql) => sql.replace(/\s+/g, " ").trim().toLowerCase().startsWith("with due as")),
    "due rows must be atomically claimed in a strict transaction before provider I/O"
  );
  const claimSql = store.strictQueries.find((sql) => sql.replace(/\s+/g, " ").trim().toLowerCase().startsWith("with due as"));
  assert.match(
    claimSql.replace(/\s+/g, " ").toLowerCase(),
    /from alert_deliveries ad where ad\.channel = 'feishu'/,
    "the due CTE must bind the ad alias before correlated watchlist predicates reference it"
  );
  assert.equal(store.transactionCalls, 1);

  clock.advanceTo(deliveries[0].next_retry_at);
  provider.result = { sent: true };
  const second = await retry.runOnce();
  assert.equal(second.sent, 1);
  assert.equal(deliveries[0].status, "sent");

  const exhausted = [delivery("2", { retry_count: 3 })];
  let exhaustedAttempts = 0;
  const exhaustedRetry = new FormalDeliveryRetry({
    database: retryStore(exhausted, clock),
    retryDelivery: async () => { exhaustedAttempts += 1; return { sent: true }; },
    now: clock.now
  });
  const exhaustedStatus = await exhaustedRetry.runOnce();
  assert.equal(exhaustedAttempts, 0, "a row at the retry limit must never be sent again");
  assert.equal(exhaustedStatus.exhausted, 1);

  const contended = [delivery("3")];
  let reservationCalls = 0;
  const reserveOnce = async (candidate) => {
    const row = contended.find((item) => item.id === candidate.deliveryId);
    if (row.status !== "sending") return { skipped: true };
    reservationCalls += 1;
    return { sent: true };
  };
  const workerA = new FormalDeliveryRetry({ database: retryStore(contended, clock), retryDelivery: reserveOnce, now: clock.now });
  const workerB = new FormalDeliveryRetry({ database: retryStore(contended, clock), retryDelivery: reserveOnce, now: clock.now });
  await Promise.all([workerA.runOnce(), workerB.runOnce()]);
  assert.equal(reservationCalls, 1, "two workers must only reserve one retry attempt");

  const stale = [delivery("4", { status: "sending", retry_count: 3, last_attempt_at: "2026-07-23T03:54:00.000Z" })];
  const staleRetry = new FormalDeliveryRetry({
    database: retryStore(stale, clock),
    retryDelivery: async () => ({ skipped: true }),
    now: clock.now
  });
  await staleRetry.runOnce();
  assert.equal(stale[0].reason, "stale_delivery_reservation");
  assert.equal(stale[0].status, "failed");

  const downgraded = [delivery("5")];
  let sentAfterDowngrade = 0;
  const downgradedRetry = new FormalDeliveryRetry({
    database: retryStore(downgraded, clock),
    retryDelivery: async (candidate) => {
      const row = downgraded.find((item) => item.id === candidate.deliveryId);
      row.status = "skipped";
      row.reason = "plan_or_feishu_disabled";
      sentAfterDowngrade += 1;
      return { skipped: true };
    },
    now: clock.now
  });
  const downgradedStatus = await downgradedRetry.runOnce();
  assert.equal(sentAfterDowngrade, 1);
  assert.equal(downgraded[0].status, "skipped", "current plan and push settings must be applied at retry time");
  assert.equal(downgradedStatus.sent, 0);

  let timerCallback;
  const idleRetry = new FormalDeliveryRetry({
    database: retryStore([], clock),
    retryDelivery: async () => { throw new Error("strategy executor must not be called by retry timer"); },
    now: clock.now,
    setInterval: (callback) => { timerCallback = callback; return 1; },
    clearInterval: () => {}
  });
  idleRetry.start();
  await timerCallback();
  idleRetry.stop();

  const outageRetry = new FormalDeliveryRetry({
    database: {
      enabled: true,
      query: async () => { throw new Error("must not use swallowing query"); },
      queryStrict: async () => { throw new Error("database_offline"); },
      withTransaction: async () => { throw new Error("database_offline"); }
    },
    retryDelivery: async () => ({ sent: true }),
    now: clock.now
  });
  const outage = await outageRetry.runOnce();
  assert.equal(outage.lastError, "database_offline", "a database outage must not be reported as an empty healthy retry run");

  const removedWatchlist = [delivery("6", { matches_watchlist: false })];
  let removedAttempts = 0;
  const removedRetry = new FormalDeliveryRetry({
    database: retryStore(removedWatchlist, clock),
    retryDelivery: async () => { removedAttempts += 1; return { sent: true }; },
    now: clock.now
  });
  const firstRemoved = await removedRetry.runOnce();
  const secondRemoved = await removedRetry.runOnce();
  assert.equal(firstRemoved.picked, 0);
  assert.equal(secondRemoved.picked, 0, "a removed watchlist must not be repeatedly claimed");
  assert.equal(removedAttempts, 0);
  assert.equal(removedWatchlist[0].status, "skipped");
  assert.equal(removedWatchlist[0].reason, "watchlist_no_longer_matches");
  assert.equal(removedWatchlist[0].retry_count, 0, "terminal watchlist handling must not burn a retry attempt");

  console.log("formal delivery retry tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
