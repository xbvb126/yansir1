import unittest

from app.strategies.pine_state import PinePositionState


class PinePositionStateTest(unittest.TestCase):
    def test_entries_update_position_size_average_price_and_open_trades(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        state.entry("趋势加仓买入", "long", price=110.0, qty_pct=10.0, atr=2.5)
        self.assertGreater(state.position_size, 0)
        self.assertEqual(state.open_trades, 2)
        self.assertAlmostEqual(state.position_avg_price, 105.0)
        self.assertEqual(state.current_position, "多单")

    def test_reverse_entry_closes_opposite_side_before_new_entry(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        state.close_side("long", exit_price=98.0)
        state.entry("趋势开空", "short", price=98.0, qty_pct=10.0, atr=2.0)
        self.assertLess(state.position_size, 0)
        self.assertEqual(state.consecutive_losses, 1)
        self.assertEqual(state.current_position, "空单")

    def test_reduce_order_marks_weak_reduce_once(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        reduce_event = state.reduce("reduce_long", side="long", price=106.0, reduce_pct=25.0)
        self.assertEqual(reduce_event.action, "reduce_long")
        self.assertEqual(reduce_event.reduce_pct, 25.0)
        self.assertTrue(state.long_weak_reduce_done)


if __name__ == "__main__":
    unittest.main()
