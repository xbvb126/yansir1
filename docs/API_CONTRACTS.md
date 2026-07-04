# API Contracts

## Business API

```text
GET  /api/me
GET  /api/me/entitlements
GET  /api/health
GET  /api/health/readiness
GET  /api/billing/plans
POST /api/billing/webhook
GET  /api/admin/users
GET  /api/market/overview
GET  /api/market/ticker
GET  /api/market/klines
GET  /api/signals
GET  /api/signals/:id/performance
GET  /api/strategy/scan/latest
GET  /api/strategy/scan/schedule
POST /api/strategy/run
POST /api/strategy/scan
POST /api/strategy/scan/alert
POST /api/strategy/scan/schedule/start
POST /api/strategy/scan/schedule/stop
POST /api/alerts/feishu
POST /api/auth/login
POST /api/auth/register
POST /api/auth/change-password
GET  /api/auth/session
POST /api/claw/chat
POST /api/tasks/schedule
```

Current implementation notes:

- `/api/health` reports whether the API is using mock mode or a live Postgres connection.
- `/api/health/readiness` reports production blockers such as missing Postgres and default auth token secrets.
- `/api/me/entitlements` returns current plan limits for scan count, signal quota, Feishu alerts, API access, and allowed timeframes.
- `/api/me`, `/api/admin/users`, `/api/billing/plans`, and `/api/signals` read through repository classes.
- `/api/billing/webhook` accepts subscription events from a payment provider and updates user plan, status, expiry, quota, and audit logs. If `BILLING_WEBHOOK_SECRET` is configured, callers must send `x-billing-webhook-secret`.
- `/api/market/ticker` and `/api/market/klines` read Binance USDⓈ-M Futures data when available and fall back to fixture data during local/offline development.
- `/api/strategy/run` calls the Python strategy service and attempts to persist returned signals into `signals` and `signal_events`.
- If `/api/strategy/run` receives no `candles`, the API fetches K lines first and then sends the enriched payload to the strategy service.
- `/api/strategy/scan` runs the same strategy over a batch of symbols. It is the manual trigger that will later become a scheduled scan job.
- `/api/strategy/scan/latest` returns the last in-memory scan snapshot for local UI integration.
- `/api/strategy/scan/alert` scans symbols, filters candidates by score, and sends Feishu alerts when `FEISHU_WEBHOOK_URL` is configured.
- `/api/strategy/scan/schedule/start` starts an in-memory recurring scan-to-alert task.
- `/api/strategy/scan/schedule` returns the current in-memory schedule state and last run result.
- `/api/strategy/scan/schedule/stop` stops the recurring scan task.
- Scan and alert endpoints enforce current user entitlements. Free/VIP/SVIP limits affect symbol count, remaining quota, allowed timeframe, Feishu delivery, and minimum alert score.
- If `DATABASE_URL` is not configured or Postgres is unavailable, read APIs fall back to local mock data and strategy persistence returns `persisted: false`.
- Vite proxies `/api/*` from `http://localhost:3200` to the NestJS API on `http://localhost:3101`.
- Auth now supports `POST /api/auth/login` and signed Bearer tokens. API identity resolution prefers `Authorization: Bearer <token>` and falls back to the demo `X-Radar-User-Id` header for local account switching.
- `POST /api/auth/register` creates a Free member account. `POST /api/auth/change-password` requires a valid Bearer token.
- Auth endpoints use process-memory rate limiting in the MVP. Multi-instance production should move those counters to Redis.
- Admin user mutation endpoints reject non-admin Bearer tokens with `403`. Local demo calls without a Bearer token can still use the mock management flow.

## Strategy API

```text
GET  /strategy/health
POST /strategy/run
GET  /strategy/signals
GET  /strategy/state
GET  /strategy/backtest
```

## `POST /api/strategy/run`

Request:

```json
{
  "symbol": "BTCUSDT",
  "timeframe": "5m",
  "mtf_timeframe": "15m",
  "htf_timeframe": "1h",
  "candles": [],
  "mtf_candles": [],
  "htf_candles": [],
  "config": {}
}
```

## `POST /api/strategy/scan`

Request:

```json
{
  "symbols": ["BTCUSDT", "ETHUSDT", "XRPUSDT"],
  "timeframe": "5m"
}
```

## `POST /api/strategy/scan/alert`

Request:

```json
{
  "symbols": ["BTCUSDT"],
  "timeframe": "5m",
  "minScore": 60,
  "dryRun": false
}
```

## Scheduled Scan

Start:

```json
POST /api/strategy/scan/schedule/start
{
  "symbols": ["BTC", "ETH"],
  "timeframe": "5m",
  "intervalSeconds": 300,
  "minScore": 60,
  "dryRun": true,
  "runImmediately": true
}
```

Status:

```text
GET /api/strategy/scan/schedule
```

Stop:

```text
POST /api/strategy/scan/schedule/stop
```

The current scheduler is process-memory only. It is suitable for MVP validation and will be replaced by Redis/Postgres-backed scheduled tasks for production.

Response when `FEISHU_WEBHOOK_URL` is not configured:

```json
{
  "alert": {
    "dryRun": false,
    "minScore": 60,
    "candidates": [],
    "sent": 0,
    "skipped": 1,
    "deliveries": [
      {
        "skipped": true,
        "reason": "FEISHU_WEBHOOK_URL is not configured.",
        "payload": {
          "msg_type": "text",
          "content": {
            "text": "【AI 信号告警】BTC 利多..."
          }
        }
      }
    ]
  }
}
```

Response:

```json
{
  "startedAt": "2026-06-07T10:00:00.000Z",
  "finishedAt": "2026-06-07T10:00:03.000Z",
  "timeframe": "5m",
  "symbols": ["BTCUSDT", "ETHUSDT", "XRPUSDT"],
  "summary": {
    "scanned": 3,
    "succeeded": 3,
    "failed": 0,
    "signals": 3
  },
  "results": []
}
```

Response:

```json
{
  "result": {
    "symbol": "BTCUSDT",
    "timeframe": "5m",
    "bar_time": 1710005700000,
    "market_state": "trend_candidate",
    "signals": [
      {
        "type": "trend_long_signal_candidate",
        "title": "趋势买入候选",
        "engine": "trend",
        "side": "long",
        "price": 62620,
        "stop_price": 61911.87,
        "take_profit_price": 63753,
        "score_impact": 18
      }
    ],
    "metrics": {
      "adx": null,
      "atr_pct": 0.45,
      "rsi": 100,
      "slope_norm": null,
      "bb_width_pct": null
    }
  },
  "persistence": {
    "persisted": false,
    "count": 0
  }
}
```

## `POST /strategy/run`

The Python strategy service exposes the same strategy payload shape as `/api/strategy/run`, but returns only the raw strategy result. The NestJS endpoint is the product-facing gateway because it can persist signals, enforce quotas, and trigger alerts.

## `POST /api/claw/chat`

Request:

```json
{
  "message": "今天有哪些币可以买？",
  "userId": "u_1001"
}
```

Response:

```json
{
  "intent": "coin_recommendation",
  "blocks": [
    {
      "type": "summary",
      "title": "今日值得关注的币种",
      "time": "2026-01-20 12:23"
    },
    {
      "type": "group",
      "title": "AI 机会币",
      "items": []
    },
    {
      "type": "risk",
      "title": "风险提示",
      "items": []
    }
  ]
}
```
