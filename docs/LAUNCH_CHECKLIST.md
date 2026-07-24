# Launch Checklist

This checklist is the release gate for the membership MVP.

## 1. Build

```text
npm run build:api
npm run build:web
```

Both commands must pass before a release candidate is tagged.

## 2. Required Environment

Production must not use mock or fallback mode.

Required:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ORIGIN`
- `AUTH_TOKEN_SECRET`
- `BILLING_PROVIDER`
- `BILLING_WEBHOOK_SECRET`
- `STRATEGY_SERVICE_URL`

Payment provider requirements:

- Stripe: `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`
- WeChat Pay: `BILLING_PROVIDER=wechat`, `WECHAT_PAY_MCH_ID`, `WECHAT_PAY_API_KEY`
- Alipay: `BILLING_PROVIDER=alipay`, `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`

Optional but recommended:

- `FEISHU_WEBHOOK_URL`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

## 3. Database

Run schema and seed against the production Postgres instance:

```text
npm run db:setup
npm run db:verify
```

Do not accept real payment traffic while `DATABASE_URL` is missing or the API reports mock mode.

## 4. Release Checks

Run:

```text
REQUIRE_PRODUCTION_READY=true npm run deploy:check
npm run smoke
```

`deploy:check` must pass for production launch. `smoke` must pass against the deployed API and web URLs.

## 5. Formal Signal Runtime Gate

After the API starts with the production environment, verify the close-confirmed pipeline before allowing user delivery:

```text
GET /api/health
GET /api/strategy/formal/status
```

Required checks:

- `database.mode` is `postgres` and `database.connected` is `true`; mock or disconnected database mode is a launch blocker.
- `formalSignals.ready` is `true`; investigate the returned `reason` before continuing when it is false.
- Calculation, matching, and delivery queue depths are bounded, `oldestInFlightAt` is under 60 seconds, and `pressureActive` is false for all three queues. Check `formalSignals.queue`, `formalSignals.matchQueue`, and `formalSignals.deliveryQueue`; `pressureRejected` is intentionally cumulative, while matching latency is the close-to-inbox-success measure.
- Reconciliation is enabled, healthy, and fresh; verify its interval and latest reconciliation/persistence timestamps in `formalSignals.reconciliation`.
- Delivery retry is enabled and has no active error in `formalSignals.deliveryRetry`.
- `GET /api/strategy/performance/status` reports an enabled, healthy performance updater with a fresh latest run after persisted formal signals exist. Confirm `GET /api/strategy/public-performance-summary` and `GET /api/strategy/public-signals?limit=10` read persisted data. The intentional eight-hour public delay can leave the public list empty until an eligible signal ages in.

For a live acceptance observation, watch BTCUSDT, ETHUSDT, and SOLUSDT through a 5m close and an available higher-timeframe close. Each completed evaluation must use `bar_time = closedAt - timeframe duration`, end as `succeeded` even when it produces zero signals, persist a signal before inbox/delivery matching, and remain idempotent if its close event is replayed. Do not fabricate a production signal when the strategy produces none.

## 6. Manual Browser QA

Verify these pages on desktop and mobile width:

- Login
- Register
- Account
- Plans
- Team
- Admin

Expected:

- Login/register/admin/plans/team pages do not show bottom navigation.
- Account page keeps bottom navigation.
- No horizontal overflow on mobile.
- Non-admin users cannot enter admin data.
- Orders can only be read or paid by their owner or an admin.

## 7. Payment Gate

Before production:

- `BILLING_PROVIDER` must not be `mock`.
- Provider credentials must be configured.
- Payment webhook must use `BILLING_WEBHOOK_SECRET`.
- Manual mock payment endpoint must not be relied on in production.
- A real provider test order must activate the correct VIP/SVIP subscription.

## 8. Rollback

Before release, record:

- API image/build version
- Web image/build version
- Database migration timestamp
- Previous working deployment version

Rollback means restoring the previous API/web build and confirming:

```text
npm run smoke
```

## 8. Public Product Portal

Final verification run: 2026-07-18. The production web build used
`PUBLIC_SITE_ORIGIN=https://yansir.example`.

Automated release checks:

