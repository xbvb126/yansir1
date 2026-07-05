import unittest

from app.models import StrategyRunRequest
from app.strategies.emd_trend import run_emd_trend_strategy

from .fixtures import candles_from_closes, trend_long_request, trend_short_request, weak_reduce_long_request


class EmdV6StrategyReplayTest(unittest.TestCase):
    def test_no_signal_for_short_history(self):
        request = StrategyRunRequest(
            symbol="BTCUSDT",
            timeframe="5m",
            candles=candles_from_closes([100, 101, 102, 103, 104]),
            mtf_candles=candles_from_closes([100, 101, 102, 103, 104]),
            htf_candles=candles_from_closes([100, 101, 102, 103, 104]),
        )

        response = run_emd_trend_strategy(request)

        self.assertEqual(response.signals, [])
        self.assertIn(
            response.market_state,
            {"insufficient_data", "transition_observation", "no_signal"},
        )

    def test_trend_long_signal_uses_pine_signal_family(self):
        response = run_emd_trend_strategy(trend_long_request())

        signal = self._only_signal(response.signals, "trend_long_signal")
        self.assertEqual(signal.action, "open_long")
        self.assertEqual(signal.engine, "trend")
        self.assertEqual(signal.side, "long")
        self.assertEqual(signal.title, "趋势买入")
        self.assertEqual(response.diagnostics.active_engine, "趋势")

    def test_trend_short_signal_uses_pine_signal_family(self):
        response = run_emd_trend_strategy(trend_short_request())

        signal = self._only_signal(response.signals, "trend_short_signal")
        self.assertEqual(signal.action, "open_short")
        self.assertEqual(signal.engine, "trend")
        self.assertEqual(signal.side, "short")
        self.assertEqual(signal.title, "趋势开空")

    def test_weak_reduce_signal_is_reduce_action_not_new_short(self):
        response = run_emd_trend_strategy(weak_reduce_long_request())

        signal = self._only_signal(response.signals, "weak_reduce_long_signal")
        self.assertEqual(signal.action, "reduce_long")
        self.assertEqual(signal.engine, "trend_weakness")
        self.assertEqual(signal.side, "long")
        self.assertEqual(signal.reduce_pct, 25.0)

    def test_response_contains_diagnostics_bands_and_state(self):
        request = trend_long_request()
        response = run_emd_trend_strategy(request)

        diagnostics = response.diagnostics
        self.assertTrue(diagnostics.market_state_text)
        self.assertTrue(diagnostics.risk_status)
        self.assertTrue(diagnostics.current_position)
        self.assertEqual(len(diagnostics.bands), len(request.candles))
        self.assertEqual(
            [point.open_time for point in diagnostics.bands],
            [candle.open_time for candle in request.candles],
        )
        self.assertIsNotNone(diagnostics.support)
        self.assertIsNotNone(diagnostics.resistance)

    def _only_signal(self, signals, signal_type):
        matches = [signal for signal in signals if signal.type == signal_type]
        self.assertEqual([signal.type for signal in signals], [signal_type])
        self.assertEqual(len(matches), 1)
        return matches[0]


if __name__ == "__main__":
    unittest.main()
