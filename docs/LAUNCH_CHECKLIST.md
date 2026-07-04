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
