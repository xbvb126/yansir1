# Event-Driven Signal Production and Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make close-confirmed Binance events the authoritative whole-market signal producer, persist every formal evaluation before matching or delivery, reconcile missed closes without duplicates, and enforce the approved Free/VIP/SVIP consumption model.

**Architecture:** A small closed-candle domain module validates Binance close events and produces deterministic jobs. A PostgreSQL evaluation ledger reserves each symbol/timeframe/bar once and records zero-signal success as well as failures. Realtime and reconciliation sources call one strict formal-signal executor; user matching and asynchronous delivery occur only after strict signal persistence and a successful evaluation ledger update.

**Tech Stack:** NestJS 10, TypeScript 5, PostgreSQL 14+, Node.js 18, Binance Spot WebSocket close events, Binance Futures REST klines, Python FastAPI strategy service, React/Vite.

## Global Constraints

- Formal signals use closed candles only; an open candle can never enter persistence, performance, inbox, or delivery.
- The expected formal `bar_time` is exactly `closedAt - timeframeDuration`.
- Whole-market calculations use one strategy standard for Free, VIP, and SVIP.
- PostgreSQL persistence is a hard boundary before user matching and delivery.
- Realtime is the primary producer; reconciliation runs every 15 minutes and only handles missing or failed work.
- Reconciled signals older than five minutes are persisted and matched to inboxes but are not pushed.
- Target: 95% of formal signals are persisted and matched within 60 seconds of candle close.
- Free: 8-hour delay, 5 watchlist symbols, 5m, 7-day history, no push.
- VIP: realtime, 50 watchlist symbols, 5m/15m, 30-day history, Feishu, 300 successful pushes/day.
- SVIP: realtime, 200 watchlist symbols, all supported timeframes, 180-day history, Feishu, 2000 successful pushes/day, API.
- Failed and skipped deliveries do not consume daily push allowance.
- No intrabar product, new delivery channel, message broker, payment-provider work, or frontend redesign is included.
- Existing unrelated dirty-worktree changes must not be staged, committed, reformatted, or reverted.

---

## File Structure

### New files

- `apps/api/src/modules/strategy/closed-candle-job.ts` — pure close-event validation, job identity, timeframe arithmetic, and reconciliation slot generation.
- `apps/api/src/modules/strategy/close-evaluation.repository.ts` — PostgreSQL reservation, completion, failure, missing-work reads, and retention for formal close evaluations.
- `apps/api/src/modules/strategy/formal-signal-queue.ts` — bounded deduplicating queue with per-symbol/timeframe ordering and operational counters.
- `apps/api/src/modules/strategy/formal-signal-reconciler.ts` — 15-minute missing-work scheduler that feeds the shared queue.
- `apps/api/src/modules/strategy/formal-delivery-retry.ts` — independent bounded retry worker for persisted failed deliveries.
- `apps/api/tests/closed-candle-job.test.mjs` — pure closed-candle contract tests.
- `apps/api/tests/close-evaluation-repository.test.mjs` — SQL reservation and state transition tests.
- `apps/api/tests/formal-signal-queue.test.mjs` — deduplication, ordering, pressure, and metrics tests.
- `apps/api/tests/formal-signal-reconciler.test.mjs` — missing-slot and late-delivery reconciliation tests.
- `apps/api/tests/formal-delivery-retry.test.mjs` — delivery backoff, retry limit, and stale reservation recovery tests.

### Modified files

- `infra/schema.sql` — add `strategy_close_evaluations` and supporting indexes.
- `apps/api/src/modules/strategy/strategy.module.ts` — register the evaluation repository.
- `apps/api/src/modules/strategy/strategy.service.ts` — use the formal queue and one strict executor for realtime and reconciliation.
- `apps/api/src/modules/strategy/strategy.client.ts` — add formal job/result types only where shared typing is required.
- `apps/api/src/modules/signals/signals.repository.ts` — preserve strict zero-signal behavior behind the evaluation ledger.
- `apps/api/src/modules/strategy/strategy.controller.ts` — expose formal pipeline status.
- `apps/api/src/modules/health/health.controller.ts` — report formal-signal readiness separately from process liveness.
- `apps/api/src/modules/app.module.ts` — load repository-root `.env.local` in supported local launch paths.
- `apps/api/src/modules/users/entitlements.ts` — keep the approved plan matrix explicit and expose formal-signal access fields.
- `apps/api/tests/strategy-contract.test.mjs` — strict realtime lifecycle, persistence boundary, entitlement, and delivery regressions.
- `apps/api/tests/plan-entitlements.test.mjs` — approved plan matrix.
- `apps/api/package.json` and root `package.json` — add focused tests to the core CI suite.
- `docs/API_CONTRACTS.md` and `docs/ARCHITECTURE.md` — document the formal pipeline and degraded-state behavior.

