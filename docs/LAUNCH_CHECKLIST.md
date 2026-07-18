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

## 5. Manual Browser QA

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

## 6. Payment Gate

Before production:

- `BILLING_PROVIDER` must not be `mock`.
- Provider credentials must be configured.
- Payment webhook must use `BILLING_WEBHOOK_SECRET`.
- Manual mock payment endpoint must not be relied on in production.
- A real provider test order must activate the correct VIP/SVIP subscription.

## 7. Rollback

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

- [ ] `/yansir/?view=home`: Home rendered. CTA-to-Radar interaction was not
  completed in the final browser session. The separate history CTA did navigate
  to `?view=track-record` at 320 px.
- [x] `/yansir/?view=data`: anonymous SOXL save opened the Login prompt while
  retaining `?view=data&symbol=SOXL`; the Login action reached `?view=login`.
- [x] `/yansir/?view=claw`: anonymous preview rendered with a Login CTA and no
  signal creation or overwrite behavior; source regression confirms the preview
  contains no `fetch` or `/api/claw` call.
- [ ] `/yansir/?view=radar`: API response verified `delayHours: 8`; realtime
  network-call absence was not inspected in the final browser session.
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
- [x] With the API blocked, Home and Track Record showed honest empty/no-
  fabrication states, AI Claw remained preview-only, and global status announced
  failed interfaces/cached state.
- [ ] Browser-blocked API, prompt focus restoration, and actual 200% browser zoom
  are not fully complete: stale last-success timestamp, retry, and focus return
  were not exercised. A 320 CSS-pixel viewport passed responsive reflow checks,
  but that is not recorded as an actual 200% zoom test.
