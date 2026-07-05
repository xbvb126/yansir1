import unittest

from app.indicators import (
    atr_series,
    bollinger_width_pct_series,
    dmi_adx_series,
    ema_series,
    pivot_high_series,
    pivot_low_series,
    rma_series,
    rsi_series,
)


class IndicatorParityTest(unittest.TestCase):
    def test_rma_and_ema_seed_from_first_value(self):
        self.assertEqual(rma_series([10, 20, 30], 2), [10, 15, 22.5])
        self.assertEqual(ema_series([10, 20, 30], 3), [10, 15, 22.5])

    def test_dmi_adx_emits_pine_shaped_series(self):
        highs = [10, 11, 12, 13, 14, 14, 15]
        lows = [9, 9.5, 10, 11, 12, 12.5, 13]
        closes = [9.5, 10.5, 11.5, 12.5, 13, 13.2, 14]
        plus_di, minus_di, adx = dmi_adx_series(highs, lows, closes, 3, 3)
        self.assertEqual(len(plus_di), len(highs))
        self.assertEqual(len(minus_di), len(highs))
        self.assertEqual(len(adx), len(highs))
        self.assertGreater(plus_di[-1], minus_di[-1])
        self.assertGreater(adx[-1], 0)

    def test_bollinger_width_and_pivots_are_available(self):
        closes = [10, 11, 12, 13, 14]
        widths = bollinger_width_pct_series(closes, 3, 2)
        self.assertIsNone(widths[1])
        self.assertGreater(widths[-1], 0)
        self.assertEqual(pivot_high_series([1, 3, 2, 5, 4], 1), [None, 3, None, 5, None])
        self.assertEqual(pivot_low_series([5, 3, 4, 2, 3], 1), [None, 3, None, 2, None])


if __name__ == "__main__":
    unittest.main()
