# Formal Signal Re-review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six binding re-review gaps without changing the close-confirmed formal executor or the Free/VIP/SVIP product matrix.

**Architecture:** Keep `signal_events` as the immutable formal ledger and `alert_deliveries` as the delivery outbox. Persist a `pending` Feishu outbox row before in-memory admission, let either the initial queue or retry worker atomically claim it as `sending`, and require exact strict user/rule reads at every formal boundary. Make all queue telemetry use the same in-flight age and recent/current pressure model.

**Tech Stack:** NestJS/TypeScript, PostgreSQL 16, Node test harnesses with esbuild, Python unittest strategy suite, GitHub Actions.

## Global Constraints

- Preserve the first-wave exact close-confirmed shared executor and asynchronous matching/delivery queues.
- Use strict TDD: observe every new regression fail before changing production code.
- Fix all five Important findings and the seven-day retention Minor.
- Run focused, API/Web core, strategy 42/42, API/Web build, CI/readiness, real PostgreSQL, and whitespace verification.
- Append second-wave RED/GREEN evidence to `.superpowers/sdd/final-fix-report.md`.
- Commit intentionally; do not push or integrate.

---

### Task 1: Durable pre-admission delivery outbox

**Files:**
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/tests/formal-delivery-retry.test.mjs`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/src/modules/strategy/formal-delivery-retry.ts`
- Modify: `infra/schema.sql`

**Interfaces:**
- Produces: `ensurePendingDelivery(event, userId): Promise<boolean>`, where `true` means a durable `pending` row is eligible for queue admission.
- Consumes: existing `deliverInboxSignal`, `reserveDelivery`, `finalizeReservedDelivery`, and retry candidate state.

- [x] **Step 1: Write failing outbox and retry-transition tests**

Add regressions that require:

```js
await service["enqueueInitialDelivery"](event, watchlist, closedAt);
assert.ok(sqlOrder.indexOf("status = pending") < queueAdmissionIndex);
assert.equal(durableRow.status, "pending");
```

and make the retry store claim both `pending` and `failed`, preserving `retry_count=0` for a pending row's first provider attempt while incrementing failed retries.

- [x] **Step 2: Run RED**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run test:formal-delivery-retry -w apps/api
```

Expected: failures showing no row exists before queue admission and retry ignores `pending`.

- [x] **Step 3: Implement the minimal durable state machine**

Before queue admission, insert:

```sql
insert into alert_deliveries (..., status, next_retry_at)
values (..., 'pending', now())
on conflict (...) do nothing
```

Only enqueue pending rows. Initial workers atomically update `pending -> sending` with `retry_count=0`; retry workers claim `pending` without increment and `failed` with increment. Provider/preparation failures must leave `failed` with the existing 1m/2m/4m schedule, never stranded in memory-only state.

- [x] **Step 4: Run GREEN**

Run both focused commands from Step 2 and require exit code 0.

### Task 2: Authoritative strict by-id formal plan and rule reads

**Files:**
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/tests/plan-entitlements.test.mjs`
- Modify: `apps/api/src/modules/users/users.repository.ts`
- Modify: `apps/api/src/modules/users/users.service.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`

**Interfaces:**
- Produces: `UsersService.getFormalEntitlementsById(userId: string)`.
- Produces: `StrategyService.currentFormalAlertRule(userId: string)`.

- [x] **Step 1: Write failing exact-user/error propagation tests**

Require a user beyond the first 50 to resolve by exact ID, require `queryStrict`, and assert that lookup errors/missing active rules fail formal matching/delivery instead of selecting the first user or `DEFAULT_ALERT_RULE`.

- [x] **Step 2: Run RED**

```powershell
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run test:entitlements -w apps/api
```

Expected: missing strict methods and current fallback behavior.

- [x] **Step 3: Implement strict reads**

Use exact predicates:

```sql
where u.id::text = $1
limit 1
```

through `queryStrict`. Build entitlements only from that exact user and strict plan/daily usage rows. Query the active default alert rule with the exact user ID through `queryStrict`; throw `formal_user_not_found` or `formal_alert_rule_not_found` instead of substituting another/default user.

- [x] **Step 4: Run GREEN**

Run both focused commands and require exit code 0.

### Task 3: Binance close-boundary performance selection

**Files:**
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`

**Interfaces:**
- Produces: boundary-aware performance candle selection using Binance's inclusive `close_time`.

- [x] **Step 1: Add realistic failing fixtures**

Create 5m candles whose `close_time` is `open_time + 300_000 - 1`. Assert a 15m horizon selects the candle ending at `signalTime + 15m - 1`, not the following candle.

- [x] **Step 2: Run RED**

```powershell
npm.cmd run test:strategy-contract -w apps/api
```

Expected: selected price belongs to the next 5m candle.

- [x] **Step 3: Implement boundary comparison**

Compare effective exclusive closes:

```ts
const closesAt = candle.close_time === undefined
  ? candle.open_time + PERFORMANCE_CANDLE_MS
  : candle.close_time + 1;
