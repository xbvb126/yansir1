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

    def test_manual_close_allows_opposite_side_entry(self):
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

    def test_partial_reduce_scales_layers_and_keeps_state_consistent(self):
        state = PinePositionState()
        state.entry("base long", "long", price=100.0, qty_pct=10.0, atr=2.0)
        state.entry("add long", "long", price=110.0, qty_pct=10.0, atr=2.5)

        state.reduce("reduce_long", side="long", price=106.0, reduce_pct=25.0)

        self.assertEqual(state.position_size, 15.0)
        self.assertEqual(state.open_trades, 2)
        self.assertEqual([layer.qty for layer in state.layers], [7.5, 7.5])
        self.assertEqual(state.current_position, "多单")
        self.assertTrue(state.long_weak_reduce_done)

    def test_full_reduce_clears_layers_and_resets_flat_state(self):
        state = PinePositionState()
        state.entry("base long", "long", price=100.0, qty_pct=10.0, atr=2.0)

        state.reduce("reduce_long", side="long", price=106.0, reduce_pct=100.0)

        self.assertEqual(state.position_size, 0)
        self.assertEqual(state.open_trades, 0)
        self.assertEqual(state.position_avg_price, 0)
        self.assertEqual(state.position_peak_size, 0)
        self.assertEqual(state.current_position, "空仓")

    def test_opposite_side_entry_without_close_raises_value_error(self):
        state = PinePositionState()
        state.entry("base long", "long", price=100.0, qty_pct=10.0, atr=2.0)

        with self.assertRaises(ValueError):
            state.entry("opposite short", "short", price=98.0, qty_pct=10.0, atr=2.0)

    def test_reduce_rejects_invalid_percent(self):
        state = PinePositionState()
        state.entry("base long", "long", price=100.0, qty_pct=10.0, atr=2.0)

        with self.assertRaises(ValueError):
            state.reduce("reduce_long", side="long", price=106.0, reduce_pct=-1.0)

        with self.assertRaises(ValueError):
            state.reduce("reduce_long", side="long", price=106.0, reduce_pct=101.0)


if __name__ == "__main__":
    unittest.main()
