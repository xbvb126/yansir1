# Yansir Pine V6 Strategy Source Design

Date: 2026-07-05

## Summary

The attached Pine V6 strategy, "EMD趋势 - 三周期PRO V6 完整仓位管理版", becomes the source of truth for Yansir Crypto strategy signals.

All product surfaces that show strategy signals must read from one backend strategy output path:

```text
market candles -> services/strategy Pine V6 port -> apps/api signal persistence -> web radar / signal inbox / hidden K-line lab / alerts
```

The hidden K-line lab should display and inspect this strategy output. It should not create a separate frontend signal standard.

## Product Rule

Existing strategy signals remain the highest-priority product asset. This change strengthens that rule:

- The Pine V6 strategy logic is the canonical signal standard.
- K-line visual checks cannot upgrade a non-signal into a strategy signal.
- Market movement rows remain market context, not strategy signals.
- AI and ValueClaw can explain strategy evidence, but cannot override signal direction, type, price, score, or trigger time.
- Radar, Signal Inbox, push alerts, and K-line lab must show the same strategy event facts for the same symbol and timeframe.

## Source Strategy Scope

The Pine strategy includes more than initial long and short entries. The backend port must preserve these signal families:

- `trend_long_signal`: 趋势买入
- `trend_short_signal`: 趋势开空
- `resume_long`: 趋势回踩加仓买入
- `resume_short`: 趋势反抽加仓开空
- `break_retest_long_add`: 突破回踩加仓买入
- `break_retest_short_add`: 跌破反抽加仓开空
- `reversal_long_signal`: 支撑反转买入
- `reversal_short_signal`: 压力反转开空
- `weak_reduce_long_signal`: 趋势转弱减多仓
- `weak_reduce_short_signal`: 趋势转弱减空仓

Support and resistance events, market state, trend bands, risk status, current engine, and position state should be exposed as diagnostics. They should not be treated as trade-entry signals unless the Pine strategy emits one of the signal families above.

## Backend Design

### Strategy Service

`services/strategy` owns the Pine V6 port. The current `emd_trend.py` migration shell should be replaced by a faithful candle-by-candle engine.

Required units:

- Indicator helpers: RMA, EMA, ATR, RSI, DMI/ADX, Bollinger width, pivot high/low.
- Multi-timeframe adapter: implements the current Pine `request.security` behavior using `candles`, `mtf_candles`, and `htf_candles`.
- Strategy state emulator: tracks `strategy.position_size`, average price, open trade count, closed trade outcomes, loss cooldown, consecutive losses, daily loss guard, per-layer entry prices/ATR, peak position size, and weak-reduce state.
- Signal mapper: converts Pine signal booleans and order actions into `StrategySignal` records.
- Diagnostics mapper: returns strategy bands, market state, risk state, current engine, support/resistance zones, current R, and remaining position percentage.

The emulator is necessary because add, reduce, cooldown, and daily loss logic depend on prior position state. A stateless "look at the latest candles only" implementation would diverge from Pine.

### API Gateway

`apps/api` continues to call the strategy service through `StrategyClient`.

Changes should keep the existing signal pipeline:

```text
runStrategy()
  -> withMarketData()
  -> strategyClient.runStrategy()
  -> signalsService.saveStrategySignals()
  -> inbox/watchlist/alert matching
```

API changes should be additive:

- Preserve existing `StrategyRunResult.signals`.
- Add optional signal fields such as `action`, `reduce_pct`, `stop_price`, and `take_profit_price` when the strategy emits them.
- Add optional `diagnostics` to expose Pine state to the hidden K-line lab.
- Continue deduping by symbol, timeframe, bar time, signal type, and side/action.

Reduce signals should be clearly represented as reduce actions, not mistaken for fresh opposite-direction entries.

### Realtime Scan Behavior

Realtime strategy scans should remain close-confirmed by default:

- Binance closed K-line event triggers a strategy run.
- The strategy service evaluates confirmed candles.
- Only emitted Pine strategy events become persisted signal events.

This matches the Pine default `confirmed_only = true` and avoids intrabar signal drift.

## Hidden K-Line Lab Design

The hidden page stays admin-only:

```text
/yansir/?view=kline-lab&symbol=BTC&tf=5m
```

