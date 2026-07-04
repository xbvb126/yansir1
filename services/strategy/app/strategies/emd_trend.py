from statistics import pstdev

from app.indicators import atr_series, ema_series, rma_series, rsi_series, true_ranges
from app.models import StrategyMetrics, StrategyRunRequest, StrategyRunResponse, StrategySignal
from app.scoring import score_strategy_signal


def run_emd_trend_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    """Pine V6 EMD strategy signal port for strategy tracking.

    The service emits only real signal events from the provided Pine standard:
    trend long/short flips and support/resistance reversal confirmations. Normal
    trend continuation or old historical states do not emit frontend records.
    """
    candles = payload.candles
    if not candles:
        return StrategyRunResponse(
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            bar_time=None,
            market_state="no_data",
            signals=[],
            metrics=StrategyMetrics(),
        )

    cfg = payload.config
    closes = [candle.close for candle in candles]
    highs = [candle.high for candle in candles]
    lows = [candle.low for candle in candles]

    avg = rma_series(closes, cfg.length)
    deviations = [abs(close - (avg[index] or close)) for index, close in enumerate(closes)]
    dev = ema_series(deviations, cfg.length)
    atr = atr_series(highs, lows, closes, cfg.atr_len)
    rsi = rsi_series(closes, cfg.rsi_len)
    adx = adx_series(highs, lows, closes, cfg.adx_len, cfg.adx_smooth)

    last_index = len(candles) - 1
    last_close = closes[-1]
    last_atr = atr[-1]
    last_avg = avg[-1]
    last_dev = dev[-1]
    last_rsi = rsi[-1]
    last_adx = adx[-1]
    buffer_multiplier = cfg.buffer_ratio * cfg.mult
    directions = build_direction_series(closes, avg, dev, buffer_multiplier)
    direction = directions[-1]
    prev_direction = directions[-2] if len(directions) >= 2 else 0
    long_flip = direction == 1 and prev_direction == -1
    short_flip = direction == -1 and prev_direction == 1

    htf_dir = timeframe_direction(payload.htf_candles, cfg.length, buffer_multiplier, confirmed=True)
    mtf_pack = timeframe_pack(payload.mtf_candles, cfg.length, buffer_multiplier, confirmed=False)
    mtf_avg = mtf_pack["avg"]
    mtf_dev = mtf_pack["dev"]
    mtf_close = mtf_pack["close"]
    mtf_trend_ok_long = mtf_close is not None and mtf_avg is not None and mtf_dev is not None and mtf_close > mtf_avg + mtf_dev * buffer_multiplier * 0.3
    mtf_trend_ok_short = mtf_close is not None and mtf_avg is not None and mtf_dev is not None and mtf_close < mtf_avg - mtf_dev * buffer_multiplier * 0.3

    atr_pct = (last_atr / last_close * 100) if last_atr and last_close else None
    vol_ok = atr_pct is not None and atr_pct >= cfg.min_atr_pct
    slope_norm = None
    if last_atr and last_atr > 0 and len(avg) > cfg.slope_len and last_avg is not None and avg[-1 - cfg.slope_len] is not None:
        slope_norm = abs(last_avg - avg[-1 - cfg.slope_len]) / last_atr
    trend_slope_ok = slope_norm is not None and slope_norm >= cfg.trend_slope_min
    bb_width_pct = bollinger_width_pct(closes, cfg.bb_len, cfg.bb_mult)

    is_trend_market = bool(vol_ok and last_adx is not None and last_adx >= cfg.trend_adx_min and trend_slope_ok and htf_dir != 0)
    is_range_market = bool(vol_ok and last_adx is not None and last_adx <= cfg.range_adx_max and bb_width_pct is not None and bb_width_pct <= cfg.range_bb_width_max)
    is_chaos_market = bool((not vol_ok) or (last_adx is not None and slope_norm is not None and bb_width_pct is not None and last_adx < cfg.range_adx_max and slope_norm < cfg.trend_slope_min and bb_width_pct > cfg.range_bb_width_max))
    trade_allowed = not is_chaos_market

    trend_engine_on = is_trend_market
    reversal_engine_on = is_range_market
    not_chase_long = last_avg is not None and last_atr is not None and last_close <= last_avg + last_atr * cfg.no_chase_atr_mult
    not_chase_short = last_avg is not None and last_atr is not None and last_close >= last_avg - last_atr * cfg.no_chase_atr_mult
    allow_long = htf_dir == 1 and mtf_trend_ok_long and last_adx is not None and last_adx >= cfg.trend_adx_min
    allow_short = htf_dir == -1 and mtf_trend_ok_short and last_adx is not None and last_adx >= cfg.trend_adx_min

    trend_long_signal = bool(trend_engine_on and trade_allowed and long_flip and allow_long and not_chase_long)
    trend_short_signal = bool(trend_engine_on and trade_allowed and short_flip and allow_short and not_chase_short)

    sr = support_resistance_state(candles, atr, pivot_len=12, sr_atr_mult=0.35, touch_atr_mult=0.25)
    upper_extreme = (last_avg + last_atr * 1.8) if last_avg is not None and last_atr is not None else None
    lower_extreme = (last_avg - last_atr * 1.8) if last_avg is not None and last_atr is not None else None
    rev_long_setup = lower_extreme is not None and lows[-1] <= lower_extreme and last_rsi is not None and last_rsi <= 28
    rev_short_setup = upper_extreme is not None and highs[-1] >= upper_extreme and last_rsi is not None and last_rsi >= 72
    prev_rev_long_setup = False
    prev_rev_short_setup = False
    if len(candles) >= 2 and last_avg is not None and last_atr is not None and len(rsi) >= 2:
        prev_avg = avg[-2]
        prev_atr = atr[-2]
        prev_rsi = rsi[-2]
        if prev_avg is not None and prev_atr is not None and prev_rsi is not None:
            prev_rev_long_setup = lows[-2] <= prev_avg - prev_atr * 1.8 and prev_rsi <= 28
            prev_rev_short_setup = highs[-2] >= prev_avg + prev_atr * 1.8 and prev_rsi >= 72
    rev_long_confirm = bool(prev_rev_long_setup and lower_extreme is not None and last_close > lower_extreme and last_close > candles[-1].open)
    rev_short_confirm = bool(prev_rev_short_setup and upper_extreme is not None and last_close < upper_extreme and last_close < candles[-1].open)
    allow_rev_long = htf_dir == 1
    allow_rev_short = htf_dir == -1
    reversal_long_signal = bool(trade_allowed and reversal_engine_on and rev_long_confirm and allow_rev_long and sr["long_ok"] and not trend_long_signal)
    reversal_short_signal = bool(trade_allowed and reversal_engine_on and rev_short_confirm and allow_rev_short and sr["short_ok"] and not trend_short_signal)

    signals: list[StrategySignal] = []
    if trend_long_signal:
        signals.append(make_signal("trend_long_signal", "趋势买入", "emd_trend", "long", last_close, last_atr, 2.5, 4.0))
    if trend_short_signal:
        signals.append(make_signal("trend_short_signal", "趋势开空", "emd_trend", "short", last_close, last_atr, 2.5, 4.0))
    if reversal_long_signal:
        signals.append(make_signal("reversal_long_signal", "支撑反转买入", "emd_reversal", "long", last_close, last_atr, 1.5, 1.8))
    if reversal_short_signal:
        signals.append(make_signal("reversal_short_signal", "压力反转开空", "emd_reversal", "short", last_close, last_atr, 1.5, 1.8))

    return StrategyRunResponse(
        symbol=payload.symbol,
        timeframe=payload.timeframe,
        bar_time=candles[last_index].open_time,
        market_state=market_state_from_flags(direction, is_trend_market, is_range_market, is_chaos_market, signals),
        signals=signals,
        metrics=StrategyMetrics(
            adx=last_adx,
            atr_pct=atr_pct,
            rsi=last_rsi,
            slope_norm=slope_norm,
            bb_width_pct=bb_width_pct,
        ),
    )