---

### Task 1: Closed-Candle Domain Contract

**Files:**
- Create: `apps/api/src/modules/strategy/closed-candle-job.ts`
- Create: `apps/api/tests/closed-candle-job.test.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:

```ts
export type FormalSignalSource = "realtime" | "reconciliation";

export type FormalSignalJob = {
  key: string;
  symbol: string;
  timeframe: "5m" | "15m" | "30m" | "1h" | "4h";
  klineOpenTime: number;
  closedAt: Date;
  enqueuedAt: Date;
  source: FormalSignalSource;
};

export type ClosedBinanceKline = {
  t: number;
  T: number;
  s: string;
  i: string;
  x: boolean;
};

export function formalSignalJobFromClosedKline(
  kline: ClosedBinanceKline,
  now?: Date
): FormalSignalJob | null;

export function formalSignalJobKey(
  symbol: string,
  timeframe: string,
  klineOpenTime: number
): string;

export function expectedFormalBarTime(timeframe: string, closedAt: Date): number;

export function closedCandleOpenTimesBetween(
  timeframe: string,
  fromExclusive: Date,
  toInclusive: Date
): number[];
```

- Consumed by Tasks 3–5.

- [ ] **Step 1: Write the failing domain test**

Create a focused esbuild-based test containing these assertions:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd run test:closed-candle-job -w apps/api
```

Expected: FAIL because `closed-candle-job.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure domain module**

Use a fixed supported-timeframe map and reject boundary mismatches:

```ts
const TIMEFRAME_MS = {
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000
} as const;

export function formalSignalJobFromClosedKline(kline: ClosedBinanceKline, now = new Date()) {
  if (!kline.x) return null;
  const timeframe = normalizeFormalTimeframe(kline.i);
  const symbol = kline.s.trim().toUpperCase();
  const closedAt = new Date(kline.T + 1);
  const expectedOpen = expectedFormalBarTime(timeframe, closedAt);
  if (kline.t !== expectedOpen) {
    throw new Error(
      `unexpected_closed_kline_boundary:${symbol}:${timeframe}:expected=${expectedOpen}:actual=${kline.t}`
    );
  }
  return {
    key: formalSignalJobKey(symbol, timeframe, kline.t),
    symbol,
    timeframe,
    klineOpenTime: kline.t,
    closedAt,
    enqueuedAt: now,
    source: "realtime" as const
  };
}
```

Implement `closedCandleOpenTimesBetween` by advancing timeframe-aligned open times and include only candles whose close is after `fromExclusive` and at or before `toInclusive`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd run test:closed-candle-job -w apps/api
```

Expected: `closed candle job tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/strategy/closed-candle-job.ts apps/api/tests/closed-candle-job.test.mjs apps/api/package.json
git commit -m "feat(api): define close-confirmed signal jobs"
```

---

### Task 2: Formal Close-Evaluation Ledger

**Files:**
- Modify: `infra/schema.sql`
- Create: `apps/api/src/modules/strategy/close-evaluation.repository.ts`
- Create: `apps/api/tests/close-evaluation-repository.test.mjs`
- Modify: `apps/api/src/modules/strategy/strategy.module.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `FormalSignalJob`.
- Produces:

```ts
export type CloseEvaluationReservation = {
  id: string;
  attempts: number;
};

export class CloseEvaluationRepository {
  reserve(job: FormalSignalJob): Promise<CloseEvaluationReservation | null>;
  complete(id: string, signalCount: number, finishedAt: Date): Promise<void>;
  fail(id: string, error: string, finishedAt: Date): Promise<void>;
  findCompletedKeys(keys: string[]): Promise<Set<string>>;
  purgeFinishedBefore(cutoff: Date): Promise<number>;
}
```

- [ ] **Step 1: Write the failing repository test**

The fake database must capture SQL and emulate unique reservations. Assert:

```js
const first = await repository.reserve(job);
const duplicate = await repository.reserve(job);
assert.equal(first.id, "evaluation-1");
assert.equal(duplicate, null, "a running or succeeded job cannot reserve twice");

await repository.complete(first.id, 2, new Date("2026-07-23T03:50:12.000Z"));
assert.equal(rows.get(job.key).status, "succeeded");
assert.equal(rows.get(job.key).signal_count, 2);

