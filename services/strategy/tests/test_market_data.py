import unittest
from unittest.mock import patch

from services.strategy.app.market_data import fetch_binance_klines


class _Response:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'[[1,"1","2","0.5","1.5","10",299999,"0",1,"0","0","0"]]'


class MarketDataTests(unittest.TestCase):
    @patch("services.strategy.app.market_data.urlopen", return_value=_Response())
    def test_fetch_binance_klines_maps_only_supported_parameters(self, mocked_urlopen):
        result = fetch_binance_klines("btcusdt", "5m", 180, 1784643299999)

        self.assertEqual(len(result), 1)
        requested_url = mocked_urlopen.call_args.args[0]
        self.assertIn("symbol=BTCUSDT", requested_url)
        self.assertIn("interval=5m", requested_url)
        self.assertIn("limit=180", requested_url)
        self.assertIn("endTime=1784643299999", requested_url)


if __name__ == "__main__":
    unittest.main()
