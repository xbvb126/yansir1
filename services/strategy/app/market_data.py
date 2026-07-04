from app.models import Candle


async def fetch_binance_klines(symbol: str, interval: str, limit: int = 500) -> list[Candle]:
    """Market data collector placeholder.

    Real implementation will call Binance/OKX APIs and normalize Kline rows into Candle.
    """
    raise NotImplementedError("Market data collection is scheduled for the next implementation phase.")
