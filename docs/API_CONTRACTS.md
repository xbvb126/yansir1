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
GET  /api/strategy/scan/global/status
GET  /api/strategy/formal/status
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
- `/api/me`, `/api/admin/users`, `/api/billing/plans`, and `/api/signals` read through repository classes. The unauthenticated `/api/signals` view is restricted to the same delayed 5m/7-day formal ledger window as Guest/Free proof access.
- `/api/billing/webhook` accepts subscription events from a payment provider and updates user plan, status, expiry, quota, and audit logs. If `BILLING_WEBHOOK_SECRET` is configured, callers must send `x-billing-webhook-secret`.
- `/api/market/ticker` and `/api/market/klines` read Binance USDⓈ-M Futures data when available and fall back to fixture data during local/offline development.
- `/api/strategy/run` calls the Python strategy service for an authorized diagnostic/API calculation. Its request, fixture, or possibly open-candle result is provisional and never writes the formal ledger.
- If `/api/strategy/run` receives no `candles`, the API fetches K lines first and then sends the enriched payload to the strategy service.
- `/api/strategy/scan` runs the same strategy over a batch of symbols. It is the manual trigger that will later become a scheduled scan job.
- `/api/strategy/scan/latest` returns the last in-memory scan snapshot for local UI integration.
- `/api/strategy/scan/alert` scans symbols, filters candidates by score, and sends Feishu alerts when `FEISHU_WEBHOOK_URL` is configured.
- `/api/strategy/scan/schedule/start` starts an in-memory recurring scan-to-alert task.
- `/api/strategy/scan/schedule` returns the current in-memory schedule state and last run result.
- `/api/strategy/scan/schedule/stop` stops the recurring scan task.
- `/api/strategy/scan/global/status` reports the automatic system-level global scanner. It is UTC-aligned and runs 5 seconds after each closed-candle boundary; it is not controlled by the user schedule start/stop endpoints.
- Formal signals are emitted only from a confirmed, closed K-line. A still-forming candle is never evaluated or published as a formal signal.
- Formal signal persistence is a strict boundary: only the shared close-confirmed executor writes `is_formal = true` events with an immutable `strategy_version`, bar-open identity, and confirmed-close emission time. Existing ambiguous legacy events remain quarantined as non-formal.
- Strict inbox matching runs in a bounded post-persistence queue. A close evaluation becomes `succeeded` only after matching completes; initial Feishu delivery runs in a separate bounded queue and cannot hold the formal calculation worker.
- The close-event reconciler runs every 15 minutes to fill missed close jobs. Reconciled events always create eligible inbox records, but Feishu push is skipped when the close is more than five minutes old.
- Mock database mode is degraded, non-delivering local behavior. It is never formal-signal ready and must not be treated as a production signal source.
- Scan and alert endpoints enforce current user entitlements. Free/VIP/SVIP limits affect symbol count, remaining quota, allowed timeframe, Feishu delivery, and minimum alert score.
- If `DATABASE_URL` is not configured or Postgres is unavailable, read APIs fall back to local mock data and strategy persistence returns `persisted: false`.
- Vite proxies `/api/*` from `http://localhost:3200` to the NestJS API on `http://localhost:3101`.
- Auth now supports `POST /api/auth/login` and signed Bearer tokens. API identity resolution prefers `Authorization: Bearer <token>` and falls back to the demo `X-Radar-User-Id` header for local account switching.
- `POST /api/auth/register` creates a Free member account. `POST /api/auth/change-password` requires a valid Bearer token.
- Auth endpoints use process-memory rate limiting in the MVP. Multi-instance production should move those counters to Redis.
- Admin user mutation endpoints reject non-admin Bearer tokens with `403`. Local demo calls without a Bearer token can still use the mock management flow.

## `GET /api/strategy/formal/status`

Returns the production-readiness diagnostics for the close-confirmed formal-signal pipeline. It contains no credentials, webhook addresses, or user delivery targets.

```json
{
  "ready": true,
  "reason": null,
  "realtime": {
    "enabled": true,
    "connected": true,
    "lastClosedEventAt": "2026-07-23T04:00:00.000Z"
  },
  "queue": {
    "capacity": 10000,
    "depth": 0,
    "oldestActiveAt": null,
    "oldestInFlightAt": null,
    "latestPressureAt": null,
    "pressureActive": false,
    "latencyMs": { "p95": 1200 }
  },
  "reconciliation": { "enabled": true, "intervalSeconds": 900 },
  "latestCalculationAt": "2026-07-23T04:00:01.000Z",
  "latestPersistenceAt": "2026-07-23T04:00:01.200Z",
  "recent": { "succeeded": 42, "failed": 0, "timedOut": 0, "reconciled": 3 },
  "deliveryRetry": { "enabled": true, "intervalSeconds": 60 }
}
```

`ready` is false when Postgres is unavailable or mock mode is active, realtime tracking is disabled or has no open socket, reconciliation or delivery retry is stopped or reports an error, calculation/matching/delivery work exceeds the 60-second in-flight age target, any of those queues has current or recent admission pressure, matching has a newer failure than success, or the most recent persistence failure is newer than the most recent persistence success. `pressureRejected` is cumulative telemetry; `pressureActive` clears 60 seconds after the last rejection once capacity has recovered. `reason` is the first active machine-readable blocker.

`GET /api/health` remains a liveness endpoint and includes this object as `formalSignals`; `GET /api/health/readiness` also treats a non-ready formal pipeline as a launch blocker.

## Formal signal subscription matrix

| Plan | Formal availability | Watchlist symbols | Timeframes | History | Feishu push | Daily signal/API quota |
| --- | --- | ---: | --- | --- | --- | --- |
| Free | 8-hour delay | 5 | 5m | 7 days | No | No API |
| VIP | Realtime | 50 | 5m, 15m | 30 days | Yes | 300/day |
| SVIP | Realtime | 200 | 5m, 15m, 30m, 1h, 4h | 180 days | Yes | 2,000/day + API |

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

## `GET /api/strategy/scan/global/status`

This read-only endpoint reports the automatic system-level global market scanner. The scanner schedules one-shot runs aligned to UTC closed-candle boundaries, with a five-second delay after every close. It is independent of `POST /api/strategy/scan/schedule/start` and `POST /api/strategy/scan/schedule/stop`, which control only the user-configured recurring scan.

Response:

```json
{
  "scanner": {
    "enabled": true,
    "running": false,
    "lastSlotAt": "2026-07-21T14:05:00.000Z",
    "lastStartedAt": "2026-07-21T14:05:05.000Z",
    "lastFinishedAt": "2026-07-21T14:05:06.000Z",
    "nextRunAt": "2026-07-21T14:10:05.000Z",
    "lastTimeframes": ["5m"],
    "scannedSymbols": 120,
    "matchedSignals": 3,
    "failedSymbols": 1,
    "skippedOverlappingRuns": 0,
    "errors": []
  }
}
```

`GlobalScanStatus` fields are `enabled`, `running`, `lastSlotAt`, `lastStartedAt`, `lastFinishedAt`, `nextRunAt`, `lastTimeframes`, `scannedSymbols`, `matchedSignals`, `failedSymbols`, `skippedOverlappingRuns`, and `errors`.

### `POST /api/strategy/scan/alert` response when `FEISHU_WEBHOOK_URL` is not configured

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
