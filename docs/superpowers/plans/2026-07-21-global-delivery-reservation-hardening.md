# Global Delivery Reservation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the transaction-spanning Feishu delivery flow with a pool-safe, cross-instance reservation state machine that enforces daily quota, cooldown, timeout, and same-event idempotency.

**Architecture:** Load entitlement, push-setting, rule, and candidate data before acquiring the PostgreSQL advisory transaction. Inside the transaction, use only its client to check an existing event delivery, count `sending` plus `sent` reservations, check delivery/cooldown occupancy, and insert a unique `sending` row. Commit before invoking Feishu; invoke it with a bounded timeout and database persistence disabled for this reserved path; then use a separate strict transaction to update the reservation to `sent` or `failed` and write cooldown only for success.

**Tech Stack:** NestJS/TypeScript, PostgreSQL `pg`, Node timers/AbortController, esbuild-based contract tests.

## Global Constraints

- Follow RED-GREEN-REFACTOR; no production change precedes its failing regression.
- No ordinary `DatabaseService.query` or other service that can reacquire the pool may run inside an advisory callback.
- No database transaction or advisory lock may remain open while waiting for Feishu.
- `sending` and `sent` rows both occupy daily quota and cooldown; the existing unique `(user_id, signal_event_id, channel)` index provides same-event idempotency.
- Feishu requests use a bounded timeout; timeout finalizes the reservation as `failed`.
- Keep compatibility behavior for non-reserved `AlertsService.sendFeishu` callers.

---

### Task 1: Capture reservation-boundary regressions

**Files:**
- Modify: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Consumes: private `StrategyService.deliverInboxSignal(event, watchlist)` through the existing contract bundle.
- Produces: a lifecycle database fake with distinct ordinary and transaction-client query instrumentation, reservation status transitions, and transaction release observations.

- [ ] **Step 1: Extend the lifecycle fixture without changing production behavior**

Implement one shared `executeQuery(sql, values)` state engine. Make `database.query` increment `ordinaryQueriesInsideAdvisory` whenever `advisoryActive > 0`; make advisory and ordinary transaction clients call `executeQuery` directly. Model delivery uniqueness, `sending` reservation inserts, status finalization, and daily counts scoped by user/channel across `sending` and `sent`.

- [ ] **Step 2: Add failing boundary and contention tests**

Add tests equivalent to:

```js
assert.equal(fixture.database.ordinaryQueriesInsideAdvisory, 0);
assert.equal(alertObservedAdvisoryActive, false);
assert.equal(sameUserSentCount, 1);
assert.equal(distinctUserSentCount, 2);
assert.equal(sameEventSendCalls, 1);
```

Use two `StrategyService` instances for same-user and same-event cases, and two different watchlist user IDs for distinct-user concurrency.

- [ ] **Step 3: Add a failing timeout test**

Set `STRATEGY_FEISHU_TIMEOUT_MS=20`, use an alert promise that never settles, and assert the delivery method completes within a 500 ms test guard, the advisory transaction is already released when the alert starts, and the unique reservation finishes as `failed` with a timeout reason.

- [ ] **Step 4: Run RED**

Run: `npm.cmd run test:strategy-contract -w apps/api`

Expected: failures showing ordinary queries/external send inside the advisory transaction, missing `sending` reservation/finalization, missing timeout, or cross-instance occupancy violations.

### Task 2: Add bounded, non-persisting Feishu send support

**Files:**
- Modify: `apps/api/src/modules/alerts/alerts.service.ts`
- Test: `apps/api/tests/strategy-contract.test.mjs`
- Test: `apps/api/tests/plan-entitlements.test.mjs`

**Interfaces:**
- Produces: `sendFeishu(signal, userId, options?: { timeoutMs?: number; persistDelivery?: boolean })`.
- Preserves: current two-argument callers continue entitlement checks, quota checks, webhook resolution, history persistence, and return shapes.

- [ ] **Step 1: Implement the minimal options contract**

Pass `persistDelivery !== false` to `recordHistory`; keep in-memory history but skip its database upsert for a reserved Strategy delivery.

- [ ] **Step 2: Bound the HTTP request**