const retry = await repository.reserve({ ...job, source: "reconciliation" });
assert.equal(retry, null, "a completed realtime job cannot be replayed by reconciliation");

await repository.fail("evaluation-2", "market_timeout", new Date());
assert.equal(rows.get("ETHUSDT:5m:1784778300000").status, "failed");
```

Also source-scan `infra/schema.sql` for the unique key and required indexes.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd run test:close-evaluation-repository -w apps/api
```

Expected: FAIL because the table and repository do not exist.

- [ ] **Step 3: Add the schema**

Add:

```sql
create table if not exists strategy_close_evaluations (
  id uuid primary key default gen_random_uuid(),
  job_key varchar(255) not null unique,
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  bar_time timestamptz not null,
  closed_at timestamptz not null,
  source varchar(32) not null,
  status varchar(32) not null default 'running',
  attempts integer not null default 1,
  signal_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('realtime', 'reconciliation')),
  check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists idx_close_evaluations_status_time
  on strategy_close_evaluations(status, closed_at);

create index if not exists idx_close_evaluations_symbol_time
  on strategy_close_evaluations(symbol, timeframe, bar_time desc);
```

The repository's `reserve` uses `insert ... on conflict (job_key) do update` only when the existing row is `failed` or has been `running` for more than five minutes. A `succeeded` row never reserves again.

- [ ] **Step 4: Implement state transitions**

`complete` and `fail` must use `queryStrict` and require exactly one returned row:

```ts
const rows = await this.database.queryStrict<{ id: string }>(
  `update strategy_close_evaluations
     set status = 'succeeded',
         signal_count = $2,
         error = null,
         finished_at = $3,
         updated_at = now()
   where id = $1 and status = 'running'
   returning id::text`,
  [id, signalCount, finishedAt]
);
if (rows.length !== 1) throw new Error(`close_evaluation_completion_incomplete:${id}`);
```

Keep evaluation rows for seven days; signals and performance rows are not deleted by this retention method.

- [ ] **Step 5: Run focused tests and API build**

Run:

```powershell
npm.cmd run test:close-evaluation-repository -w apps/api
npm.cmd run build -w apps/api
```

Expected: test passes and TypeScript build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add infra/schema.sql apps/api/src/modules/strategy/close-evaluation.repository.ts apps/api/src/modules/strategy/strategy.module.ts apps/api/tests/close-evaluation-repository.test.mjs apps/api/package.json
git commit -m "feat(api): persist formal close evaluations"
```

---

### Task 3: Shared Strict Formal-Signal Executor

**Files:**
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Consumes: `FormalSignalJob`, `CloseEvaluationRepository.reserve/complete/fail`.
- Produces:

```ts
type FormalSignalExecution = {
  status: "completed" | "duplicate" | "failed";
  job: FormalSignalJob;
  signalCount: number;
  error?: string;
};

private executeFormalSignalJob(job: FormalSignalJob): Promise<FormalSignalExecution>;
```

- [ ] **Step 1: Write failing strict-realtime lifecycle tests**

Add tests that call the private executor and assert:

```js
const job = realtimeJob("BTCUSDT", "5m", "2026-07-23T03:50:00.000Z");
const outcome = await service["executeFormalSignalJob"](job);

assert.equal(outcome.status, "completed");
assert.equal(strictMarketCalls[0].endTime, job.closedAt.getTime() - 1);
assert.equal(strategyCalls[0].candles.at(-1).open_time, job.klineOpenTime);
assert.equal(fixture.signalEvents.size, 1);
assert.equal(fixture.inbox.size, 1);
assert.equal(fixture.deliveries.filter(({ status }) => status === "sent").length, 1);
```

Add separate tests for:

- the strategy returns the newly opened bar and fails with `unexpected_formal_bar_time`;
- strict persistence returns `persisted: false` and no inbox or delivery is created;
- zero emitted signals still complete the evaluation ledger with `signalCount = 0`;
- the second execution of the same job returns `duplicate`.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
```

Expected: FAIL because `executeFormalSignalJob` does not exist.

- [ ] **Step 3: Extract one strict executor**

Implement this sequence:

