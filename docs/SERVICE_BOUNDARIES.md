# Service Boundaries

## apps/web

Owns:

- Mobile app UI
- Navigation and route state
- Signal list rendering
- ValueClaw chat rendering
- Account and plan screens
- Admin-lite user screens

Does not own:

- strategy calculation
- billing decisions
- quota enforcement
- Feishu secrets

## apps/api

Owns:

- authentication
- users and teams
- plans, subscriptions, payments
- quota and permission enforcement
- signal records
- Feishu binding and delivery
- ValueClaw intent orchestration
- admin APIs

Does not own:

- indicator implementation
- candle-by-candle strategy replay
- raw exchange data normalization beyond business storage

## services/strategy

Owns:

- market data collection
- indicator calculations
- embedded Pine strategy migration
- anomaly score primitives
- backtests
- strategy state snapshots

Does not own:

- user permissions
- payments
- Feishu delivery
- final user visibility rules

## Redis

Owns:

- scan locks
- queues
- temporary market snapshots
- signal dedupe keys
- quota counters
- Feishu retry queue

## Postgres

Owns durable records:

- users
- subscriptions
- signals
- signal events
- signal performance
- strategy runs
- scheduled tasks
- Feishu bindings
