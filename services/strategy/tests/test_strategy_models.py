import unittest

from app.models import StrategyDiagnostics, StrategyRunResponse, StrategySignal


class StrategyModelContractTest(unittest.TestCase):
    def test_signal_action_and_diagnostics_are_optional_contract_fields(self):
        signal = StrategySignal(
            type="weak_reduce_long_signal",
            title="趋势转弱减多仓",
            engine="trend_weakness",
            side="long",
            action="reduce_long",
            price=100.0,
            reduce_pct=25.0,
            score_impact=10,
        )
        diagnostics = StrategyDiagnostics(
            market_state_text="趋势市场",
            risk_status="允许交易",
            active_engine="趋势",
            current_position="多单",
        )
        response = StrategyRunResponse(
            symbol="BTCUSDT",
            timeframe="5m",
            bar_time=1710000000000,
            market_state="weak_reduce_long_signal",
            signals=[signal],
            diagnostics=diagnostics,
            metrics={},
        )
        dumped = response.model_dump()
        self.assertEqual(dumped["signals"][0]["action"], "reduce_long")
        self.assertEqual(dumped["signals"][0]["reduce_pct"], 25.0)
        self.assertEqual(dumped["diagnostics"]["active_engine"], "趋势")


if __name__ == "__main__":
    unittest.main()
