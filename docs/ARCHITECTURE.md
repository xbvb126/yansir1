# Architecture

## Services

```text
apps/web
  React + Vite mobile-first web app for Data, ValueClaw, AI coin selection, Signals, and Account.

apps/api
  NestJS business API. Owns user identity, billing, permissions, signal records,
  Feishu delivery, ValueClaw orchestration, admin, and public API access.

services/strategy
  Python FastAPI strategy and market-data service. Owns Kline ingestion, indicator
  calculation, EMD strategy migration, anomaly scoring, and backtesting.

Postgres
  Durable business and signal storage.

Redis
  Caching, queues, distributed locks, rate limits, quota counters, and signal dedupe.
```

## Runtime Flow

```text
Scheduled scan
  -> strategy service fetches Klines/OI/Funding
  -> strategy service runs embedded EMD engine candle by candle
  -> strategy service returns strategy signals and metrics
  -> api service calculates user visibility and stores signal events
  -> api service sends Feishu alerts for eligible users
  -> web app reads signal stream and signal history
```

## ValueClaw Flow

```text
User question
  -> apps/api /claw/chat
  -> intent detection
  -> calls signals, market, strategy, backtest, schedule, or account tools
  -> optional LLM summary using verified structured data
  -> returns structured chat blocks
```

AI should summarize and explain. It should not invent market facts or directly decide trades without data-backed signals.

## Why This Split

- NestJS is the business system: users, subscriptions, plans, payments, admin, permissions, Feishu, and public APIs.
- Python FastAPI is the quant system: indicators, strategy replay, scoring, backtests, and market data.
- React + Vite is the product surface: fast mobile H5, account pages, signal streams, and ValueClaw chat.
