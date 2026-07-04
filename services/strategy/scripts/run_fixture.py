import json
from pathlib import Path
from sys import path

ROOT = Path(__file__).resolve().parents[1]
path.insert(0, str(ROOT))

from app.models import StrategyRunRequest  # noqa: E402
from app.strategies.emd_trend import run_emd_trend_strategy  # noqa: E402


def main() -> None:
    fixture_path = ROOT / "fixtures" / "btcusdt_5m_sample.json"
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    request = StrategyRunRequest(**payload)
    response = run_emd_trend_strategy(request)
    print(response.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
