from fastapi import FastAPI

from app.market_data import fetch_binance_klines
from app.models import StrategyRunRequest, StrategyRunResponse
from app.strategies.emd_trend import run_emd_trend_strategy

app = FastAPI(title="Coin Anomaly Strategy Service")


@app.get("/strategy/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/market/klines")
def market_klines(
    symbol: str,
    interval: str,
    limit: int = 180,
    endTime: int | None = None,
    startTime: int | None = None,
) -> list[list[object]]:
    return fetch_binance_klines(symbol, interval, limit, endTime, startTime)


@app.post("/strategy/run", response_model=StrategyRunResponse)
def run_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    return run_emd_trend_strategy(payload)
