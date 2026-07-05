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
        highs = [10, 11, 11, 11]
        lows = [9, 9, 9, 9]
        closes = [9.5, 10, 10, 10]
        plus_di, minus_di, adx = dmi_adx_series(highs, lows, closes, 3, 3)
        self.assertEqual(len(plus_di), len(highs))
        self.assertEqual(len(minus_di), len(highs))
        self.assertEqual(len(adx), len(highs))
        self.assertAlmostEqual(plus_di[1], 25.0)
        self.assertAlmostEqual(minus_di[1], 0.0)
        self.assertAlmostEqual(adx[1], 100 / 3)
        self.assertAlmostEqual(plus_di[2], 100 / 7)
        self.assertAlmostEqual(minus_di[2], 0.0)
        self.assertAlmostEqual(adx[2], 500 / 9)

    def test_atr_and_rsi_use_pine_rma_parity(self):
        self.assertEqual(
            atr_series([10, 12, 13], [9, 10, 12], [9.5, 11, 12.5], 2),
            [1, 1.75, 1.875],
        )
        rsi = rsi_series([10, 11, 10, 12], 2)
        self.assertAlmostEqual(rsi[0], 100.0)
        self.assertAlmostEqual(rsi[1], 100.0)
        self.assertAlmostEqual(rsi[2], 100 / 3)
        self.assertAlmostEqual(rsi[3], 900 / 11)

    def test_bollinger_width_and_pivots_emit_on_confirmation_bar(self):
        closes = [10, 11, 12, 13, 14]
        widths = bollinger_width_pct_series(closes, 3, 2)
        self.assertIsNone(widths[1])
        self.assertAlmostEqual(widths[-1], 400 * ((2 / 3) ** 0.5) / 13)
        self.assertEqual(pivot_high_series([1, 3, 2, 5, 4], 1), [None, None, 3, None, 5])
        self.assertEqual(pivot_low_series([5, 3, 4, 2, 3], 1), [None, None, 3, None, 2])


if __name__ == "__main__":
    unittest.main()