```ts
private async executeFormalSignalJob(job: FormalSignalJob): Promise<FormalSignalExecution> {
  const reservation = await this.closeEvaluations.reserve(job);
  if (!reservation) return { status: "duplicate", job, signalCount: 0 };

  try {
    const run = await withPromiseTimeout(
      this.executeStrategy(
        { symbol: job.symbol, timeframe: job.timeframe, limit: 180 },
        { strictClosedAt: job.closedAt, cache: new Map() }
      ),
      formalStrategyTimeoutMs(),
      `formal_strategy_timeout:${job.key}`
    );
    assertExpectedFormalBarTime(run.result, job);

    if (run.result.signals.length) {
      if (!run.persistence.persisted) throw new Error("signal_persistence_unavailable");
      if (run.persistence.count !== run.result.signals.length) {
        throw new Error(
          `signal_persistence_incomplete:expected=${run.result.signals.length}:actual=${run.persistence.count}`
        );
      }
    }

    const events = await this.loadSignalEventsForResult(run.result, true);
    await this.matchSignalEventsToUsers(events, {
      source: job.source,
      closedAt: job.closedAt
    });
    await this.closeEvaluations.complete(reservation.id, events.length, new Date());
    this.recordFormalSuccess(job, events.length);
    return { status: "completed", job, signalCount: events.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await this.closeEvaluations.fail(reservation.id, message, new Date());
    this.recordFormalFailure(job, message);
    return { status: "failed", job, signalCount: 0, error: message };
  }
}
```

Rename the existing global-only bar assertion to `assertExpectedFormalBarTime` and have it compare the returned symbol, timeframe, and exact `job.klineOpenTime`.

- [ ] **Step 4: Route the WebSocket close event through the executor**

Extend the Binance kline type with `T`. Replace the realtime queue item with `FormalSignalJob`. `handleRealtimeMessage` calls `formalSignalJobFromClosedKline`, ignores open updates, validates configured symbols/timeframes, and enqueues the returned job.

Delete the non-strict `processRealtimeKline(symbol, timeframe, klineOpenTime)` path. The realtime worker calls `executeFormalSignalJob(job)`.

Do not call the old `deliverRealtimeAlerts`; formal user matching and reservation are the only delivery path.

- [ ] **Step 5: Run the contract, strict-persistence, and build checks**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run test:strict-persistence -w apps/api
npm.cmd run build -w apps/api
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs
git commit -m "fix(api): make realtime signals close-confirmed"
```

---

### Task 4: Bounded Ordered Formal Queue and Telemetry

**Files:**
- Create: `apps/api/src/modules/strategy/formal-signal-queue.ts`
- Create: `apps/api/tests/formal-signal-queue.test.mjs`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `FormalSignalJob`, `(job) => Promise<FormalSignalExecution>`.
- Produces:

```ts
export type FormalQueueStatus = {
  capacity: number;
  concurrency: number;
  depth: number;
  activeWorkers: number;
  oldestQueuedAt: string | null;
  accepted: number;
  duplicates: number;
  pressureRejected: number;
  completed: number;
  failed: number;
  latencyMs: {
    p50: number | null;
    p95: number | null;
  };
};

export class FormalSignalQueue {
  enqueue(job: FormalSignalJob): "accepted" | "duplicate" | "pressure";
  getStatus(): FormalQueueStatus;
  stop(): void;
}
```

- [ ] **Step 1: Write failing queue tests**

Prove:

```js
assert.equal(queue.enqueue(btc5m), "accepted");
assert.equal(queue.enqueue(btc5m), "duplicate");

queue.enqueue({ ...btc5m, key: "BTCUSDT:5m:next", klineOpenTime: next });
queue.enqueue(eth5m);
await settled;

assert.deepEqual(
  starts.filter(({ symbol }) => symbol === "BTCUSDT").map(({ klineOpenTime }) => klineOpenTime),
  [btc5m.klineOpenTime, next],
  "same symbol/timeframe remains ordered"
);
assert.ok(maxActive >= 2, "different keys may run concurrently");
```

With capacity 1 and a blocked worker, assert a second distinct queued job returns `pressure`, increments `pressureRejected`, and invokes `onPressure(job)` so reconciliation can recover it.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:formal-signal-queue -w apps/api
```

Expected: FAIL because the queue module does not exist.

- [ ] **Step 3: Implement the queue**

Use:

- `pendingKeys` for queued/running job keys;
- `activeLanes` keyed by `symbol:timeframe`;
- FIFO storage;
- configured defaults `STRATEGY_FORMAL_QUEUE_CAPACITY=10000` and `STRATEGY_REALTIME_CONCURRENCY=16`;
- no silent eviction;
- immutable snapshots from `getStatus`.

The queue releases a job key only after the executor settles. `stop()` rejects new jobs and clears queued work while leaving the evaluation ledger to reconciliation.

Record the most recent 1000 successful close-to-persistence durations and expose p50 and p95 from immutable sorted copies. This bounded sample is operational telemetry, not a performance ledger.

- [ ] **Step 4: Integrate queue status**

