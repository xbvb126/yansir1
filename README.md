# Coin Anomaly Radar

> 开发者接手请先阅读 [README 补充版](docs/README_SUPPLEMENT.md)；完整系统图、模块关系、数据流、数据库、环境变量、外部 API、定时任务和性能风险见 [技术架构文档](docs/ARCHITECTURE.md)。

AI-powered crypto anomaly monitoring product with mobile signal streams, ValueClaw chat analysis, Feishu alerts, user management, subscriptions, and an embedded strategy engine.

## Target Architecture

- `apps/web`: React + Vite mobile-first web app.
- `apps/api`: NestJS business API for users, billing, signals, Feishu, ValueClaw orchestration, and admin.
- `services/strategy`: Python FastAPI service for market data, indicator calculation, Pine strategy migration, anomaly scoring, and backtests.
- `infra`: database, Redis, queue, deployment, and environment configuration.
- `docs`: product, architecture, API, database, and migration notes.

The original static prototype remains at the repository root:

- `server.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`

It is kept as visual reference. The active web implementation is now `apps/web`.

## MVP Flow

```text
Market data collector
  -> Embedded EMD strategy engine
  -> Anomaly scoring
  -> Signal service
  -> Mobile web / ValueClaw / Feishu alerts
```

## Local Development

Create local environment secrets:

```text
npm run env:local
```

Start Postgres/Redis and apply schema:

```text
npm run db:up
npm run db:setup
```

Prototype:

```text
npm run prototype
```

Formal API:

```text
npm run build:api
npm run dev:api
```

Formal web:

```text
npm run dev:web
```

Strategy service:

```text
npm run dev:strategy
```

Smoke check:

```text
npm run smoke
```

The smoke check now covers health, auth, Feishu config, billing order creation, mock payment activation, billing authorization, team dashboard, payment providers, and web reachability.

Default ports:

- Prototype: `http://localhost:4173`
- API: `http://localhost:3101`
- Web: `http://localhost:3200`
- Strategy: `http://localhost:8000`

Local demo login:

- Admin: `13800008821` / `radar123`
- Member: `177****0198` / `radar123`

Important environment variables:

- `DATABASE_URL`: Postgres connection string. If unavailable, the API uses mock data.
- `AUTH_TOKEN_SECRET`: required for production Bearer token signing.
- `CORS_ORIGIN`: required in production so the API is not open to every origin.
- `BILLING_PROVIDER`: use `stripe`, `wechat`, or `alipay` for production; `mock` is local only.
- `BILLING_WEBHOOK_SECRET`: required before accepting payment webhooks in production.
- `STRIPE_SECRET_KEY`, `WECHAT_PAY_MCH_ID`, `WECHAT_PAY_API_KEY`, `ALIPAY_APP_ID`, `ALIPAY_PRIVATE_KEY`: configure the selected payment provider.
- `FEISHU_WEBHOOK_URL`: default Feishu robot webhook fallback.
- `STRATEGY_SERVICE_URL`: Python strategy service URL.

Commercial MVP endpoints:

- `GET /api/billing/plans`: membership plans.
- `GET /api/billing/providers`: payment provider readiness.
- `POST /api/billing/orders`: create a pending order for VIP/SVIP.
- `POST /api/billing/orders/:orderId/pay`: local mock payment activation.
- `POST /api/billing/webhook`: production payment webhook entry guarded by `BILLING_WEBHOOK_SECRET`.

## First Implementation Milestones

1. Initialize `apps/web` with React + Vite and migrate the existing mobile prototype.
2. Initialize `apps/api` with NestJS modules for auth, users, plans, signals, alerts, and ValueClaw.
3. Initialize `services/strategy` with FastAPI and implement indicator utilities.
4. Port the existing Pine strategy into the strategy service without changing the strategy rules.
5. Add Binance/OKX market data collectors for Klines, OI, Funding, and ticker data.
6. Persist signals, users, plans, billing orders, subscriptions, Feishu bindings, and usage quotas in Postgres.
7. Add Redis-backed queues for scans, alerts, scheduled ValueClaw tasks, and quota counting.