When `timeoutMs` is positive, create an `AbortController`, pass its signal to `fetch`, abort on the timer, clear the timer in `finally`, and normalize aborts to `feishu_delivery_timeout:<milliseconds>ms`.

- [ ] **Step 3: Run alert/entitlement contracts**

Run: `npm.cmd run test:entitlements -w apps/api`

Expected: API build and all entitlement/alert behavior tests pass unchanged.

### Task 3: Implement atomic reservation and strict finalization

**Files:**
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Test: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Produces: preparation context loaded before locking; `reserveDelivery(..., transaction)` returning reserved/not-reserved; `finalizeReservedDelivery(...)` using a new strict transaction.
- Consumes: `DatabaseService.withAdvisoryTransaction`, `DatabaseService.withTransaction`, transaction-client `query`, and the AlertsService options from Task 2.

- [ ] **Step 1: Prepare static context before advisory locking**

Within the existing process-local per-user tail, load entitlements, push settings, and alert rules first. Build the candidate and computed daily/cooldown thresholds before calling `withAdvisoryTransaction`.

- [ ] **Step 2: Reserve using only the transaction client**

Inside the advisory callback:

```sql
select status from alert_deliveries
where user_id = $1 and signal_event_id = $2 and channel = $3
limit 1;
```

Return without sending if any same-event row exists. Apply static gates with transaction-client skipped writes. Count `status in ('sending', 'sent')` for the current day. Check cooldown against both existing cooldown rows and recent `sending`/`sent` delivery rows. Insert `status='sending' ... on conflict do nothing returning id`; only a returned row authorizes the external send.

- [ ] **Step 3: Commit, then send with a caller-side timeout**

After `withAdvisoryTransaction` resolves, call:

```ts
this.alertsService.sendFeishu(candidate, userId, {
  timeoutMs,
  persistDelivery: false
})
```

Wrap the promise with a clearing `Promise.race` timeout so even a non-cooperative implementation cannot hold the workflow indefinitely. No advisory or ordinary transaction is active at this point.

- [ ] **Step 4: Strictly finalize the reservation**

Use `database.withTransaction`. Update exactly one `sending` row to `sent` or `failed`; throw `delivery_finalization_incomplete` if no row returns. On `sent`, upsert `signal_delivery_cooldowns` in the same transaction and update the process-local cooldown map. On failure/timeout, persist the reason and do not create cooldown.

- [ ] **Step 5: Run GREEN and refactor**

Run: `npm.cmd run test:strategy-contract -w apps/api`

Expected: all pool-boundary, timeout, idempotency, daily-limit, cooldown, global lifecycle, and existing strategy contracts pass.

### Task 4: Full verification, report, and commit

**Files:**
- Modify: `.superpowers/sdd/global-scan-final-fix-report.md` (ignored evidence report)
- Commit all production/test/plan changes.

**Interfaces:**
- Produces: a clean committed worktree and exact RED/GREEN evidence.

- [ ] **Step 1: Run focused and full API verification**

Run strict persistence, strategy, global schedule, aligned scanner, market symbol, market stream, entitlement suites, and API build. Every command must exit `0`.

- [ ] **Step 2: Run relevant Web verification**

Run Web entitlement, Radar-live, view-routing, and production build. Every command must exit `0`.

- [ ] **Step 3: Verify the diff**

Run `git diff --check`, inspect the complete diff, stage exact files, and run `git diff --cached --check`.

- [ ] **Step 4: Commit and document**

Commit with `fix: reserve global deliveries before sending`. Append the commit hash, RED/GREEN outputs, reservation state machine, pool-boundary proof, timeout behavior, and calibrated crash-window/idempotency notes to the existing final-fix report.

## Self-Review

- Spec coverage: pool reacquisition, transaction-free external send, atomic quota/cooldown reservation, same-event idempotency, distinct/same-user concurrency, timeout, verification, commit, and report are each assigned above.
- Placeholder scan: no deferred implementation or unspecified test step remains.
- Type consistency: the AlertsService options, reservation/finalization methods, `sending` status, and transaction-client-only query contract are consistent across tasks.