Replace the service's raw `realtimeQueue`, `realtimeWorkers`, and `realtimeBusyKeys`. Add a `formalPipeline` block to `getRealtimeStatus()` containing queue status, latest successful calculation, latest persistence, recent success/failure counts, and the latest failure.

- [ ] **Step 5: Run focused and existing scanner tests**

Run:

```powershell
npm.cmd run test:formal-signal-queue -w apps/api
npm.cmd run test:aligned-global-scanner -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/strategy/formal-signal-queue.ts apps/api/tests/formal-signal-queue.test.mjs apps/api/src/modules/strategy/strategy.service.ts apps/api/package.json
git commit -m "feat(api): queue formal signal events safely"
```

---

### Task 5: Missing-Close Reconciliation and Late-Delivery Policy

**Files:**
- Create: `apps/api/src/modules/strategy/formal-signal-reconciler.ts`
- Create: `apps/api/tests/formal-signal-reconciler.test.mjs`
- Modify: `apps/api/src/modules/strategy/close-evaluation.repository.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:

```ts
export type ReconciliationStatus = {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  candidates: number;
  enqueued: number;
  duplicates: number;
  pressure: number;
  lastError: string | null;
};

export class FormalSignalReconciler {
  start(): void;
  stop(): void;
  runOnce(now?: Date): Promise<ReconciliationStatus>;
  getStatus(): ReconciliationStatus;
}
```

- `CloseEvaluationRepository.findCompletedKeys(keys)` returns the subset already succeeded.

- [ ] **Step 1: Write failing reconciliation tests**

With BTC and ETH, 5m and 15m, and a 15-minute interval:

```js
const status = await reconciler.runOnce(new Date("2026-07-23T04:00:00.000Z"));
assert.ok(status.candidates > 0);
assert.ok(enqueued.every((job) => job.source === "reconciliation"));
assert.ok(enqueued.every((job) => job.closedAt <= new Date("2026-07-23T04:00:00.000Z")));
assert.ok(!enqueued.some((job) => completedKeys.has(job.key)));
```

Run it twice with the first run's keys marked succeeded and assert the second run does not enqueue them.

Add a contract test proving a reconciled signal with `closedAt = now - 6 minutes` creates an inbox item but records `skipped/reconciliation_too_old` and makes no Feishu call. A signal at `now - 4 minutes` remains eligible for delivery.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:formal-signal-reconciler -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: FAIL because reconciliation and delivery context are absent.

- [ ] **Step 3: Implement reconciliation**

Defaults:

```ts
const intervalSeconds = 900;
const lookbackMinutes = 1440;
const batchSize = 300;
```

On the first start of a new deployment, when `strategy_close_evaluations` has no rows, set the baseline to the service start time so the system does not manufacture historical signals predating deployment. When rows already exist, use the latest persisted evaluation close as the restart baseline, capped to the previous 24 hours, and enqueue the oldest missing jobs first. Process at most 300 jobs per pass; subsequent passes drain the backlog. If the persisted gap exceeds 24 hours, expose `recovery_window_exceeded` in reconciliation status rather than silently claiming full recovery.

Build candidate keys with `closedCandleOpenTimesBetween`, read succeeded keys in chunks of 1000, and send missing jobs through the formal queue. Failed or pressure-rejected jobs remain missing and are retried.

Start reconciliation on module initialization after realtime startup. Stop its timer during module destruction. Set `STRATEGY_GLOBAL_SCAN_ENABLED` default to `false`; retain the old global scanner only as an explicitly enabled diagnostic tool until a later removal.

- [ ] **Step 4: Apply late-delivery context**

Change:

```ts
private matchSignalEventsToUsers(
  events: SignalEventRow[],
  context: { source: FormalSignalSource; closedAt: Date }
)
```

Always create the idempotent inbox row. Before reserving Feishu delivery, skip with `reconciliation_too_old` when:

```ts
context.source === "reconciliation"
&& Date.now() - context.closedAt.getTime() > reconciliationPushMaxAgeMs()
```

Default `STRATEGY_RECONCILIATION_PUSH_MAX_AGE_MS` to `300000`.

- [ ] **Step 5: Run focused tests and API build**

Run:

```powershell
npm.cmd run test:formal-signal-reconciler -w apps/api
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run test:global-scan-schedule -w apps/api
npm.cmd run build -w apps/api
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/strategy/formal-signal-reconciler.ts apps/api/tests/formal-signal-reconciler.test.mjs apps/api/src/modules/strategy/close-evaluation.repository.ts apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs apps/api/package.json
git commit -m "feat(api): reconcile missed close events"
```

---

### Task 6: Independent Failed-Delivery Retry

**Files:**
- Create: `apps/api/src/modules/strategy/formal-delivery-retry.ts`
- Create: `apps/api/tests/formal-delivery-retry.test.mjs`
- Modify: `infra/schema.sql`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:

```ts
export type DeliveryRetryStatus = {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  picked: number;
  sent: number;
  failed: number;
  exhausted: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
};

