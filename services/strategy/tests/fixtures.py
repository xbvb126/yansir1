from app.models import Candle, StrategyConfig, StrategyRunRequest


BASE_TIME = 1_710_000_000_000
BAR_MS = 300_000
MTF_BAR_MS = 900_000
HTF_BAR_MS = 3_600_000


def candles_from_closes(
    closes: list[float],
    *,
    start_time: int = BASE_TIME,
    bar_ms: int = BAR_MS,
) -> list[Candle]:
    candles: list[Candle] = []
    previous_close = closes[0] if closes else 0.0
    for index, close in enumerate(closes):
        open_price = previous_close if index else close
        body = abs(close - open_price)
        padding = max(body * 0.1, 0.2)
        candles.append(
            Candle(
                open_time=start_time + index * bar_ms,
                open=open_price,
                high=max(open_price, close) + padding,
                low=min(open_price, close) - padding,
                close=close,
                volume=1_000 + index,
            )
        )
        previous_close = close
    return candles


def candles_from_ohlc(
    rows: list[tuple[float, float, float, float]],
    *,
    start_time: int = BASE_TIME,
    bar_ms: int = BAR_MS,
) -> list[Candle]:
    return [
        Candle(
            open_time=start_time + index * bar_ms,
            open=open_price,
            high=high,
            low=low,
            close=close,
            volume=1_000 + index,
        )
        for index, (open_price, high, low, close) in enumerate(rows)
    ]


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


def reversal_config() -> StrategyConfig:
    return StrategyConfig(
        length=5,
        adx_len=5,
        adx_smooth=5,
        atr_len=5,
        rsi_len=5,
        slope_len=3,
        bb_len=10,
        trend_slope_min=999.0,
        trend_adx_min=101.0,
        range_adx_max=100.0,
        range_bb_width_max=100.0,
        min_atr_pct=0.01,
        no_chase_atr_mult=10.0,
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


def real_ratio_alignment_request() -> StrategyRunRequest:
    base = candles_from_closes([100, 101, 102, 103, 104], bar_ms=BAR_MS)
    mtf = candles_from_closes([200, 300], bar_ms=MTF_BAR_MS)
    htf = candles_from_closes(
        [90, 400, 500],
        start_time=BASE_TIME - HTF_BAR_MS,
        bar_ms=HTF_BAR_MS,
    )
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        mtf_timeframe="15m",
        htf_timeframe="1h",
        candles=base,
        mtf_candles=mtf,
        htf_candles=htf,
        config=test_config(),
    )


def reversal_long_request() -> StrategyRunRequest:
    closes = (
        [100] * 8
        + [99, 98, 97, 96, 95, 94, 93, 92, 93, 94, 95, 96, 97, 98, 99, 100]
        + [100] * 14
        + [93, 97]
    )
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=uptrend_context(len(closes) + 20),
        htf_candles=uptrend_context(len(closes) + 20),
        config=reversal_config(),
    )


def pullback_resume_long_request() -> StrategyRunRequest:
    closes = [120 - index * 0.8 for index in range(39)] + [108, 100]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=uptrend_context(len(closes) + 20),
        htf_candles=uptrend_context(len(closes) + 20),
        config=test_config(),
    )


def break_retest_long_add_request() -> StrategyRunRequest:
    closes = [
        100,
        101,
        102,
        103,
        104,
        105,
        106,
        107,
        108,
        109,
        110,
        111,
        111,
        110,
        109,
        108,
        107,
        106,
        105,
        104,
        103,
        102,
        101,
        100,
        99,
        98,
        97,
        96,
        95,
        94,
        93,
        92,
        91,
        90,
        89,
        88,
        87,
        86,
        85,
        114,
        116,
    ]
    rows: list[tuple[float, float, float, float]] = []
    previous_close = closes[0]
    for index, close in enumerate(closes):
        open_price = previous_close if index else close
        body = abs(close - open_price)
        padding = max(body * 0.1, 0.2)
        high = max(open_price, close) + padding
        low = min(open_price, close) - padding
        if index == 12:
            high = 112.0
        if index == len(closes) - 2:
            low = 113.0
        if index == len(closes) - 1:
            open_price = 115.0
            low = 112.0
            high = 117.0
        rows.append((open_price, high, low, close))
        previous_close = close
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_ohlc(rows),
        mtf_candles=uptrend_context(len(closes) + 20),
        htf_candles=uptrend_context(len(closes) + 20),
        config=test_config(),
    )


def same_side_duplicate_long_request() -> StrategyRunRequest:
    closes = [120 - index * 0.8 for index in range(39)] + [108, 80, 110]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=uptrend_context(len(closes) + 20),
        htf_candles=uptrend_context(len(closes) + 20),
        config=test_config(),
    )


def same_side_duplicate_short_request() -> StrategyRunRequest:
    closes = [80 + index * 0.8 for index in range(39)] + [92, 120, 90]
    return StrategyRunRequest(
        symbol="BTCUSDT",
        timeframe="5m",
        candles=candles_from_closes(closes),
        mtf_candles=downtrend_context(len(closes) + 20),
        htf_candles=downtrend_context(len(closes) + 20),
        config=test_config(),
    )