return closesAt >= targetTime;
```

- [x] **Step 4: Run GREEN**

Run the strategy contract test and require exit code 0.

### Task 4: Consistent queue age and recoverable pressure readiness

**Files:**
- Modify: `apps/api/tests/formal-signal-queue.test.mjs`
- Modify: `apps/api/tests/formal-async-work-queue.test.mjs`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/src/modules/strategy/formal-signal-queue.ts`
- Modify: `apps/api/src/modules/strategy/formal-async-work-queue.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `docs/API_CONTRACTS.md`
- Modify: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- Both queue status types produce `oldestActiveAt`, `oldestInFlightAt`, `latestPressureAt`, and `pressureActive`.
- Both queue constructors accept an optional `now` clock for deterministic tests.

- [x] **Step 1: Write failing queue and readiness tests**

Block active work and require it to remain visible. Fill/reject each queue, advance an injected clock beyond 60 seconds after recovery, and require `pressureActive` to clear while cumulative `pressureRejected` remains.

- [x] **Step 2: Run RED**

```powershell
npm.cmd run test:formal-signal-queue -w apps/api
npm.cmd run test:formal-async-work-queue -w apps/api
npm.cmd run test:strategy-contract -w apps/api
```

Expected: missing status fields, active calculation age omitted, and delivery lifetime pressure never recovers.

- [x] **Step 3: Implement uniform telemetry/readiness**

Track queued and active work separately. Set `latestPressureAt` on rejection and calculate:

```ts
pressureActive = inFlightCount >= capacity
  || now.getTime() - latestPressureAt.getTime() <= 60_000;
```

Readiness checks `oldestInFlightAt` and `pressureActive` for calculation, matching, and delivery.

- [x] **Step 4: Run GREEN**

Run all three focused commands and require exit code 0.

### Task 5: Immutable event snapshot projection

**Files:**
- Modify: `apps/api/tests/strict-persistence.test.mjs`
- Modify: `apps/api/src/modules/signals/signals.repository.ts`

**Interfaces:**
- `/api/signals` continues returning `SignalRecord[]`, but every identity/content field comes from `signal_events`.

- [x] **Step 1: Write a failing parent-reuse projection test**

Return conflicting parent and event title/reason/type values and require the event snapshot values.

- [x] **Step 2: Run RED**

```powershell
npm.cmd run test:strict-persistence -w apps/api
```

Expected: SQL still selects `s.title`, `s.reason`, and `s.signal_type`.

- [x] **Step 3: Project immutable columns**

Select:

```sql
se.title,
se.reason,
se.signal_type
```

and remove the parent `signals` join from the public projection.

- [x] **Step 4: Run GREEN**

Run the strict persistence test and require exit code 0.

### Task 6: Seven-day evaluation retention

**Files:**
- Modify: `apps/api/tests/formal-signal-reconciler.test.mjs`
- Modify: `apps/api/src/modules/strategy/formal-signal-reconciler.ts`

**Interfaces:**
- `FormalSignalReconcilerOptions.retentionDays` defaults to `7` independently of `lookbackMinutes`.

- [x] **Step 1: Write a failing retention cutoff test**

At `2026-07-23T04:00:00Z`, require `purgeFinishedBefore` to receive `2026-07-16T04:00:00Z`, even though reconciliation lookback remains 1440 minutes.

- [x] **Step 2: Run RED**

```powershell
npm.cmd run test:formal-signal-reconciler -w apps/api
```

Expected: actual cutoff is only 24 hours old.

- [x] **Step 3: Separate retention from recovery lookback**

Add `DEFAULT_RETENTION_DAYS = 7`, normalize `retentionDays`, and calculate the purge cutoff from days.

- [x] **Step 4: Run GREEN**

Run the reconciler test and require exit code 0.

### Task 7: Full verification, report, and commit

**Files:**
- Modify: `.superpowers/sdd/final-fix-report.md` (ignored shared-workspace artifact)
- Modify documentation only where final behavior changed.

- [x] **Step 1: Run required verification**

```powershell
npm.cmd run test:api:core
npm.cmd run test:web:core
$env:PYTHON_BIN='D:\yansir\.venv\Scripts\python.exe'; npm.cmd run test:strategy
npm.cmd run build:api
npm.cmd run build:web
npm.cmd run test:ci-config
npm.cmd run test:ci-service-readiness
git diff --check
```

- [x] **Step 2: Run real PostgreSQL verification**

Start only the repository PostgreSQL service, then run:

```powershell
npm.cmd run db:schema
npm.cmd run db:seed
npm.cmd run db:verify
npm.cmd run db:verify-formal
npm.cmd run ci:verify-formal-runtime
```

Require connected Postgres and `formalSignals.ready=true`; remove only the created PostgreSQL container afterward.

- [x] **Step 3: Append second-wave evidence**

Add a clearly labeled `Second-wave re-review fixes` section containing every RED failure, GREEN command, PostgreSQL result, compatibility note, and cleanup result.

- [x] **Step 4: Commit**

Stage source/tests/schema/docs intentionally, run `git diff --cached --check`, and commit with:

```powershell
git commit -m "fix(api): close formal pipeline rereview gaps"
```

Do not push or integrate.