export class FormalDeliveryRetry {
  start(): void;
  stop(): void;
  runOnce(): Promise<DeliveryRetryStatus>;
  getStatus(): DeliveryRetryStatus;
}
```

- Consumes a service callback that retries one persisted delivery through the existing entitlement, push-setting, daily-limit, cooldown, and Feishu checks.

- [ ] **Step 1: Write failing retry tests**

Assert:

```js
const first = await retry.runOnce();
assert.equal(first.picked, 1);
assert.equal(first.failed, 1);
assert.equal(deliveries[0].retry_count, 1);
assert.ok(deliveries[0].next_retry_at > now);

clock.advanceTo(deliveries[0].next_retry_at);
provider.result = { sent: true };
const second = await retry.runOnce();
assert.equal(second.sent, 1);
assert.equal(deliveries[0].status, "sent");
```

Also prove:

- a failed row with `retry_count = 3` is exhausted and never sent;
- two worker instances atomically reserve one retry;
- a `sending` row older than five minutes is recovered as failed before selection;
- a plan downgrade or disabled push setting records `skipped` instead of bypassing current entitlements;
- the retry timer does not block or call the strategy executor.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:formal-delivery-retry -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: FAIL because retry metadata and the worker do not exist.

- [ ] **Step 3: Add retry metadata**

Add idempotent schema changes:

```sql
alter table alert_deliveries add column if not exists retry_count integer not null default 0;
alter table alert_deliveries add column if not exists next_retry_at timestamptz;
alter table alert_deliveries add column if not exists last_attempt_at timestamptz;

create index if not exists idx_alert_deliveries_retry
  on alert_deliveries(status, next_retry_at)
  where status in ('failed', 'sending');
```

- [ ] **Step 4: Make delivery reservation retry-aware**

The unique `(user_id, signal_event_id, channel)` reservation remains authoritative. Extend its conflict action so only a due `failed` row with `retry_count < 3` can atomically return to `sending`:

```sql
on conflict (user_id, signal_event_id, channel)
where signal_event_id is not null
do update set
  status = 'sending',
  retry_count = alert_deliveries.retry_count + 1,
  last_attempt_at = now(),
  next_retry_at = null,
  reason = null
where alert_deliveries.status = 'failed'
  and alert_deliveries.retry_count < 3
  and coalesce(alert_deliveries.next_retry_at, now()) <= now()
returning id::text
```

On failure, set exponential backoff from the persisted retry count: one minute, two minutes, then four minutes. On success, clear `next_retry_at`.

- [ ] **Step 5: Implement the independent worker**

Defaults:

```ts
intervalSeconds = 60;
batchSize = 50;
maxRetries = 3;
staleSendingSeconds = 300;
```

At the start of a run, mark stale `sending` rows as `failed` with `reason = 'stale_delivery_reservation'` and `next_retry_at = now()`. Select due failed rows with `for update skip locked`, join the signal event and matching watchlist, and call the same `deliverInboxSignal` policy path. Do not reconstruct a weaker push path.

Start the worker after API initialization and stop it during module destruction. Expose its status under the formal status endpoint.

- [ ] **Step 6: Run focused and delivery tests**

Run:

```powershell
npm.cmd run test:formal-delivery-retry -w apps/api
npm.cmd run test:alerts-delivery -w apps/api
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run build -w apps/api
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/strategy/formal-delivery-retry.ts apps/api/tests/formal-delivery-retry.test.mjs infra/schema.sql apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs apps/api/package.json
git commit -m "feat(api): retry failed formal deliveries"
```

---

### Task 7: Approved Subscription and Delivery Contract

**Files:**
- Modify: `apps/api/src/modules/users/entitlements.ts`
- Modify: `apps/api/tests/plan-entitlements.test.mjs`
- Modify: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Extend `UserEntitlements` with:

```ts
formalSignalAccess: "delayed" | "realtime";
formalSignalDelayHours: number;
intrabarPreview: boolean;
```

- [ ] **Step 1: Write failing entitlement assertions**

Assert the complete approved matrix:

```js
assert.deepEqual(
  pick(free, [
    "formalSignalAccess", "formalSignalDelayHours", "maxWatchlistSymbols",
    "allowedTimeframes", "historyDays", "feishuAlerts", "maxPushPerDay",
    "signalOutcomes", "apiAccess", "intrabarPreview"
  ]),
  {
    formalSignalAccess: "delayed",
    formalSignalDelayHours: 8,
    maxWatchlistSymbols: 5,
    allowedTimeframes: ["5m"],
    historyDays: 7,
    feishuAlerts: false,
    maxPushPerDay: 0,
    signalOutcomes: false,
    apiAccess: false,
    intrabarPreview: false
  }
);
```

Add equivalent VIP and SVIP assertions using the approved values. All three must have `intrabarPreview: false`.

Add a strategy contract asserting the same persisted signal event is returned unchanged before entitlement projection, while visibility timeframes, history, and delivery differ.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:entitlements -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: FAIL because the formal access fields are missing.

- [ ] **Step 3: Implement the explicit matrix**

Map:

```ts
Free: {
  formalSignalAccess: "delayed",
  formalSignalDelayHours: 8,
  maxPushPerDay: 0,
  intrabarPreview: false
}

