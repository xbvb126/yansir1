from app.models import Candle, StrategyConfig, StrategyRunRequest


BASE_TIME = 1_710_000_000_000
BAR_MS = 300_000


def candles_from_closes(closes: list[float], *, start_time: int = BASE_TIME) -> list[Candle]:
    candles: list[Candle] = []
    previous_close = closes[0] if closes else 0.0
    for index, close in enumerate(closes):
        open_price = previous_close if index else close
        body = abs(close - open_price)
        padding = max(body * 0.1, 0.2)
        candles.append(
            Candle(
                open_time=start_time + index * BAR_MS,
                open=open_price,
                high=max(open_price, close) + padding,
                low=min(open_price, close) - padding,
                close=close,
                volume=1_000 + index,
            )
        )
        previous_close = close
    return candles


def test_config() -> StrategyConfig:
    return StrategyConfig(
        length=5,
        adx_len=5,
        adx_smooth=5,
        atr_len=5,
        slope_len=3,
        bb_len=10,
        trend_slope_min=0.05,
        no_chase_atr_mult=3.0,
    )


def uptrend_context(count: int = 50) -> list[Candle]:
    return candles_from_closes([90 + index * 1.1 for index in range(count)], start_time=BASE_TIME)


def downtrend_context(count: int = 50) -> list[Candle]:
    return candles_from_closes([130 - index * 1.1 for index in range(count)], start_time=BASE_TIME)


def trend_long_request() -> StrategyRunRequest:
    closes = [120 - index * 0.8 for index in range(39)] + [108]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=uptrend_context(),
        htf_candles=uptrend_context(),
        config=test_config(),
    )


def trend_short_request() -> StrategyRunRequest:
    closes = [80 + index * 0.8 for index in range(39)] + [92]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=downtrend_context(),
        htf_candles=downtrend_context(),
        config=test_config(),
    )


def weak_reduce_long_request() -> StrategyRunRequest:
    closes = [120 - index * 0.8 for index in range(34)] + [108, 130]
    mtf_closes = [90 + index * 1.1 for index in range(len(closes) - 1)] + [105]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=candles_from_closes(mtf_closes),
        htf_candles=uptrend_context(len(closes) + 2),
        config=test_config(),
    )
