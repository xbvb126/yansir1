import unittest

from app.models import (
    StrategyDiagnostics,
    StrategyOverlayEvent,
    StrategyOverlayPoint,
    StrategyOverlays,
    StrategyOverlayZone,
    StrategyRiskLine,
    StrategyRunResponse,
    StrategySignal,
    StrategyTimelineSignal,
)


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
            overlays=StrategyOverlays(
                points=[
                    StrategyOverlayPoint(
                        open_time=1710000000000,
                        avg=100.0,
                        upper=101.0,
                        lower=99.0,
                        upper_extreme=103.0,
                        lower_extreme=97.0,
                        direction=1,
                        htf_direction=1,
                    )
                ],
                events=[
                    StrategyOverlayEvent(
                        open_time=1710000000000,
                        price=100.0,
                        label="趋势买入",
                        kind="entry",
                        side="long",
                    )
                ],
                zones=[
                    StrategyOverlayZone(
                        kind="support",
                        top=99.5,
                        bottom=98.5,
                        strength=3,
                        touched=True,
                    )
                ],
                risk_lines=[
                    StrategyRiskLine(
                        kind="stop",
                        price=95.0,
                        side="long",
                        label="止损",
                    )
                ],
                panel={"市场状态": "趋势市场"},
            ),
            signal_timeline=[
                StrategyTimelineSignal(
                    type="weak_reduce_long_signal",
                    title="趋势转弱减多仓",
                    engine="trend_weakness",
                    side="long",
                    action="reduce_long",
                    price=100.0,
                    reduce_pct=25.0,
                    score_impact=10,
                    bar_time=1710000000000,
                )
            ],
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
        self.assertEqual(dumped["diagnostics"]["overlays"]["points"][0]["avg"], 100.0)
        self.assertEqual(dumped["diagnostics"]["overlays"]["events"][0]["label"], "趋势买入")
        self.assertEqual(dumped["diagnostics"]["overlays"]["zones"][0]["kind"], "support")
        self.assertEqual(dumped["diagnostics"]["overlays"]["risk_lines"][0]["kind"], "stop")
        self.assertEqual(dumped["diagnostics"]["signal_timeline"][0]["bar_time"], 1710000000000)


if __name__ == "__main__":
    unittest.main()
