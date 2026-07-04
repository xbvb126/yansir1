# Strategy Service

FastAPI service for market data, indicator calculation, embedded Pine strategy migration, anomaly scoring, and backtests.

## Local Fixture

Run the sample strategy fixture:

```text
python services/strategy/scripts/run_fixture.py
```

The current `emd_trend.py` file is only the migration shell. It must be replaced with a faithful candle-by-candle port of the provided Pine strategy without changing the strategy rules.
