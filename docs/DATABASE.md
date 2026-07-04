# Database Plan

## Core Tables

```text
users
plans
subscriptions
usage_quotas
team_members
feishu_bindings
alert_rules
alert_deliveries
watchlists
signals
signal_events
signal_performance
market_snapshots
strategy_runs
scheduled_tasks
payments
api_keys
audit_logs
```

## Important Notes

- `signals` stores normalized signal definitions.
- `signal_events` stores each emitted signal instance and push price.
- `signal_performance` stores post-push performance such as 5m, 15m, 1h, 4h returns.
- `strategy_runs` stores embedded strategy outputs and metrics for replay/debugging.
- `usage_quotas` stores plan-limited usage counters.
- `feishu_bindings` stores per-user or per-team Feishu bot configuration.
- `alert_rules` stores per-user monitoring rules such as symbols, timeframe, score threshold, direction filters, cooldown, and schedule interval.
- `alert_deliveries` stores Feishu delivery attempts, including sent/skipped/failed status and payload metadata.

## Suggested Database

Use Postgres. If signal volume grows, add TimescaleDB for Kline snapshots and signal performance time series.

## Current API Integration

The NestJS API now has a global `DatabaseModule` and repository layer for:

- users and current account state
- plans and commercial feature flags
- latest signal events and signal metadata

Runtime behavior:

- Set `DATABASE_URL` to enable Postgres reads.
- Leave `DATABASE_URL` empty during frontend development to use local mock data.
- Repository methods return the same response shape in both modes, so the web app does not need separate mock wiring.

Local migration helper:

```text
npm run db:setup
npm run db:verify
```

These commands use `infra/migrate.mjs` and the existing `pg` dependency, so `psql` is optional. `db:setup` applies `infra/schema.sql`, applies `infra/seed.sql`, then verifies important table counts.
