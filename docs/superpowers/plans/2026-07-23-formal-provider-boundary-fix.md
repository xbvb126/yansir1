# Formal Feishu Provider Boundary Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve exact strict formal-user policy and webhook identity through the actual Feishu provider call without changing legacy non-formal alert behavior.

**Architecture:** `StrategyService.prepareDelivery` remains the authoritative formal policy boundary: it strictly loads the exact user's entitlements, quota inputs, push setting, active binding, and alert rule. It will pass an immutable exact provider target to a dedicated `AlertsService.sendFormalFeishu` method that performs only provider I/O and exact-user history bookkeeping, with no user lookup, entitlement lookup, quota query, webhook fallback, or environment fallback. Existing `sendFeishu` remains the legacy public/non-formal path.

**Tech Stack:** NestJS/TypeScript, PostgreSQL 16, Node/esbuild contract tests, Python unittest strategy suite.

## Global Constraints

- Base commit is `057ac23`.
- Exercise the real `AlertsService` instance from the `StrategyService` formal delivery path.
- A user beyond the first 50 must use only their exact strict entitlements, quota reservation, and webhook.
- Strict database errors must propagate into durable `failed` delivery state with retry scheduling and no provider send.
- Preserve legacy `AlertsService.sendFeishu` callers.
- Run focused, API/Web core, strategy 42/42, builds, CI/readiness, real PostgreSQL runtime, and whitespace verification.
- Append third-wave evidence to ignored `.superpowers/sdd/final-fix-report.md`.
- Commit locally; do not push or integrate.

---

### Task 1: Reproduce the provider-boundary identity loss

**Files:**
- Modify: `apps/api/tests/strategy-contract.test.mjs`

**Interfaces:**
- Consumes: existing private formal `deliverInboxSignal` and `enqueueInitialDelivery` paths.
- Produces: real-service regressions for exact provider targeting and durable strict-read failure.

- [ ] **Step 1: Bundle and instantiate the real AlertsService**

Compile `src/modules/alerts/alerts.service.ts` beside the existing StrategyService test bundle. Construct it with a legacy lookup double that deliberately resolves a different first user, while StrategyService receives a strict formal-user service for a target beyond 50.

- [ ] **Step 2: Add exact-target regression**

Make the strict target SVIP with remaining quota and `target_encrypted=https://target-51.example/webhook`; make legacy lookup return another enabled user with `https://wrong-first.example/webhook`. Call the real formal delivery path and require exactly one fetch to the target-51 URL, no legacy user/entitlement lookup, and a final `sent` delivery row.

- [ ] **Step 3: Add strict-failure durability regression**

Allow the pre-admission `pending` insert, then throw `strict_formal_provider_target_lookup_failed` from the exact push-setting `queryStrict`. Admit through the real initial delivery queue and require no fetch, a durable `failed` row containing the error, and retry eligibility.

- [ ] **Step 4: Run RED**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
```

Expected: the target test observes legacy user resolution/wrong provider behavior, and the strict-failure test proves the current real provider path is not isolated from fallback behavior.

### Task 2: Add an exact formal provider API

**Files:**
- Modify: `apps/api/src/modules/alerts/alerts.service.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`

**Interfaces:**
- Produces: `AlertsService.sendFormalFeishu(signal, target, options)`.
- `target`: `{ userId: string; webhookUrl: string }`, prepared from strict formal database reads.
- Preserves: `AlertsService.sendFeishu(signal, userId?, options?)`.

- [ ] **Step 1: Add exact resolved-history/provider helpers**

Split history recording so the legacy wrapper may resolve a user as before, while the formal path records against an already exact user ID without calling `currentUserId`.

- [ ] **Step 2: Add the formal send method**

`sendFormalFeishu` validates non-empty exact user ID and webhook URL, sends only to the supplied URL with the existing timeout/error semantics, and never calls UsersService, `activeWebhookUrl`, `getFeishuConfig`, or a non-strict database read.

- [ ] **Step 3: Pass the authoritative provider target**

Extend `DeliveryPreparation` with the exact user ID and resolved strict webhook (`target_encrypted || binding_webhook_url || ""`). Replace only the formal delivery call with `sendFormalFeishu`; leave manual scan, controller, and test-alert callers on `sendFeishu`.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
npm.cmd run test:strategy-contract -w apps/api
npm.cmd run test:alerts-delivery -w apps/api
npm.cmd run build:api
```

Require exit code 0.

### Task 3: Full verification, report, and commit

**Files:**
- Modify: `.superpowers/sdd/final-fix-report.md` (ignored evidence artifact)

- [ ] **Step 1: Run broad verification**

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

- [ ] **Step 2: Run PostgreSQL verification**

Start only the repository PostgreSQL service and run:

```powershell
npm.cmd run db:schema
npm.cmd run db:seed
npm.cmd run db:verify
npm.cmd run db:verify-formal
npm.cmd run ci:verify-formal-runtime
```

Require connected Postgres and `formalSignals.ready=true`, then remove only the created PostgreSQL container.

- [ ] **Step 3: Append third-wave evidence**

Add a labeled `Third-wave provider-boundary fix` section with exact RED failures, GREEN commands, PostgreSQL results, compatibility notes, and cleanup scope.

- [ ] **Step 4: Commit**

Stage source, tests, and plan intentionally; run `git diff --cached --check`; commit:

```powershell
git commit -m "fix(api): preserve formal provider identity"
```

Do not push, merge, or remove the worktree.