Its role changes from "frontend confirmation layer" to "internal strategy instrument panel".

The page should show:

- Live candles and current price.
- Pine EMD trend line and upper/lower trend bands from backend diagnostics.
- Signal markers for the exact strategy events emitted by the backend.
- Support/resistance zones and touch/break/retest status.
- Market state: 趋势市场, 震荡市场, 混沌禁开, or 过渡观察.
- Risk state: 允许交易, 冷却中, 连续亏损禁开, 单日止损, 禁止开仓.
- Current engine: 无, 趋势, 趋势回踩加仓, 突破回踩加仓, 反转.
- Position state: 空仓, 多单, 空单, current R, remaining position percentage.
- Latest signal event and the precise reason it fired.

The existing two-candle frontend confirmation helper should be demoted or removed from signal judgment. It may survive only as a visual "candle quality" note, clearly separate from the strategy signal.

## Frontend Radar And Signal Inbox

Radar and Signal Inbox continue to consume persisted signal events.

UI labels should distinguish strategy action types:

- 做多 / 做空 for initial or reversal entries.
- 加多 / 加空 for add signals.
- 减多 / 减空 for weak-reduce signals.
- 观察 for symbols scanned with no strategy signal, if shown.

Market movement remains a separate source with separate UI treatment.

## Error Handling

- If strategy service is unavailable, API should report strategy degraded instead of creating fallback signals.
- If diagnostics are missing, K-line lab should still show candles and persisted signal events.
- If MTF or HTF candles are unavailable, the strategy result should expose a blocked/insufficient-data state instead of guessing.
- If a symbol has no strategy event, UI should say no strategy signal has fired.
- Non-admin users must not access the hidden K-line lab even if they know the URL.

## Testing Strategy

Testing must start from the strategy service.

Required test layers:

- Indicator parity tests for RMA, EMA, ATR, RSI, DMI/ADX, Bollinger width, and pivot logic.
- Strategy fixture tests for no-signal, trend long, trend short, reversal, add, and weak-reduce cases.
- Stateful replay tests proving add/reduce/cooldown behavior depends on prior simulated position state.
- API contract tests proving new optional fields and diagnostics are mapped without breaking existing consumers.
- Signal persistence tests proving dedupe still prevents duplicate events for the same bar.
- Frontend tests proving K-line lab reads backend strategy output and does not fabricate signals.
- Radar tests proving reduce/add labels are not displayed as ordinary fresh entries.

Where possible, fixtures should be generated from the Pine script behavior and kept deterministic.

## Migration Plan

Phase 1: Design and tests

- Capture this spec.
- Write implementation plan.
- Add failing Python tests for indicators, signal mapping, and selected strategy fixtures.

Phase 2: Pine parity core

- Build the candle-by-candle engine and strategy state emulator.
- Implement trend, market state, support/resistance, reversal, add, reduce, and risk guards.
- Return signals and diagnostics from the strategy service.

Phase 3: API integration

- Extend strategy client types.
- Preserve signal persistence and alert behavior.
- Add diagnostics passthrough for admin-only K-line lab.

Phase 4: K-line lab integration

- Render backend bands, signals, engine state, and risk state.
- Remove frontend-only signal judgment from the main decision area.
- Keep live candle updates and fast timeframe switching.

Phase 5: Verification

- Run strategy service tests.
- Run API strategy and persistence tests.
- Run web K-line lab and radar tests.
- Build API and web.

## Acceptance Criteria

This change is successful when:

1. The backend strategy service emits only signals derived from the Pine V6 strategy.
2. Radar, Signal Inbox, alerts, and hidden K-line lab show the same signal facts.
3. Add, reduce, reversal, and risk-blocked states are distinguishable from fresh long/short entries.
4. K-line lab no longer presents the frontend candle helper as an independent signal source.
5. Missing data or degraded strategy service never creates fallback trade signals.
6. Tests cover indicator parity, stateful strategy replay, API mapping, and frontend display rules.

## Self-Review

- No placeholder requirements remain.
- The design keeps the existing strategy-first product rule.
- The design explains why stateful Pine emulation is required.
- The design separates strategy signals from market movement and AI explanation.
- The design keeps the hidden K-line lab admin-only.
- The design has concrete testing and acceptance criteria.
