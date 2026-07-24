# Global Strategy Aligned Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run an automatic full-market strategy scan on every natural five-minute candle boundary, evaluate only the timeframes that just closed, and pass matched signals through the existing global event, inbox, entitlement, cooldown, and delivery lifecycle.

**Architecture:** Add a pure UTC boundary calculator and a small one-shot-timer coordinator so scheduling is deterministic and does not drift. Integrate the coordinator into `StrategyService`, where a system-level executor discovers all supported symbols, runs the due timeframes with bounded concurrency, and reuses the existing signal persistence and user matching pipeline. Expose a compact read-only status endpoint without changing the existing user-owned interval schedule.

**Tech Stack:** NestJS 10, TypeScript 5, Node.js timers, esbuild-backed Node contract tests, PostgreSQL idempotency constraints already present in `signal_events`, `user_signal_inbox`, and `alert_deliveries`.

## Global Constraints

- Scan on natural UTC clock boundaries `00, 05, 10, ... 55`, with a fixed 5-second closed-candle grace period.
- Supported timeframes are exactly `5m`, `15m`, `30m`, `1h`, and `4h`.
- Scan every supported market symbol, independent of a single user's plan limits.
- Run a timeframe only when its candle closes; do not recalculate an unclosed long timeframe every five minutes.
- A matched signal must use the existing lifecycle: global event, watchlist matching, user inbox, entitlement/cooldown checks, and configured delivery.
- Do not add Redis, a queue, a cron dependency, or a new frontend route in this change.
- Keep the existing realtime WebSocket tracker and user-controlled interval schedule APIs compatible.

## File Structure

- Create `apps/api/src/modules/strategy/global-scan-schedule.ts`: pure UTC slot calculation, slot keys, due-timeframe selection, and exported state/result types.
- Create `apps/api/src/modules/strategy/aligned-global-scanner.ts`: one-shot timer lifecycle, overlap guard, state transitions, and dependency-injected batch execution.
- Modify `apps/api/src/modules/strategy/strategy.service.ts`: own the coordinator, execute full-market slot batches, reuse persistence/inbox delivery, and stop timers on shutdown.
- Modify `apps/api/src/modules/strategy/strategy.controller.ts`: expose `GET /api/strategy/scan/global/status`.
- Create `apps/api/tests/global-scan-schedule.test.mjs`: deterministic scheduler unit tests compiled through the repository's esbuild convention.
- Create `apps/api/tests/aligned-global-scanner.test.mjs`: fake-clock/fake-timer coordinator tests.
- Modify `apps/api/tests/strategy-contract.test.mjs`: integration contract for full-market execution, partial failure, inbox/delivery idempotency, and status.
- Modify `apps/api/package.json`: add focused test scripts.
- Modify `docs/API_CONTRACTS.md`: document automatic global scanning and its status response.

---

### Task 1: Deterministic UTC Scan Slots

**Files:**
- Create: `apps/api/src/modules/strategy/global-scan-schedule.ts`
- Create: `apps/api/tests/global-scan-schedule.test.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `GlobalScanTimeframe`, `GlobalScanSlot`, `GLOBAL_SCAN_GRACE_MS`, `nextGlobalScanSlot(now)`, and `timeframesForClosedSlot(closedAt)`.
- Consumes: only JavaScript `Date`; no NestJS, database, network, or process environment state.

- [ ] **Step 1: Write the failing schedule test**

Create an esbuild-backed Node test that imports the wished-for helper and asserts exact UTC behavior:

```js
const at140201 = nextGlobalScanSlot(new Date("2026-07-21T14:02:01.000Z"));
assert.equal(at140201.closedAt.toISOString(), "2026-07-21T14:05:00.000Z");
assert.equal(at140201.runAt.toISOString(), "2026-07-21T14:05:05.000Z");
assert.equal(at140201.key, "2026-07-21T14:05:00.000Z");

assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:05:00.000Z")), ["5m"]);
assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:15:00.000Z")), ["5m", "15m"]);
assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T14:30:00.000Z")), ["5m", "15m", "30m"]);
assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T15:00:00.000Z")), ["5m", "15m", "30m", "1h"]);
assert.deepEqual(timeframesForClosedSlot(new Date("2026-07-21T16:00:00.000Z")), ["5m", "15m", "30m", "1h", "4h"]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:global-scan-schedule -w apps/api`

Expected: FAIL because `global-scan-schedule.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal pure schedule module**

```ts
export const GLOBAL_SCAN_GRACE_MS = 5_000;
export type GlobalScanTimeframe = "5m" | "15m" | "30m" | "1h" | "4h";
export type GlobalScanSlot = { key: string; closedAt: Date; runAt: Date; timeframes: GlobalScanTimeframe[] };

export function timeframesForClosedSlot(closedAt: Date): GlobalScanTimeframe[] {
  const minute = closedAt.getUTCMinutes();
  const hour = closedAt.getUTCHours();
  const result: GlobalScanTimeframe[] = ["5m"];
  if (minute % 15 === 0) result.push("15m");
  if (minute % 30 === 0) result.push("30m");
  if (minute === 0) result.push("1h");
  if (minute === 0 && hour % 4 === 0) result.push("4h");
  return result;
}

export function nextGlobalScanSlot(now: Date): GlobalScanSlot {
  const currentClosedAtMs = Math.floor(now.getTime() / 300_000) * 300_000;
  const currentRunAtMs = currentClosedAtMs + GLOBAL_SCAN_GRACE_MS;
  const closedAtMs = now.getTime() < currentRunAtMs ? currentClosedAtMs : currentClosedAtMs + 300_000;
  const closedAt = new Date(closedAtMs);
  return {
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAtMs + GLOBAL_SCAN_GRACE_MS),
    timeframes: timeframesForClosedSlot(closedAt)
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm run test:global-scan-schedule -w apps/api`

Expected: PASS with all five boundary combinations and the 5-second grace assertion.

- [ ] **Step 5: Commit the pure scheduler**

```bash
git add apps/api/src/modules/strategy/global-scan-schedule.ts apps/api/tests/global-scan-schedule.test.mjs apps/api/package.json
git commit -m "feat: calculate aligned global scan slots"
```

---

### Task 2: One-Shot Timer Coordinator and Overlap Guard

**Files:**
- Create: `apps/api/src/modules/strategy/aligned-global-scanner.ts`
- Create: `apps/api/tests/aligned-global-scanner.test.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `nextGlobalScanSlot()` and a callback `executeSlot(slot: GlobalScanSlot): Promise<GlobalScanExecutionResult>`.
- Produces: `AlignedGlobalScanner.start()`, `.stop()`, `.getStatus()`, plus a serializable `GlobalScanStatus`.

- [ ] **Step 1: Write the failing coordinator tests**

Use an injected clock and timer functions. Capture the timer callback rather than sleeping:

```js
let now = new Date("2026-07-21T14:02:01.000Z");
let callback;
let delay;
const executions = [];
const scanner = new AlignedGlobalScanner({
  now: () => now,
  setTimer: (fn, ms) => { callback = fn; delay = ms; return 1; },
  clearTimer: () => {},
  executeSlot: async (slot) => {
    executions.push(slot.key);
    return { scannedSymbols: 12, matchedSignals: 2, failedSymbols: 1, errors: ["BADUSDT: unavailable"] };
  }
});

scanner.start();
assert.equal(delay, 184_000);
assert.equal(scanner.getStatus().nextRunAt, "2026-07-21T14:05:05.000Z");
now = new Date("2026-07-21T14:05:05.000Z");
await callback();
assert.deepEqual(executions, ["2026-07-21T14:05:00.000Z"]);
assert.equal(scanner.getStatus().matchedSignals, 2);
```

Add a deferred `executeSlot` promise and invoke the captured callback twice; assert the second call increments `skippedOverlappingRuns` and does not call `executeSlot` again. Assert `stop()` clears the timer and makes `nextRunAt` null.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:aligned-global-scanner -w apps/api`

Expected: FAIL because `AlignedGlobalScanner` does not exist.

- [ ] **Step 3: Implement the coordinator**

Implement the class with these exact state fields:

```ts
export type GlobalScanExecutionResult = {
  scannedSymbols: number;
  matchedSignals: number;
  failedSymbols: number;
  errors: string[];
};

export type GlobalScanStatus = {
  enabled: boolean;
  running: boolean;
  lastSlotAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  lastTimeframes: GlobalScanTimeframe[];
  scannedSymbols: number;
  matchedSignals: number;
  failedSymbols: number;
  skippedOverlappingRuns: number;
  errors: string[];
};
```

`start()` sets `enabled`, then schedules one timer from `nextGlobalScanSlot(now())`. The timer callback calls a private `run(slot)` method and always recalculates a new absolute slot in `finally`; it must not use `setInterval`. If `running` is already true, increment `skippedOverlappingRuns` and reschedule without calling the executor. `stop()` clears the active timer and prevents `finally` from rescheduling.

- [ ] **Step 4: Verify coordinator behavior**

Run: `npm run test:aligned-global-scanner -w apps/api`

Expected: PASS for absolute delay, result state, overlap skipping, error state, and stop cleanup.

- [ ] **Step 5: Commit the coordinator**

```bash
git add apps/api/src/modules/strategy/aligned-global-scanner.ts apps/api/tests/aligned-global-scanner.test.mjs apps/api/package.json
git commit -m "feat: coordinate aligned global scans"
```

---

### Task 3: Full-Market Execution and Complete Signal Lifecycle

**Files:**
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Consumes: `AlignedGlobalScanner`, `GlobalScanSlot`, `MarketService.getRealtimeKlineTriggerSymbols()`, `runStrategy()`, `loadSignalEventsForResult()`, and `matchSignalEventsToUsers()`.
- Produces: system-level `runGlobalScanSlot(slot)` behavior and `getGlobalScanStatus()`.

- [ ] **Step 1: Write failing full-market lifecycle tests**

Extend `createService()` so the market fixture returns `BTCUSDT`, `ETHUSDT`, and `BADUSDT`. Stub the strategy client so BTC emits one signal, ETH emits none, and BAD throws. Invoke a test-visible method through bracket access:

```js
const result = await service["runGlobalScanSlot"]({
  key: "2026-07-21T14:15:00.000Z",
  closedAt: new Date("2026-07-21T14:15:00.000Z"),
  runAt: new Date("2026-07-21T14:15:05.000Z"),
  timeframes: ["5m", "15m"]
});

assert.equal(result.scannedSymbols, 3);
assert.equal(result.matchedSignals, 2);
assert.equal(result.failedSymbols, 1);
assert.equal(result.errors.length, 2);
assert.deepEqual(strategyCalls.map(({ symbol, timeframe }) => `${symbol}:${timeframe}`).sort(), [
  "BADUSDT:15m", "BADUSDT:5m", "BTCUSDT:15m", "BTCUSDT:5m", "ETHUSDT:15m", "ETHUSDT:5m"
]);
```

Add a database fixture that records `signal_events`, inbox inserts, and delivery inserts. Execute the same slot twice and assert one formal event, one inbox row, and at most one sent delivery per `user_id + signal_event_id + channel`.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm run test:strategy-contract -w apps/api`

Expected: FAIL because `runGlobalScanSlot` and global scanner state do not exist.

- [ ] **Step 3: Implement bounded full-market execution**

Make `StrategyService` implement `OnModuleDestroy`. Declare `private readonly globalScanner: AlignedGlobalScanner;` and initialize it at the end of the existing constructor so dependency fields are already available:

```ts
this.globalScanner = new AlignedGlobalScanner({ executeSlot: (slot) => this.runGlobalScanSlot(slot) });
```

Start it in `onModuleInit()` unless `STRATEGY_GLOBAL_SCAN_ENABLED === "false"`; stop it in `onModuleDestroy()`.

Implement `runGlobalScanSlot(slot)` so it:

```ts
const symbols = await this.resolveGlobalScanSymbols();
const jobs = symbols.flatMap((symbol) => slot.timeframes.map((timeframe) => ({ symbol, timeframe })));
const outcomes = await mapWithConcurrency(jobs, globalScanConcurrency(), async ({ symbol, timeframe }) => {
  try {
    const run = await this.runStrategy({ symbol, timeframe, limit: 180 });
    if (run.result.signals.length) {
      const events = await this.loadSignalEventsForResult(run.result);
      await this.matchSignalEventsToUsers(events);
    }
    return { ok: true, matchedSignals: run.result.signals.length } as const;
  } catch (error) {
    return { ok: false, error: `${symbol}:${timeframe}: ${(error as Error).message}` } as const;
  }
});
```

Return `scannedSymbols: symbols.length`, sum matched signals, count unique symbols with one or more failed timeframe jobs in `failedSymbols`, and cap `errors` at 8 entries. `globalScanConcurrency()` reads `STRATEGY_GLOBAL_SCAN_CONCURRENCY`, defaults to 8, and clamps to 1–24. `mapWithConcurrency()` must preserve all results without starting more workers than the limit.

Implement `resolveGlobalScanSymbols()` as a strict system-level discovery method: call `marketService.getRealtimeKlineTriggerSymbols()`, normalize and cap the returned symbols, and throw `global_scan_symbols_unavailable` when discovery throws or returns an empty list. Do not reuse `resolveRealtimeSymbols()` because its watchlist/default fallback would make an incomplete market scan look successful.

- [ ] **Step 4: Prevent repeated inbox delivery for an existing match**

Change the inbox insert to `returning id::text`, capture its rows, and call `deliverInboxSignal(event, watchlist)` only when the insert returned a row:

```ts
const inserted = await this.database.query<{ id: string }>(
  `insert into user_signal_inbox (...) values (...)
   on conflict (user_id, signal_event_id) do nothing
   returning id::text`,
  values
);
if (inserted.length) await this.deliverInboxSignal(event, watchlist);
```

This preserves permanent inbox history and prevents a service restart from re-delivering the same event.

- [ ] **Step 5: Run focused contracts and build**

Run:

```bash
npm run test:strategy-contract -w apps/api
npm run build -w apps/api
```

Expected: both commands exit 0; the contract reports full-market calls, partial-failure continuation, and idempotent inbox/delivery behavior.

- [ ] **Step 6: Commit the executor**

```bash
git add apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs
git commit -m "feat: run full-market scans on closed candles"
```

---

### Task 4: Status API, Contracts, and Regression Verification

**Files:**
- Modify: `apps/api/src/modules/strategy/strategy.controller.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `docs/API_CONTRACTS.md`

**Interfaces:**
- Consumes: `StrategyService.getGlobalScanStatus()`.
- Produces: `GET /api/strategy/scan/global/status` returning `{ scanner: GlobalScanStatus }`.

- [ ] **Step 1: Write the failing status contract**

Add source assertions and runtime assertions:

```js
assert.match(controllerSource, /@Get\("scan\/global\/status"\)/);
assert.deepEqual(service.getGlobalScanStatus(), {
  scanner: service["globalScanner"].getStatus()
});
```

Verify the initial enabled state, next run timestamp format, empty error list, and all numeric counters.

- [ ] **Step 2: Run the contract and verify RED**

Run: `npm run test:strategy-contract -w apps/api`

Expected: FAIL because the endpoint and service getter are missing.

- [ ] **Step 3: Add the read-only status endpoint**

Add to the service:

```ts
getGlobalScanStatus() {
  return { scanner: this.globalScanner.getStatus() };
}
```

Add to the controller before the user schedule routes:

```ts
@Get("scan/global/status")
getGlobalScanStatus() {
  return this.strategyService.getGlobalScanStatus();
}
```

Document that the task is automatic, system-level, UTC-aligned, delayed 5 seconds after candle close, and not controlled by the user schedule start/stop endpoints. Include the exact status fields from `GlobalScanStatus`.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm run test:global-scan-schedule -w apps/api
npm run test:aligned-global-scanner -w apps/api
npm run test:strategy-contract -w apps/api
npm run test:entitlements -w apps/api
npm run lint -w apps/api
npm run build -w apps/api
npm run test:radar-live -w apps/web
npm run test:view-routing -w apps/web
git diff --check
```

Expected: every command exits 0; no entitlement, existing schedule, realtime, Radar, or routing regression is reported.

- [ ] **Step 5: Commit the status contract and documentation**

```bash
git add apps/api/src/modules/strategy/strategy.controller.ts apps/api/tests/strategy-contract.test.mjs docs/API_CONTRACTS.md
git commit -m "docs: expose global scan health status"
```

---

## Final Review Checklist

- [ ] Scheduler uses one-shot absolute timers, not `setInterval`.
- [ ] The 5-second grace is applied after every closed-candle boundary.
- [ ] `30m` is included in both scheduling logic and strategy calls.
- [ ] The global job bypasses per-user scan quotas but user delivery still respects entitlement, threshold, cooldown, and push configuration.
- [ ] One failed symbol/timeframe does not fail the whole batch.
- [ ] Repeated processing does not duplicate `signal_events`, inbox rows, or sent deliveries.
- [ ] Shutdown clears the timer.
- [ ] Existing user interval schedule and realtime tracker remain operational.
- [ ] Status distinguishes running, no matches, partial errors, overlap skips, and disabled state.