- [x] `npm run test:portal-routing -w apps/web`
- [x] `npm run test:portal-source -w apps/web`
- [x] `npm run test:public-performance -w apps/web`
- [x] `npm run test:view-routing -w apps/web`
- [x] `npm run test:entitlements -w apps/web`
- [x] `npm run test:radar-live -w apps/web`
- [x] `npm run test:touch-targets -w apps/web`
- [x] `npm run test:kline-confirmation -w apps/web`
- [x] `npm run test:kline-realtime -w apps/web`
- [x] `npm run test:kline-strategy-source -w apps/web`
- [x] `npm run build -w apps/web`
- [x] `npm run test:strategy-contract -w apps/api`
- [x] `npm run test:entitlements -w apps/api`
- [x] `npm run build -w apps/api`
- [x] `npm run test:ci-config`
- [x] Additional regression: `npm run test:public-metadata -w apps/web`
- [x] Additional regression: `npm run test:portal-runtime -w apps/web`
- [x] Accessibility regression: `npm run test:prompt-focus -w apps/web`

Local release-candidate evidence:

- [x] All six public routes returned HTTP 200 from the worktree dev server.
- [x] `/api/strategy/public-signals` returned `delayHours: 8`, `historyDays: 7`,
  and locked fields `4h`, `24h`, `maxFavorablePct`, and `maxAdversePct`.
- [x] `/api/strategy/public-performance-summary` separated completed and pending
  24-hour sample counts.
- [x] Desktop navigation order: Home, Market, AI Claw, Radar, Track Record, Plans.
- [x] Mobile navigation order: Market, AI Claw, Radar, Track Record, My.
- [x] At 1440 x 900 and 320 x 800, checked public pages had no horizontal page
  overflow and visible controls met the 44 px target.

Exact public route checks:

- [x] `/yansir/?view=home`: Home rendered; `体验公开雷达` navigated to
  `?view=radar`, and the separate history CTA navigated to
  `?view=track-record` at 320 px.
- [x] `/yansir/?view=data`: anonymous SOXL save opened the Login prompt while
  retaining `?view=data&symbol=SOXL`; the Login action reached `?view=login`.
- [x] `/yansir/?view=claw`: anonymous preview rendered with a Login CTA and no
  signal creation or overwrite behavior; source regression confirms the preview
  contains no `fetch` or `/api/claw` call.
- [x] `/yansir/?view=radar`: API response verified `delayHours: 8`; a fresh
  anonymous browser trace called only `/api/strategy/public-signals` and general
  public/bootstrap endpoints, with no private signals, inbox, watchlist, or
  realtime Radar endpoint.
- [x] `/yansir/?view=track-record`: summary and rows container rendered; the page
  showed the 8-hour delay, 7-day window, anonymous 15m/1h availability, and
  locked longer-window/MFE/MAE copy.
- [x] `/yansir/?view=plans`: the public VIP comparison rendered and anonymous
  order creation reached `?view=login`.

Failure and accessibility states:

- [x] Empty Track Record copy explicitly states that signals are not fabricated.
- [x] Keyboard focus used a visible high-contrast light/dark focus ring.
- [x] Automated state coverage distinguishes no-signal, paused/degraded,
  pending, stale, and unavailable/retry states.
- [x] Prompt-close focus restoration has a focused behavior/source regression;
  both the dialog's backdrop and defer action return focus to the captured
  triggering control.
- [x] Browser retest: closing the SOXL add-to-watchlist prompt with `稍后再说`
  returned `document.activeElement` to the original `加入自选 SOXL` button.
- [x] With the API blocked, Home and Track Record showed honest empty/no-
  fabrication states, AI Claw remained preview-only, and global status announced
  failed interfaces/cached state.
- [x] After a successful public Track Record load followed by API 503 responses,
  the browser preserved the cached BTC row and locked fields, displayed
  `数据已过期`, the last successful timestamp, and `重新加载`; retry issued fresh
  public signals and performance-summary requests and remained safely stale.
- [ ] Actual 200% browser zoom remains pending. A 320 CSS-pixel viewport passed
  responsive reflow checks, but that is not recorded as an actual 200% zoom test.
