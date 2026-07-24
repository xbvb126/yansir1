import json
import re
from urllib.parse import urlencode
from urllib.request import urlopen


BINANCE_FUTURES_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines"
SUPPORTED_INTERVALS = {"5m", "15m", "30m", "1h", "4h"}


def fetch_binance_klines(
    symbol: str,
    interval: str,
    limit: int = 500,
    end_time: int | None = None,
    start_time: int | None = None,
) -> list[list[object]]:
    normalized_symbol = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]+USDT", normalized_symbol):
        raise ValueError("unsupported Binance Futures symbol")
    if interval not in SUPPORTED_INTERVALS:
        raise ValueError("unsupported Binance Futures interval")

    params: dict[str, str | int] = {
        "symbol": normalized_symbol,
        "interval": interval,
        "limit": max(1, min(int(limit), 1000)),
    }
    if end_time is not None:
        params["endTime"] = int(end_time)
    if start_time is not None:
        params["startTime"] = int(start_time)

    url = f"{BINANCE_FUTURES_KLINES_URL}?{urlencode(params)}"
    with urlopen(url, timeout=10) as response:
        result = json.loads(response.read())
    if not isinstance(result, list):
        raise ValueError("unexpected Binance Futures response")
    return result
