# Final Broad-Review Fix Report

## Status

DONE

## Commits

- Base reviewed: `d3f1a91`
- Implementation: `e27957b fix(portal): close public launch review blockers`

## What changed

1. Public signal serialization now uses a shared eligible-ledger predicate for both the seven-day summary and paginated rows. It excludes `market_observation`, requires long/short strategy rows, keeps the exact server-side eight-hour delay and seven-day window, and maps anonymous per-row outcome state to completion-only `pending`/`completed`. Public 4h/24h/MFE/MAE values remain null and cannot leak through `outcomeStatus`.
2. Cached private identity, entitlements, orders, and team data no longer initialize or render before `/api/me` verifies the active non-Guest identity. Order creation and payment both require that verified identity, including expired/switched-session behavior.
3. Track Record now uses the same eligible ledger as the summary, exposes per-row completion state without win/loss direction, reads restored symbol/direction filters, and supports `hasMore`/`nextPage` load-more pagination so all eligible seven-day rows are reachable.
4. Return intents now preserve a route-scoped allowlist of filters, selected symbol/signal, and requested action. Market watchlist save, Track Record filters/full-performance continuation, AI Claw signal review, and plan-upgrade continuation restore context without automatically replaying state-changing actions.
5. Plans now compares AI Claw daily allowance, team seats, delay/history/timeframes/watchlist/alerts/API, and includes explicit monthly billing rules plus FAQ. A requested plan is restored and visibly selected after login.
6. Private routes reset stale public metadata and set `noindex,nofollow`; Home delay copy consumes the API's `delayHours` rather than hard-coding eight hours.

## TDD evidence

### RED

Command:

`npm.cmd run test:strategy-contract -w apps/api; npm.cmd run test:portal-runtime -w apps/web; npm.cmd run test:public-performance -w apps/web; npm.cmd run test:portal-routing -w apps/web; npm.cmd run test:portal-source -w apps/web`

Expected failures observed before production changes:

- API public SQL lacked long/short and `market_observation` eligibility predicates.
- `canPayMemberOrder` and `effectivePrivatePortalState` did not exist.
- Track Record rows lacked `completionStatus` and pagination source lacked `hasMore`.
- `createContextualReturnIntent` did not exist.

Additional RED:

`npm.cmd run test:public-metadata -w apps/web`

- Private route metadata test failed because the robots meta did not exist and stale public canonical state remained.

### GREEN

Focused verification after implementation:

- `test:strategy-contract` — passed
- `test:portal-runtime` — passed
- `test:public-performance` — passed
- `test:portal-routing` — passed
- `test:portal-source` — passed
- `test:public-metadata` — passed
- Web TypeScript lint — passed
- API build — passed
- Web production build with `PUBLIC_SITE_ORIGIN=https://example.test/yansir` — passed

Full regression run:

- Web: entitlement, K-line confirmation, K-line realtime, K-line strategy source, Radar live, touch targets, portal source, public metadata, portal runtime, prompt focus, portal routing, public performance, and view routing — all passed.
- API: strategy contract, market stream, entitlement build/tests (13/13) — all passed.
- The live-stack `plan-e2e.test.mjs` contract was strengthened to reject public `success`/`failed` outcomes; it was not executed because this worktree verification did not start the external API/database/web stack.

## Files changed

- `apps/api/src/modules/strategy/strategy.service.ts`
- `apps/api/tests/strategy-contract.test.mjs`
- `apps/api/tests/plan-e2e.test.mjs`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/features/portal/PublicHomeView.tsx`
- `apps/web/src/features/portal/PublicTrackRecordView.tsx`
- `apps/web/src/features/portal/publicMetadata.ts`
- `apps/web/src/features/portal/publicPerformance.ts`
- `apps/web/src/features/portal/publicPortalApi.ts`
- `apps/web/src/features/portal/publicPortalRuntime.ts`
- `apps/web/src/features/portal/returnIntent.ts`
- `apps/web/src/styles/app.css`
- `apps/web/tests/portal-routing.test.mjs`
- `apps/web/tests/public-metadata.test.mjs`
- `apps/web/tests/public-performance.test.mjs`
- `apps/web/tests/public-portal-runtime.test.mjs`
- `apps/web/tests/public-portal-source.test.mjs`

## Self-review

- Confirmed AI Claw remains explanation/review only and no signal-generation path changed.
- Confirmed anonymous locks remain 4h/24h/MFE/MAE and the server delay/history predicates remain exactly eight hours/seven days.
- Confirmed no destructive return action is auto-replayed; users must reconfirm watchlist saves, plan orders, and payments.
- Confirmed navigation order, aliases, strategy lifecycle/scoring, and unrelated files were not changed.
- `git diff --check` passed before commit. No unresolved blocker remains.

## Final re-review follow-up

- Removed the fabricated numeric AI Claw allowance from Plans. The comparison now states the implemented, authoritative behavior: anonymous capability preview and full conversation after login. It no longer reuses `signalQuota` as an AI quota.
- Replaced the remaining Home empty-state hard-coded eight-hour sentence with `delayHours` from the public API, with neutral server-delay wording while that value is unavailable.
- Private metadata now removes the canonical link element entirely while keeping `noindex,nofollow`; returning to a public route recreates the correct canonical and restores `index,follow`.

TDD RED evidence:

- `test:portal-source` failed because Plans did not yet contain authoritative login availability and still reused the numeric signal quota.
- `test:public-metadata` failed because the private-route canonical element still existed with an empty `href`.

GREEN evidence:

- `test:portal-source`, `test:public-metadata`, and `test:portal-runtime` passed.
- Web TypeScript lint passed.
- Web production build passed with `PUBLIC_SITE_ORIGIN=https://example.test/yansir`.
