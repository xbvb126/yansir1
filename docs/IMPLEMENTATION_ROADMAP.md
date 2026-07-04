# Implementation Roadmap

## Phase 0: Current Prototype

Keep the current static prototype available at `http://localhost:4173`.

It validates:

- Mobile navigation
- Data page
- ValueClaw chat-style analysis page
- AI coin selection signal table
- Signal center
- Account, plans, users, and quota UI
- Feishu alert proxy shape

## Phase 1: Formal App Shell

Initialize:

```text
apps/web      React + Vite
apps/api      NestJS
services/strategy  FastAPI
infra         Docker Compose for Postgres and Redis
```

Migrate current prototype UI into `apps/web`.

## Phase 2: Business API

Implement NestJS modules:

```text
auth
users
plans
subscriptions
signals
alerts
claw
admin
usage
```

Use mocked strategy data first so the frontend and commercial flows can be tested.

Status:

- Initial endpoints are available for users, billing plans, market overview, signals, Feishu alerts, and ValueClaw.
- Users, billing plans, and signals now read through repository classes.
- The API can run without Postgres by falling back to local mock data, and can switch to Postgres by setting `DATABASE_URL`.

## Phase 3: Strategy Service

Implement Python modules:

```text
indicators
market_data
strategies/emd_trend
scoring
backtest
```

Port the Pine strategy directly and preserve all rule content.

Status:

- Python FastAPI strategy service exposes `/strategy/health` and `/strategy/run`.
- NestJS exposes product-facing `/api/strategy/run`.
- The API gateway calls the strategy service and maps returned strategy signals into the system signal lifecycle.
- When Postgres is connected, strategy signals are inserted into `signals` and `signal_events`; without Postgres, the endpoint still returns the raw strategy result with `persisted: false`.

## Phase 4: Market Data

Start with Binance Futures:

```text
ticker 24h
Klines
open interest
funding rate
premium index
```

Then add OKX and DEX/chains only after the first strategy loop is stable.

Status:

- NestJS exposes `/api/market/ticker` and `/api/market/klines`.
- Market data maps Binance USDⓈ-M Futures ticker and Kline responses into internal candle/ticker objects.
- Local/offline development falls back to BTCUSDT fixture candles.
- `/api/strategy/run` can now run with only `symbol` and `timeframe`; the API fetches K lines before calling the Python strategy service.

## Phase 5: Signal Lifecycle

For every signal:

```text
generated
deduped
stored
scored
permission-filtered
shown in web
pushed to Feishu if eligible
tracked for post-push performance
```

Status:

- Manual batch scanning is available through `POST /api/strategy/scan`.
- Default scan symbols are BTCUSDT, ETHUSDT, and XRPUSDT.
- Each symbol is processed independently so a single failure does not stop the batch.
- The latest in-memory scan snapshot is available through `GET /api/strategy/scan/latest`.
- Signals returned by the strategy gateway still use the existing persistence path and report `persisted: false` when Postgres is not connected.
- `POST /api/strategy/scan/alert` can filter high-score scan candidates and send Feishu text alerts.
- When `FEISHU_WEBHOOK_URL` is not configured, alert delivery returns a preview payload instead of failing.

## Phase 6: ValueClaw

ValueClaw should support:

- `coin_recommendation`: today’s opportunity coins.
- `market_snapshot`: BTC/ETH or symbol-specific latest data.
- `signal_explanation`: explain why a signal fired.
- `scheduled_task`: create recurring Feishu reports.
- `backtest_request`: run or summarize strategy backtests.

The AI response must be grounded in structured data from the API/strategy service.

## Phase 7: Commercialization

Implement:

- login/register
- plans and subscriptions
- usage quotas
- Feishu binding
- team seats
- admin user management
- payment provider
- audit logs

Status:

- Current user entitlements are available through `GET /api/me/entitlements`.
- Free/VIP/SVIP limits are modeled for scan symbol count, daily signal quota, Feishu alerts, API access, team seats, alert score threshold, and allowed timeframes.
- Strategy scan and scan-to-alert endpoints enforce the current user's entitlements and return a `permission` block for frontend display.
- The web account and signal pages now read entitlements, plans, users, scan snapshots, and scan-to-alert status from the API.
- The frontend shows quota, scan limits, allowed timeframes, Feishu capability, API access, team seats, and plan features using real API data.

## Phase 7.5: Scheduled Scans

Implement:

- recurring scan configuration
- start/stop/status controls
- scan-to-alert execution
- last run snapshot
- production persistence in Redis/Postgres

Status:

- In-memory scheduled scans are available through `/api/strategy/scan/schedule/start`, `/api/strategy/scan/schedule`, and `/api/strategy/scan/schedule/stop`.
- The scheduler reuses the existing entitlement checks and Feishu alert filtering.
- `runImmediately` can execute the first scan during task creation.
- This is an MVP scheduler; production still needs distributed locks, persistent task state, and retry policy.

## Phase 8: Hardening

- distributed scan locks
- queue retry policy
- signal dedupe rules
- exchange API fallback
- alert rate limits
- model output validation
- strategy replay tests
- monitoring and logs
