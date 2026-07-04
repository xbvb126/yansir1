from fastapi import FastAPI

from app.models import StrategyRunRequest, StrategyRunResponse
from app.strategies.emd_trend import run_emd_trend_strategy

app = FastAPI(title="Coin Anomaly Strategy Service")


@app.get("/strategy/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/strategy/run", response_model=StrategyRunResponse)
def run_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    return run_emd_trend_strategy(payload)
