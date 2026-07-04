# Infra

Local dependencies for the formal architecture:

```text
npm run env:local
docker compose -f infra/docker-compose.yml up -d
npm run db:setup
```

Services:

- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Default database URL:

```text
postgres://radar:radar@localhost:5432/radar
```

On the first Postgres container initialization, Docker automatically runs:

```text
infra/schema.sql
infra/seed.sql
```

If the `postgres-data` volume already exists, Docker will not rerun init scripts. Apply them manually:

```text
psql "postgres://radar:radar@localhost:5432/radar" -f infra/schema.sql
psql "postgres://radar:radar@localhost:5432/radar" -f infra/seed.sql
```

The project also ships a Node-based migration helper, so `psql` is not required when Node dependencies are installed:

```text
npm run db:setup
npm run db:verify
```

Optional commands:

```text
npm run db:schema
npm run db:seed
```

The API can still run without Docker. When `DATABASE_URL` is empty, it falls back to local mock data.

## Persisted Data

`infra/schema.sql` provisions the main production tables:

- Users, plans, subscriptions, usage quotas, and team members.
- Billing orders for commercial checkout and payment activation history.
- Feishu bindings, alert rules, alert deliveries, watchlists, and signals.
- Strategy runs, scheduled tasks, API keys, market snapshots, and audit logs.

The billing API keeps a mock-memory fallback when Postgres is unavailable, but production should run `npm run db:setup` before accepting real payments.

## Deployment Checks

Run a local service smoke check:

```text
npm run smoke
```

Run an environment readiness check:

```text
npm run deploy:check
```

`deploy:check` automatically reads `.env.local` and `.env` when present.

If `API readiness` reports `Postgres is not connected`, choose one path:

- Install Docker Desktop, then run `npm run db:up` and `npm run db:setup`.
- Or set `DATABASE_URL` in `.env.local` to a reachable managed Postgres database, then run `npm run db:setup`.

For a stricter production gate, require all configured checks to pass:

```text
REQUIRE_PRODUCTION_READY=true npm run deploy:check
```

Production must configure at least:

- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ORIGIN`
- `AUTH_TOKEN_SECRET`
- `BILLING_PROVIDER`
- `BILLING_WEBHOOK_SECRET`
- `STRATEGY_SERVICE_URL`

Optional but recommended:

- `FEISHU_WEBHOOK_URL`
- `API_BASE_URL`
- `WEB_BASE_URL`
- Selected payment provider credentials: `STRIPE_SECRET_KEY`, WeChat Pay credentials, or Alipay credentials.