def make_signal(signal_type: str, title: str, engine: str, side: str, price: float, atr_value: float | None, sl_mult: float, tp_mult: float) -> StrategySignal:
    if side == "long":
        stop = price - atr_value * sl_mult if atr_value else None
        tp = price + atr_value * tp_mult if atr_value else None
    else:
        stop = price + atr_value * sl_mult if atr_value else None
        tp = price - atr_value * tp_mult if atr_value else None
    return StrategySignal(
        type=signal_type,
        title=title,
        engine=engine,
        side=side,
        price=price,
        stop_price=stop,
        take_profit_price=tp,
        score_impact=score_strategy_signal(signal_type),
    )


def build_direction_series(closes: list[float], averages: list[float | None], deviations: list[float | None], buffer_multiplier: float) -> list[int]:
    directions: list[int] = []
    current_direction = 0
    for close, average, deviation in zip(closes, averages, deviations, strict=True):
        if average is not None and deviation is not None:
            buffer = deviation * buffer_multiplier
            if close > average + buffer:
                current_direction = 1
            elif close < average - buffer:
                current_direction = -1
        directions.append(current_direction)
    return directions


def timeframe_pack(candles, length: int, buffer_multiplier: float, confirmed: bool) -> dict[str, float | int | None]:
    if not candles or len(candles) < 3:
        return {"dir": 0, "avg": None, "dev": None, "close": None}
    closes = [candle.close for candle in candles]
    avg = rma_series(closes, length)
    dev = ema_series([abs(close - (avg[index] or close)) for index, close in enumerate(closes)], length)
    directions = build_direction_series(closes, avg, dev, buffer_multiplier)
    index = -2 if confirmed and len(closes) >= 2 else -1
    return {"dir": directions[index], "avg": avg[index], "dev": dev[index], "close": closes[index]}


