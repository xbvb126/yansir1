# Yansir Crypto Realtime Radar Design

Date: 2026-07-04

## Summary

Yansir Crypto is the first product focus. It should be a crypto realtime signal radar, not a generic AI coin assistant. The product's primary value is the existing strategy signal engine: market data flows into strategy scans, strategy scans produce signal events, and the UI makes those events fast to discover, understand, track, and push.

AI reports, ValueClaw, DSA-style report structure, daily reviews, and team distribution are enhancements. They must explain, package, and distribute existing strategy signals. They must not replace the strategy engine or create independent buy/sell facts.

## Product Positioning

Yansir Crypto serves three user groups in one product:

- Short-term traders need realtime anomaly discovery, 5m/15m strategy signals, and push alerts.
- Swing or holding users need 1h/4h/1d context, risk explanation, and signal history.
- Team or community operators need member permissions, signal distribution, plans, and delivery controls.

The first screen and first release should target short-term traders through a realtime radar. Swing research and team distribution should build on the same signal foundation after the radar loop is reliable.

## Core Product Rule

Strategy signals are the source of truth.

This rule has product and technical consequences:

- `signal_events` can only be written by strategy scan paths or the strategy service.
- AI cannot create a new signal event.
- AI cannot override signal direction, score, timeframe, price, or trigger time.
- Push alerts are triggered by strategy signal events, not AI-generated text.
- Radar ranking prioritizes strategy signal facts and anomaly scores.
- ValueClaw and reports can explain a signal, summarize evidence, list risks, and create checklists, but they cannot invent trade facts.

The product should feel like a strategy signal system with AI explanation, not an AI chatbot with charts.

## Product Flow

The main user loop is:

```text
strategy signal triggers
  -> radar detects and ranks it
  -> user opens the signal
  -> user sees why it triggered
  -> user adds the symbol to watchlist
  -> user enables push alerts
  -> system tracks later performance
  -> user upgrades for realtime, more symbols, more timeframes, and more history
```

This loop should stay visible in the UI and API design.

## Page Structure

### Radar

Radar is the default home page. It is the realtime strategy signal console.

The first screen should show:

- Strategy listening status: online, degraded, or error.
- Monitored market count.
- Latest scan or realtime K-line event time.
- Next scan countdown or realtime listener state.
- Latest strategy signals sorted by score and recency.
- Opportunity, risk, and watch groups.
- Highlighted matches from the user's watchlist.

Radar cards must show strategy facts first:

```text
symbol + timeframe + direction
trigger price + trigger time
strategy name + signal type
score + risk level
strategy reason
performance entry point
AI explanation entry point
```

AI summaries should appear below the strategy facts or in the detail view. They should never hide the signal source, direction, timeframe, or score.

### Data

Data remains the full market view. Its job is candidate discovery:

- all-market ticker list
- price, change, volume, source, and trend mini chart
- anomaly score
- watchlist tab
- entry into symbol detail

Data can surface anomaly candidates even when no strategy signal has fired, but those candidates should be clearly labeled as market anomalies rather than strategy signals.

### Signal

Signal is the user's inbox and history:

- unread and read signal events
- watchlist matches
- push delivery state
- signal performance tracking
- entitlement-limited history

Free, VIP, and SVIP plans can differ by realtime delay, allowed timeframes, watchlist count, push count, history depth, and performance visibility.

### ValueClaw

ValueClaw should primarily explain existing signal and market context.

Good questions:

- Why did BTC trigger this signal?
- What is the risk in this ETH signal?
- Which watchlist symbol has the strongest current strategy evidence?
- How did similar recent signals perform?

ValueClaw responses must cite available market data, strategy signals, and performance data. If context is missing, it should say what data is missing and suggest waiting for the next scan or opening the symbol detail page.

### Account

Account owns:

- plan status
- push settings
- watchlist capacity
- team and distribution controls
- API access
- billing

Commercial packaging should map directly to signal value: more realtime access, more symbols, more timeframes, more history, more push delivery, and more performance data.

## Backend Architecture

Keep the existing service split:

```text
apps/web
  React + Vite product UI

apps/api
  NestJS business gateway: users, plans, signals, watchlists, push, ValueClaw

services/strategy
  Python FastAPI strategy service: indicators, strategy replay, signal output

Postgres
  durable users, plans, watchlists, signal events, inbox, performance
```

The first architectural addition should be an AI explanation/report layer that depends on existing facts. It can live in `apps/api` initially as a module that calls an OpenAI-compatible LLM, or later be split into a separate analysis service if it becomes large.

