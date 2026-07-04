# Yansir Internal K-Line Lab Design

## Goal

Build an online-only hidden internal page for reviewing strategy signals with candlestick evidence. The page is for the owner/admin only. It must not appear in the normal product navigation and must not change the existing strategy signal source, ranking, alerting, or public radar behavior.

The page answers one question: after the Yansir strategy engine emits or waits on a signal, does the recent K-line structure confirm, weaken, or invalidate that signal?

## Non-Goals

- Do not replace the current Yansir strategy engine.
- Do not create a new public-facing signal source.
- Do not expose this page in the bottom navigation, radar tabs, account page, or marketing UI.
- Do not let AI generate trade signals. AI can explain evidence, but the strategy engine remains the signal source.
- Do not rely on a secret URL alone for access control.

## Access Model

The page is reachable online through a hidden route:

`/yansir/?view=kline-lab&symbol=BTC&tf=5m`

Access requirements:

- User must be signed in.
- User role must be `admin`.
- Non-admin users are redirected to the existing account/login access flow with a no-permission message.
- The view is accepted by URL routing but excluded from `BottomNav`.

Implementation should reuse the existing front-end access pattern from `routeAccessPrompt`. `kline-lab` should be treated like an admin-only route, not a public route.

## Product Shape

Page title: `K线验信室`

Primary layout:

- Header with symbol selector, timeframe selector, refresh action, and last updated time.
- Main K-line panel for the selected symbol and timeframe.
- Evidence panel summarizing whether the signal is confirmed, waiting, warning, or invalid.
- Multi-timeframe confirmation panel for `5m`, `15m`, `1h`, and `4h`.
- Recent strategy signal panel showing the latest matching strategy event for the symbol.

The page should feel like an internal trading workbench: dense, clear, and evidence-first.

## Signal Principles

The current strategy signal remains the priority:

1. Strategy engine decides whether there is a real signal.
2. K-line lab reviews whether recent candles support that signal.
3. Market movement and OI data may be shown as context.
4. AI explanation may summarize the evidence but cannot upgrade a non-signal into a signal.

The page should label items clearly:

- `命中策略`: real signal from the strategy engine.
- `等待策略信号`: included in scan scope but no strategy signal yet.
- `K线确认`: candle evidence supports the strategy direction.
- `等待下一根`: current structure is incomplete.
- `预警`: signal exists but candle quality is weak.
- `失效`: price action contradicts the strategy direction.

## K-Line Confirmation Model

The K-line lab should inspect the latest 3 to 5 candles rather than depending only on two candles.

Inputs:

- OHLC candles from `/api/market/klines`.
- Latest strategy signals from strategy inbox/public signals or scan results.
- EMD trend band values from the strategy calculation if exposed by API, or a front-end derived approximation only for visualization.
- ATR, RSI, ADX, and multi-timeframe direction when available.

Initial confirmation checks:

- Close stability: closes remain above/below the EMD band in the signal direction.
- Candle body quality: candle bodies are meaningful relative to total range.
- Wick risk: long opposite wicks reduce confidence.
- Pullback behavior: breakout followed by a pullback that does not break the band improves confidence.
- ATR distance: too close suggests noise; too far suggests chasing.
- Multi-timeframe agreement: higher timeframe direction supports or conflicts with the signal.

Output states:

- `confirmed`: structure supports the strategy direction.
- `watch-next`: current candle structure is incomplete; wait for the next close.
- `warning`: signal exists but evidence is weak or chase risk is high.
- `invalidated`: price has moved back through the confirmation area or formed opposite evidence.
- `no-signal`: no current strategy signal exists for this symbol/timeframe.

## Data Flow

1. User opens the hidden route with `symbol` and `tf`.
2. Front end verifies route access through the current user state.
3. Front end fetches:
   - latest ticker/market row for the symbol,
   - recent candles for selected timeframe,
   - latest strategy signals for the symbol,
   - optional candles for comparison timeframes.
4. A local confirmation helper converts candles plus signal direction into an evidence summary.
5. UI renders K-line chart, signal marker, evidence cards, and decision state.

If API support is insufficient for full EMD band visualization, version one should still ship with OHLC candles, signal marker, ATR/RSI evidence when available, and a clear note that the band overlay is pending backend metric exposure.

## Components

Recommended front-end units:

- `KlineLabView`: route-level page and access-aware container.
- `KlineChartPanel`: renders candles, signal marker, and trend overlays.
- `KlineEvidencePanel`: renders confirmation state and evidence list.
- `MultiTimeframeCheck`: summarizes 5m/15m/1h/4h agreement.
- `RecentStrategySignalPanel`: shows the latest strategy signal details.
- `klineConfirmation.ts`: pure helper for candle confirmation classification.

The confirmation helper should be unit-tested independently from the UI.

## Error Handling

- Missing symbol: default to `BTC`.
- Unsupported timeframe: default to `5m`.
- Candle fetch failure: show an internal error state but keep controls usable.
- No strategy signal: show `暂无策略命中`; do not fabricate a signal from candles.
- Non-admin user: show existing route access prompt.
- Empty candle data: show `暂无K线数据`.

## Testing

Required checks:

- Route normalization accepts `kline-lab`.
- Bottom navigation does not include `kline-lab`.
- Non-admin users cannot access the page.
- Admin users can access the page through direct URL.
- Confirmation helper returns expected states for confirmed, warning, watch-next, invalidated, and no-signal cases.
- Browser smoke test verifies the hidden route renders without layout overlap on mobile width.

## Rollout

Phase 1:

- Add hidden admin-only view.
- Fetch candles and recent strategy signals.
- Render internal K-line workbench with basic confirmation states.

Phase 2:

- Add EMD band overlay from backend metrics.
- Add richer multi-timeframe evidence.
- Add direct entry button from internal admin tools only, not public product pages.

Phase 3:

- Add saved review notes and signal outcome tagging for owner analysis.

## Self-Review

- Scope is limited to an internal hidden admin page.
- Access is role-based, not URL secrecy.
- The strategy engine remains the only real signal source.
- The K-line layer is an evidence and review layer only.
- UI, data flow, error handling, and tests have concrete acceptance criteria.