VIP: {
  formalSignalAccess: "realtime",
  formalSignalDelayHours: 0,
  maxPushPerDay: 300,
  intrabarPreview: false
}

SVIP: {
  formalSignalAccess: "realtime",
  formalSignalDelayHours: 0,
  maxPushPerDay: 2000,
  intrabarPreview: false
}
```

Keep the existing plan-sourced overrides for configurable database plan records, but never allow a Free plan with `feishuAlerts = false` to report a positive effective push allowance.

- [ ] **Step 4: Verify delivery accounting**

Retain `sending` in the reservation-time quota count so concurrent sends cannot exceed the plan. Retain `sent` as the only state exposed as consumed usage. Add assertions that `failed`, `skipped`, and `reconciliation_too_old` do not increment `dailyPushUsed`.

- [ ] **Step 5: Run entitlement and delivery suites**

Run:

```powershell
npm.cmd run test:entitlements -w apps/api
npm.cmd run test:alerts-delivery -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/modules/users/entitlements.ts apps/api/tests/plan-entitlements.test.mjs apps/api/tests/strategy-contract.test.mjs
git commit -m "feat(api): enforce formal signal plan access"
```

---

### Task 8: Runtime Readiness, Environment Loading, and Status API

**Files:**
- Modify: `apps/api/src/modules/app.module.ts`
- Modify: `apps/api/src/modules/health/health.controller.ts`
- Modify: `apps/api/src/modules/strategy/strategy.controller.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- `GET /api/strategy/formal/status` returns:

```ts
{
  ready: boolean;
  reason: string | null;
  realtime: {
    enabled: boolean;
    connected: boolean;
    lastClosedEventAt: string | null;
  };
  queue: FormalQueueStatus;
  reconciliation: ReconciliationStatus;
  latestCalculationAt: string | null;
  latestPersistenceAt: string | null;
  recent: {
    succeeded: number;
    failed: number;
    timedOut: number;
    reconciled: number;
  };
  deliveryRetry: DeliveryRetryStatus;
}
```

- [ ] **Step 1: Write failing readiness tests**

Assert:

```js
assert.deepEqual(mockDbStatus, {
  ready: false,
  reason: "database_unavailable"
});

assert.equal(connectedStatus.ready, true);
assert.equal(connectedStatus.queue.capacity, 10000);
assert.equal(typeof connectedStatus.reconciliation.enabled, "boolean");
```

Source-scan `app.module.ts` for explicit `.env.local` paths and the controller for `@Get("formal/status")`.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
```

Expected: FAIL because formal readiness is not exposed.

- [ ] **Step 3: Load local environment consistently**

Use:

```ts
import path from "node:path";

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../.env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env")
  ]
})
```

Existing process environment values continue to win. Do not log `DATABASE_URL` or any secret.

- [ ] **Step 4: Implement readiness**

Formal readiness is false when:

- database mode is mock or disconnected;
- realtime tracking is disabled;
- all realtime sockets are disconnected;
- the oldest queue item exceeds 60 seconds;
- the latest persistence failure is newer than the latest persistence success.

Process `/api/health` remains a liveness endpoint but adds a `formalSignals` readiness block. `/api/strategy/formal/status` returns detailed diagnostics without credentials or webhook targets.

- [ ] **Step 5: Document the contract**

Document:

- close-confirmed semantics;
- strict persistence boundary;
- formal status fields;
- reconciliation every 15 minutes;
- five-minute late-delivery threshold;
- mock database mode as degraded and non-delivering;
- the approved plan matrix.

- [ ] **Step 6: Run tests and build**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run build -w apps/api
```

