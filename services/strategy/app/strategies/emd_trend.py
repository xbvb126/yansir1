from app.models import StrategyRunRequest, StrategyRunResponse
from app.strategies.emd_v6 import run_emd_v6_strategy


def run_emd_trend_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    return run_emd_v6_strategy(payload)
