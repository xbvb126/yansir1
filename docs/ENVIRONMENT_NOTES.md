# Environment Notes

## 2026-06-07

### Node Workspaces

`npm.cmd install` completed after the first attempt timed out.

### API Build

`apps/api` builds successfully with:

```text
npm.cmd --workspace @radar/api run build
```

The build script uses `tsc` directly instead of `nest build` to avoid a local Nest CLI transitive dependency issue around `node-emoji` and `lodash`.

### Web Build

The project was switched from Next.js to React + Vite after `next build` failed locally because the Windows SWC binary package reported:

```text
@next/swc-win32-x64-msvc ... is not a valid Win32 application
```

This is an environment/dependency binary issue, not a React code issue. React + Vite is sufficient for the mobile H5 product and now builds successfully.

The current root prototype remains available and verified at `http://localhost:4173`.

### API Port

The formal NestJS API defaults to port `3101` to avoid conflicts with other local services that may already use `3001`.

### Frontend/API Integration

The Vite web app proxies `/api` requests to `http://localhost:3101` in development. Verified endpoints:

```text
GET http://localhost:3101/api/market/overview
GET http://localhost:3101/api/signals
GET http://localhost:3200/api/signals
```

All returned `200` during integration validation.

### Strategy Service

The strategy service runs from a workspace-local virtual environment:

```text
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r services/strategy/requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API default `STRATEGY_SERVICE_URL` is `http://127.0.0.1:8000`. This avoids Node resolving `localhost` to IPv6 `::1` while uvicorn is listening on IPv4 only.

Verified endpoints:

```text
GET  http://127.0.0.1:8000/strategy/health
POST http://localhost:3101/api/strategy/run
POST http://localhost:3200/api/strategy/run
```

The strategy gateway returned a BTC fixture signal with `persisted: false` in mock database mode.

### Market Data

Market data endpoints are available through the API:

```text
GET http://localhost:3101/api/market/ticker?symbol=BTCUSDT
GET http://localhost:3101/api/market/klines?symbol=BTCUSDT&timeframe=5m&limit=5
```

Binance Futures is the primary source. If the external request fails in local development, the API returns BTCUSDT fixture data with `source: fixture`.

Verified strategy auto-enrichment:

```text
POST http://localhost:3101/api/strategy/run
Body: {"symbol":"BTCUSDT","timeframe":"5m"}
```

The API fetched fixture candles and then called the Python strategy service successfully.

### Signal Scan

Manual batch scanning is available:

```text
POST http://localhost:3101/api/strategy/scan
Body: {"symbols":["BTC","ETH"],"timeframe":"5m"}

GET http://localhost:3101/api/strategy/scan/latest
```

Verified locally:

- 2 symbols scanned.
- 2 strategy runs succeeded.
- 2 candidate signals returned.
- Both used `source: fixture` because external Binance access is unavailable in the current local environment.

### Feishu Alerts

Scan-to-alert is available:

```text
POST http://localhost:3101/api/strategy/scan/alert
Body: {"symbols":["BTC"],"timeframe":"5m","minScore":60,"dryRun":false}
```

Verified locally:

- Candidate filtering works.
- With no `FEISHU_WEBHOOK_URL`, delivery returns `skipped: true`.
- The response includes the Feishu text webhook payload that would be sent in production.

### Commercial Entitlements

Current user permissions are available:

```text
GET http://localhost:3101/api/me/entitlements
```

Verified locally:

- Mock current user is `SVIP`.
- Remaining signal quota is calculated from `signalQuota - signalUsed`.
- Scan responses include a `permission` block.
- Scan-to-alert enforces the user's minimum alert score and Feishu capability.

### Frontend Commercial UI

The Vite frontend now reads commercial state from:

```text
GET  http://localhost:3200/api/me
GET  http://localhost:3200/api/me/entitlements
GET  http://localhost:3200/api/billing/plans
GET  http://localhost:3200/api/strategy/scan/latest
POST http://localhost:3200/api/strategy/scan/alert
```

Verified through the Vite proxy. Browser screenshot automation was not run because Playwright is not installed in the current local environment.

### Scheduled Scan

In-memory scheduled scan endpoints are available:

```text
POST http://localhost:3101/api/strategy/scan/schedule/start
GET  http://localhost:3101/api/strategy/scan/schedule
POST http://localhost:3101/api/strategy/scan/schedule/stop
```

Verified locally:

- Starting a schedule with `runImmediately: true` triggers the first scan.
- The schedule status reports `enabled`, `intervalSeconds`, `lastRunAt`, `nextRunAt`, `runCount`, `lastResult`, and `timerActive`.
- The test schedule was stopped after validation to avoid leaving the background timer running.
- The web signal page reads schedule state and exposes start/stop controls.
- Stop state was verified after the scheduler race fix: `enabled: false`, `timerActive: false`, and `nextRunAt: null`.