def timeframe_direction(candles, length: int, buffer_multiplier: float, confirmed: bool) -> int:
    return int(timeframe_pack(candles, length, buffer_multiplier, confirmed)["dir"] or 0)


def adx_series(highs: list[float], lows: list[float], closes: list[float], length: int, smooth: int) -> list[float | None]:
    plus_dm = [0.0]
    minus_dm = [0.0]
    for i in range(1, len(highs)):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
    tr = true_ranges(highs, lows, closes)
    tr_rma = rma_series(tr, length)
    plus_rma = rma_series(plus_dm, length)
    minus_rma = rma_series(minus_dm, length)
    dx: list[float] = []
    for trv, pdm, mdm in zip(tr_rma, plus_rma, minus_rma, strict=True):
        if not trv:
            dx.append(0.0)
            continue
        plus_di = 100 * (pdm or 0) / trv
        minus_di = 100 * (mdm or 0) / trv
        denom = plus_di + minus_di
        dx.append(0.0 if denom == 0 else 100 * abs(plus_di - minus_di) / denom)
    return rma_series(dx, smooth)


def bollinger_width_pct(closes: list[float], length: int, mult: float) -> float | None:
    if len(closes) < length:
        return None
    window = closes[-length:]
    basis = sum(window) / length
    if basis == 0:
        return None
    dev = pstdev(window) * mult
    return (2 * dev) / basis * 100


def support_resistance_state(candles, atr: list[float | None], pivot_len: int, sr_atr_mult: float, touch_atr_mult: float) -> dict[str, bool]:
    support_top = support_bottom = resistance_top = resistance_bottom = None
    support_touches = resistance_touches = 0
    for i in range(pivot_len, max(pivot_len, len(candles) - pivot_len)):
        left = candles[i - pivot_len : i]
        right = candles[i + 1 : i + 1 + pivot_len]
        if len(right) < pivot_len:
            continue
        atr_value = atr[i] or 0
        if candles[i].high >= max([c.high for c in left + right]):
            resistance_top = candles[i].high + atr_value * sr_atr_mult
            resistance_bottom = candles[i].high - atr_value * sr_atr_mult
            resistance_touches = 0
        if candles[i].low <= min([c.low for c in left + right]):
            support_top = candles[i].low + atr_value * sr_atr_mult
            support_bottom = candles[i].low - atr_value * sr_atr_mult
            support_touches = 0
        if support_top is not None and support_bottom is not None:
            tolerance = atr_value * touch_atr_mult
            if candles[i].low <= support_top + tolerance and candles[i].high >= support_bottom - tolerance:
                support_touches += 1
        if resistance_top is not None and resistance_bottom is not None:
            tolerance = atr_value * touch_atr_mult
            if candles[i].high >= resistance_bottom - tolerance and candles[i].low <= resistance_top + tolerance:
                resistance_touches += 1
    last_atr = atr[-1] or 0
    support_touch = support_top is not None and support_bottom is not None and candles[-1].low <= support_top + last_atr * touch_atr_mult and candles[-1].high >= support_bottom - last_atr * touch_atr_mult
    resistance_touch = resistance_top is not None and resistance_bottom is not None and candles[-1].high >= resistance_bottom - last_atr * touch_atr_mult and candles[-1].low <= resistance_top + last_atr * touch_atr_mult
    return {"long_ok": bool(support_touch and support_touches + 1 >= 1), "short_ok": bool(resistance_touch and resistance_touches + 1 >= 1)}


def market_state_from_flags(direction: int, is_trend: bool, is_range: bool, is_chaos: bool, signals: list[StrategySignal]) -> str:
    if signals:
        return signals[0].type
    if is_chaos:
        return "chaos_no_trade"
    if is_trend:
        return "trend_market_waiting_signal"
    if is_range:
        return "range_market_waiting_reversal"
    if direction == 1:
        return "long_trend_no_signal"
    if direction == -1:
        return "short_trend_no_signal"
    return "transition_observation"