## Data Model Boundaries

Existing signal tables remain primary:

- `strategy_runs`: each strategy execution and its metrics.
- `signals`: reusable signal definitions.
- `signal_events`: each real trigger event. This is the most important table.
- `user_signal_inbox`: user-specific signal visibility.
- `watchlists`: user symbol and timeframe preferences.
- `signal_performance`: post-trigger performance measurements.

AI explanation should use a separate table, such as `signal_explanations` or `analysis_reports`.

Suggested explanation fields:

```text
id
signal_event_id
symbol
timeframe
stance
summary
evidence_json
risks_json
action_checklist_json
raw_markdown
model
created_at
```

The explanation table should reference `signal_event_id` when explaining a triggered signal. Market-wide reports may omit `signal_event_id`, but they still cannot write signal facts.

## API Boundaries

Strategy signal path:

```text
POST /api/strategy/run
POST /api/strategy/scan
GET  /api/strategy/scan/latest
GET  /api/strategy/signals/inbox
GET  /api/signals/:id/performance
```

Radar and market path:

```text
GET /api/market/overview
GET /api/signals
GET /api/strategy/public-signals
GET /api/strategy/watchlist
PUT /api/strategy/watchlist
```

AI explanation path:

```text
POST /api/signal-explanations/:signalEventId
GET  /api/signal-explanations/:signalEventId
POST /api/claw/chat
```

These APIs should preserve the boundary that strategy creates facts and AI explains facts.

## DSA-Inspired Capabilities To Reuse

Reuse ideas from daily_stock_analysis selectively:

- LLM provider configuration and fallback.
- Structured report sections: conclusion, evidence, risks, catalysts, checklist.
- Notification dedupe and cooldown.
- Daily or weekly review for swing users and teams.
- Deployment and configuration documentation patterns.

Do not import DSA's stock-specific model directly:

- trading day calendars
- stock code parsing
- equity fundamentals
- A/H/US market review assumptions
- stock-style buy/sell wording

Crypto has a 24/7 market model and should use crypto-native evidence such as volatility, volume, funding, open interest, strategy state, and post-signal performance.

## MVP Scope

The MVP is a strategy-signal-first realtime radar.

Must include:

- Radar home page focused on strategy signal events.
- Strategy signal cards with direction, timeframe, price, score, time, type, and reason.
- Symbol detail with latest signal, recent history, and performance entry.
- Watchlist management.
- Signal inbox.
- Push alerts based on strategy signal events.
- Plan limits for symbols, timeframes, delay, history, push, and performance.

Not in MVP:

- AI-generated independent coin recommendations.
- A stock product inside Yansir.
- Chain-wide on-chain analytics.
- Complex team admin as the primary surface.
- Daily reports as the home page.

AI in MVP should be limited to explaining an existing signal and creating a risk/checklist summary.

## Testing Strategy

Test priority follows the signal chain.

- Strategy fixture tests: fixed candles and config produce deterministic signals.
- Strategy API contract tests: `/api/strategy/run`, `/scan`, `/inbox`, and performance APIs.
- Signal persistence tests: duplicate `dedupe_key` does not create duplicate events.
- Permission tests: Free/VIP/SVIP plan differences for symbols, timeframes, history, push, and performance.
- Push tests: cooldown, dedupe, failures, retries, and plan limits.
- AI explanation tests: explanation requires existing data for signal claims and cannot create signal events.
- Frontend tests: Radar card field order, opportunity/risk grouping, Signal Inbox filters, entitlement gates.

## Operational Risks

- Exchange API instability: keep fixture or degraded fallback, but label degraded data clearly in UI.
- WebSocket reliability: keep polling scan fallback.
- AI overconfidence: require structured schema, data citations, and no independent signal generation.
- Scope creep: keep chain data, stock product, team admin, and daily reports behind the signal radar milestone.
- Encoding quality: current UI text contains mojibake in places. Before a public launch, all user-facing Chinese copy should be normalized to UTF-8 and reviewed.

## Acceptance Criteria

The first release is successful when a user opens the home page and understands within three seconds:

1. Whether the strategy listener is online.
2. Which symbols have current strategy signals.
3. Which signals are opportunities, risks, or watch items.
4. Why a signal triggered.
5. How to add the symbol to watchlist and enable push alerts.

The release should be judged by signal clarity, trust, and actionability, not by how much AI text it generates.

