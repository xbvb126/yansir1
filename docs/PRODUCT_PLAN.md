# Product Plan

## Product Positioning

The product is a crypto anomaly monitoring and AI analysis platform. It scans the market, generates transparent signal scores, explains signals through ValueClaw, and pushes alerts to Feishu.

## Main Navigation

- Data: market metrics, anomaly factors, price/OI/Funding summaries.
- ValueClaw: chat-style professional analysis for market interpretation, trend review, backtests, scheduled tasks, and personal assistant flows.
- AI Coin Selection: bullish anomalies, bullish opportunities, bearish risks, and custom monitors.
- Signals: real-time signal center and Feishu delivery.
- Account: users, plans, usage quotas, Feishu binding, team seats, and admin controls.

## Commercial Tiers

### Free

- Delayed signals
- 10 signals per day
- Basic anomaly score
- No Feishu alerts

### VIP

- Real-time signals
- 300 signals per day
- Feishu alerts
- 50 watchlist symbols
- Post-push performance tracking

### SVIP

- Full-market scan
- 2000 signals per day
- API subscription
- Team accounts
- Advanced funding/OI model
- Scheduled ValueClaw tasks
- Backtest analysis

## Strategy Requirement

Do not use TradingView Webhooks as a dependency. The previous Pine strategy should be migrated directly into the system as an embedded backend strategy engine. Strategy content must remain unchanged; only the implementation language changes.