Expected: both pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/modules/app.module.ts apps/api/src/modules/health/health.controller.ts apps/api/src/modules/strategy/strategy.controller.ts apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs docs/API_CONTRACTS.md docs/ARCHITECTURE.md
git commit -m "feat(api): expose formal signal readiness"
```

---

### Task 9: CI Wiring and End-to-End Runtime Verification

**Files:**
- Modify: `apps/api/package.json`
- Modify: root `package.json`
- Modify: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- `npm run test:api:core` includes all five new focused tests before the broad strategy contract.

- [ ] **Step 1: Add the new tests to core CI**

Add these scripts in `apps/api/package.json`:

```json
"test:closed-candle-job": "node tests/closed-candle-job.test.mjs",
"test:close-evaluation-repository": "node tests/close-evaluation-repository.test.mjs",
"test:formal-signal-queue": "node tests/formal-signal-queue.test.mjs",
"test:formal-signal-reconciler": "node tests/formal-signal-reconciler.test.mjs",
"test:formal-delivery-retry": "node tests/formal-delivery-retry.test.mjs"
```

Update root `test:api:core` to run all five.

- [ ] **Step 2: Run database migration and verify connectivity**

Run:

```powershell
npm.cmd run db:schema
npm.cmd run db:verify
```

Expected: schema applies and verification exits 0. Do not paste or commit database credentials.

- [ ] **Step 3: Restart through the supported local launch path**

Stop only the identified Yansir API process, then run:

```powershell
npm.cmd run build:api
npm.cmd run dev:api
```

The root runner must load `.env.local`. Verify:

```powershell
Invoke-RestMethod http://127.0.0.1:3101/api/health
Invoke-RestMethod http://127.0.0.1:3101/api/strategy/formal/status
```

Expected:

```text
database.mode = postgres
database.connected = true
formalSignals.ready = true
```

- [ ] **Step 4: Run a live closed-candle acceptance check**

Observe BTCUSDT, ETHUSDT, and SOLUSDT through at least one 5m close and one available higher-timeframe close. For every completed formal evaluation, verify:

```text
result.bar_time = closedAt - timeframe duration
evaluation.status = succeeded
signal persisted before inbox/delivery
no duplicate signal or delivery for a replayed event
```

If no signal is emitted during the observation window, verify the evaluation ledger records a successful zero-signal result; do not fabricate a production signal.

- [ ] **Step 5: Verify performance and track record**

Run the performance updater once through its authenticated operational path or wait for its configured interval. Query:

```powershell
Invoke-RestMethod http://127.0.0.1:3101/api/strategy/public-performance-summary
Invoke-RestMethod 'http://127.0.0.1:3101/api/strategy/public-signals?limit=10'
```

Expected: endpoints read persisted data. The public eight-hour delay remains intentional; a zero public count is acceptable only when no eligible signal is older than eight hours. The authenticated realtime ledger must not be empty after a persisted formal match.

- [ ] **Step 6: Run full verification**

Run:

```powershell
npm.cmd run test:api:core
npm.cmd run test:web:core
npm.cmd run test:strategy
npm.cmd run build:api
npm.cmd run build:web
git diff --check
```

Expected: every command exits 0 and `git diff --check` produces no output.

- [ ] **Step 7: Update launch checklist and commit**

Add runtime checks for PostgreSQL mode, formal readiness, queue age, reconciliation freshness, and performance updater status.

```powershell
git add apps/api/package.json package.json docs/LAUNCH_CHECKLIST.md
git commit -m "test: gate event-driven signal production"
```

---

## Final Review Checklist

- [ ] Every formal realtime calculation uses an exact closed boundary.
- [ ] The next forming candle is absent from formal strategy input.
- [ ] Zero-signal closes are recorded as successful evaluations.
- [ ] Duplicate close events and reconciliation replays are idempotent.
- [ ] Database failure prevents user matching and delivery.
- [ ] Reconciliation uses the same strict executor as realtime.
- [ ] Reconciled signals older than five minutes are not pushed.
- [ ] Free/VIP/SVIP share signal quality and differ only by approved consumption rights.
- [ ] Only successful delivery consumes user-visible daily allowance.
- [ ] Formal readiness reports degraded state instead of hiding mock database mode.
- [ ] Performance reads the formal ledger and the track-record UI has eligible persisted data.
- [ ] New focused tests are part of core CI.
- [ ] Unrelated existing worktree changes remain untouched.
