# Production Checklist

## Must Finish Before Paid Launch

- Replace mock mode with Postgres by running `npm run db:setup` against a live database.
- Set a long random `AUTH_TOKEN_SECRET` and rotate all demo tokens.
- Set `CORS_ORIGIN` to the production web origin.
- Set `PUBLIC_SITE_ORIGIN` to the absolute public site URL, including the deployed base path (for example `https://example.com/yansir`), so canonical links, `robots.txt`, and `sitemap.xml` agree.
- Set `BILLING_PROVIDER` to `stripe`, `wechat`, or `alipay`; never launch paid traffic with `mock`.
- Set `BILLING_WEBHOOK_SECRET` before connecting any payment provider.
- Configure the selected payment provider credentials.
- Replace demo passwords and remove local-only fallback passwords from seeded users.
- Move Feishu webhooks to encrypted storage or a managed secret store.
- Add persistent scheduled tasks for scan jobs. The current scheduler is process-memory only.
- Finish the selected payment provider adapter and verify subscription callback reconciliation before enforcing real billing.
- Replace process-memory auth rate limiting with Redis-backed counters for multi-instance production.
- Add audit logs for admin user changes, Feishu config updates, and alert rule changes.
- Add production monitoring for API, web, strategy service, database, and alert delivery failures.

## Current Verification

- API build passes with `npm run build -w apps/api`.
- Web build passes with `npm run build -w apps/web`.
- Runtime smoke check passes with `npm run smoke`.
- Environment readiness can be checked with `npm run deploy:check`.
- Strict production readiness can be checked with `REQUIRE_PRODUCTION_READY=true npm run deploy:check`.
- Auth supports login, registration, password change, Bearer-token session lookup, and admin-only user mutation.
- Auth endpoints have process-memory rate limiting for login, registration, and password changes.
- Billing webhook can update user subscription state and is protected when `BILLING_WEBHOOK_SECRET` is configured.
- Billing provider readiness is exposed through `GET /api/billing/providers`.
- Billing order access is scoped to the owner or admin.
- Passwords created after this milestone use salted `scrypt` hashes. Legacy SHA-256 hashes remain supported for migration compatibility.

## Pending Manual Launch Verification

- Confirm the public portal remains usable at 200% browser zoom from 320px through 1440px, with visible keyboard focus and no clipped primary actions.

## Suggested Next Milestones

1. Connect live Postgres and run schema plus seed verification.
2. Add Redis-backed scheduled scans and cooldown state.
3. Add payment provider integration and subscription webhook reconciliation.
4. Add Feishu per-user delivery encryption and delivery retry queue.
5. Add strategy backtest and signal performance reports for the commercial dashboard.
