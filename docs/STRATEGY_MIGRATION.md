# Pine Strategy Migration Plan

## Rule

Do not change the strategy content. The migration only translates the implementation from Pine Script into the backend strategy engine.

## Source Strategy Scope

The embedded strategy must preserve:

- EMD/SMMA trend logic
- Current, MTF, and HTF trend direction
- ADX, ATR, RSI, Bollinger Band width
- Trend/range/chaos market state
- Support/resistance zones and touch strength
- Breakout, retest, breakdown, pullback confirmation
- Trend long/short signals
- Reversal long/short signals
- Trend weakness reduce signals
- Cooldown, consecutive loss, and daily loss protections
- Stop loss, take profit, trailing stop, breakeven, and scaled exits

## Implementation Requirement

Pine stateful variables must be reproduced by processing candles in order:

```text
for candle in candles:
  update rolling indicators
  update trend direction state
  update support/resistance state
  update risk state
  evaluate signal conditions
  update simulated position state
  emit signal events
```

Do not calculate only the latest candle with stateless formulas.

## Suggested Python Modules

```text
services/strategy/app/
  main.py
  models.py
  indicators.py
  market_data.py
  scoring.py
  backtest.py
  strategies/
    emd_trend.py
```

## Validation

Use the same Kline range in TradingView and the strategy service, then compare:

- Market state
- Trend direction
- Breakout/retest events
- Reversal events
- Entry/exit signal timestamps
- Stop/take-profit levels

Small differences can appear due to exchange feed differences, but rule logic must match.
