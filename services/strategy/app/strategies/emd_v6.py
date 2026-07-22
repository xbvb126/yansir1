from dataclasses import dataclass
from typing import Any

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
from app.models import (
    Candle,
    StrategyBandPoint,
    StrategyDiagnostics,
    StrategyMetrics,
    StrategyOverlayEvent,
    StrategyOverlayPoint,
    StrategyOverlays,
    StrategyOverlayZone,
    StrategyRiskLine,
    StrategyRunRequest,
    StrategyRunResponse,
    StrategySignal,
    StrategyTimelineSignal,
    StrategyZone,
)
from app.scoring import score_strategy_signal
from app.strategies.pine_state import PinePositionState


SIGNAL_DEFS = {
    "trend_long_signal": ("open_long", "trend", "long", "趋势买入"),
    "trend_short_signal": ("open_short", "trend", "short", "趋势开空"),
    "resume_long": ("add_long", "trend_pullback_add", "long", "趋势回踩加仓买入"),
    "resume_short": ("add_short", "trend_pullback_add", "short", "趋势反抽加仓开空"),
    "break_retest_long_add": ("add_long", "break_retest_add", "long", "突破回踩加仓买入"),
    "break_retest_short_add": ("add_short", "break_retest_add", "short", "跌破反抽加仓开空"),
    "reversal_long_signal": ("open_long", "reversal_support", "long", "支撑反转买入"),
    "reversal_short_signal": ("open_short", "reversal_resistance", "short", "压力反转开空"),
    "weak_reduce_long_signal": ("reduce_long", "trend_weakness", "long", "趋势转弱减多仓"),
    "weak_reduce_short_signal": ("reduce_short", "trend_weakness", "short", "趋势转弱减空仓"),
}

DEFAULT_USE_ADD = True
DEFAULT_USE_BREAK_RETEST_ADD = True
DEFAULT_PULLBACK_PERC = 0.0
DEFAULT_MAX_OPEN_TRADES = 2
DEFAULT_USE_REVERSAL = True
DEFAULT_ALLOW_COUNTERTREND_REVERSAL = False
DEFAULT_USE_SR_FILTER_FOR_REVERSAL = True
DEFAULT_RSI_OB = 72.0
DEFAULT_RSI_OS = 28.0
DEFAULT_REV_ATR_EXTREME = 1.8
DEFAULT_REV_ADX_MAX = 25.0
DEFAULT_SL_ATR_MULT = 2.5
DEFAULT_TP_ATR_MULT = 4.0
DEFAULT_PULLBACK_ADD_SL_ATR_MULT = 2.0
DEFAULT_BREAK_ADD_SL_ATR_MULT = 1.8
DEFAULT_REV_SL_ATR_MULT = 1.5
DEFAULT_REV_TP_ATR_MULT = 1.8
DEFAULT_USE_WEAKNESS_REDUCE = True
DEFAULT_WEAK_REDUCE_QTY_PCT = 25.0
DEFAULT_WEAK_REDUCE_MIN_R = 1.0
DEFAULT_WEAK_ADX_LOOKBACK = 3
DEFAULT_WEAK_ADX_DROP_MIN = 2.0
DEFAULT_SR_REDUCE_STRENGTH_MIN = 3
DEFAULT_SR_PIVOT_LEN = 12
DEFAULT_SR_ATR_MULT = 0.35
DEFAULT_SR_TOUCH_ATR_MULT = 0.25
DEFAULT_MIN_SR_STRENGTH_FOR_REVERSAL = 1
DEFAULT_ENTRY_QTY_PCT = 10.0

ACTIVE_NONE = "无"
ACTIVE_TREND = "趋势"
ACTIVE_PULLBACK_ADD = "趋势回踩加仓"
ACTIVE_BREAK_RETEST_ADD = "突破回踩加仓"
ACTIVE_REVERSAL = "反转"


@dataclass
class ReplaySeries:
    opens: list[float]
    highs: list[float]
    lows: list[float]
    closes: list[float]
    avg: list[float | None]
    dev: list[float | None]
    directions: list[int]
    atr: list[float | None]
    rsi: list[float | None]
    adx: list[float | None]
    bb_width_pct: list[float | None]
    mtf: dict[str, list[Any]]
    htf: dict[str, list[Any]]
    pivot_high: list[float | None]
    pivot_low: list[float | None]


@dataclass
class BarContext:
    index: int
    market_state_text: str
    risk_status: str
    active_engine: str
    current_r: float | None
    remaining_position_pct: float | None
    support: StrategyZone
    resistance: StrategyZone
    metrics: StrategyMetrics


def run_emd_v6_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    engine = EmdV6Engine(payload)
    return engine.run()


class EmdV6Engine:
    def __init__(self, payload: StrategyRunRequest) -> None:
        self.payload = payload
        self.state = PinePositionState()
        self.active_engine = ACTIVE_NONE
        self.base_long_entry_atr: float | None = None
        self.base_short_entry_atr: float | None = None
        self.has_base_long = False
        self.has_pullback_long = False
        self.has_break_long = False
        self.has_base_short = False
        self.has_pullback_short = False
        self.has_break_short = False
        self.overlay_events: list[StrategyOverlayEvent] = []
        self.signal_timeline: list[StrategyTimelineSignal] = []

    def run(self) -> StrategyRunResponse:
        candles = self.payload.candles
        if not candles:
            return StrategyRunResponse(
                symbol=self.payload.symbol,
                timeframe=self.payload.timeframe,
                bar_time=None,
                market_state="no_data",
                signals=[],
                diagnostics=StrategyDiagnostics(
                    market_state_text="no_data",
                    risk_status="无数据",
                    active_engine=ACTIVE_NONE,
                ),
                metrics=StrategyMetrics(),
            )

        series = self.build_series()
        min_bars = max(35, self.payload.config.length)
        if len(candles) < min_bars:
            return StrategyRunResponse(
                symbol=self.payload.symbol,
                timeframe=self.payload.timeframe,
                bar_time=candles[-1].open_time,
                market_state="insufficient_data",
                signals=[],
                diagnostics=StrategyDiagnostics(
                    market_state_text="insufficient_data",
                    risk_status="观察",
                    active_engine=ACTIVE_NONE,
                    current_position=self.state.current_position,
                    bands=self.make_bands(series),
                ),
                metrics=self.metrics_at(series, len(candles) - 1),
            )

        latest_signals, context = self.replay(series)
        return self.make_response(series, latest_signals, context)

    def build_series(self) -> ReplaySeries:
        candles = self.payload.candles
        cfg = self.payload.config
        opens = [candle.open for candle in candles]
        highs = [candle.high for candle in candles]
        lows = [candle.low for candle in candles]
        closes = [candle.close for candle in candles]
        avg = rma_series(closes, cfg.length)
        dev = ema_series([abs(close - (avg[index] or close)) for index, close in enumerate(closes)], cfg.length)
        buffer_multiplier = cfg.buffer_ratio * cfg.mult
        directions = self.direction_series(closes, avg, dev, buffer_multiplier)
        atr = atr_series(highs, lows, closes, cfg.atr_len)
        rsi = rsi_series(closes, cfg.rsi_len)
        _, _, adx = dmi_adx_series(highs, lows, closes, cfg.adx_len, cfg.adx_smooth)
        bb_width_pct = bollinger_width_pct_series(closes, cfg.bb_len, cfg.bb_mult)
        return ReplaySeries(
            opens=opens,
            highs=highs,
            lows=lows,
            closes=closes,
            avg=avg,
            dev=dev,
            directions=directions,
            atr=atr,
            rsi=rsi,
            adx=adx,
            bb_width_pct=bb_width_pct,
            mtf=self.timeframe_series(
                self.payload.mtf_candles,
                confirmed=False,
                timeframe=self.payload.mtf_timeframe,
            ),
            htf=self.timeframe_series(
                self.payload.htf_candles,
                confirmed=True,
                timeframe=self.payload.htf_timeframe,
            ),
            pivot_high=pivot_high_series(highs, DEFAULT_SR_PIVOT_LEN),
            pivot_low=pivot_low_series(lows, DEFAULT_SR_PIVOT_LEN),
        )

    def timeframe_series(self, candles: list[Candle], *, confirmed: bool, timeframe: str) -> dict[str, list[Any]]:
        base_len = len(self.payload.candles)
        if not candles:
            return {
                "close": [None] * base_len,
                "avg": [None] * base_len,
                "dev": [None] * base_len,
                "dir": [0] * base_len,
            }
        cfg = self.payload.config
        closes = [candle.close for candle in candles]
        avg = rma_series(closes, cfg.length)
        dev = ema_series([abs(close - (avg[index] or close)) for index, close in enumerate(closes)], cfg.length)
        directions = self.direction_series(closes, avg, dev, cfg.buffer_ratio * cfg.mult)
        base_decision_times = self.candle_close_times(self.payload.candles, self.payload.timeframe)
        source_close_times = self.candle_close_times(candles, timeframe)
        mapped_close: list[float | None] = []
        mapped_avg: list[float | None] = []
        mapped_dev: list[float | None] = []
        mapped_dir: list[int] = []
        source_index = -1
        # Pine lookahead_off-compatible replay: all higher-timeframe values are
        # selected by time, never array position, and only after that candle is closed.
        # The confirmed flag documents the HTF call site; timestamp closure is the
        # confirmation rule for both current MTF values and HTF direction.
        _ = confirmed
        for decision_time in base_decision_times:
            while source_index + 1 < len(candles):
                candidate_index = source_index + 1
                candidate = candles[candidate_index]
                if candidate.open_time > decision_time or source_close_times[candidate_index] > decision_time:
                    break
                source_index = candidate_index
            if source_index < 0:
                mapped_close.append(None)
                mapped_avg.append(None)
                mapped_dev.append(None)
                mapped_dir.append(0)
                continue
            mapped_close.append(closes[source_index])
            mapped_avg.append(avg[source_index])
            mapped_dev.append(dev[source_index])
            mapped_dir.append(directions[source_index])
        return {"close": mapped_close, "avg": mapped_avg, "dev": mapped_dev, "dir": mapped_dir}

    def candle_close_times(self, candles: list[Candle], timeframe: str) -> list[int]:
        interval_ms = self.inferred_interval_ms(candles, timeframe)
        close_times: list[int] = []
        for index, candle in enumerate(candles):
            if candle.close_time is not None:
                close_times.append(candle.close_time)
            elif index + 1 < len(candles):
                close_times.append(candles[index + 1].open_time)
            else:
                close_times.append(candle.open_time + interval_ms)
        return close_times

    def inferred_interval_ms(self, candles: list[Candle], timeframe: str) -> int:
        for previous, current in zip(candles, candles[1:], strict=False):
            delta = current.open_time - previous.open_time
            if delta > 0:
                return delta
        return self.timeframe_to_ms(timeframe) or 0

    def timeframe_to_ms(self, timeframe: str) -> int | None:
        value = timeframe.strip().lower()
        if not value:
            return None
        if value.isdigit():
            return int(value) * 60_000
        unit_multipliers = {
            "s": 1_000,
            "m": 60_000,
            "h": 3_600_000,
            "d": 86_400_000,
            "w": 604_800_000,
        }
        unit = value[-1]
        amount = value[:-1]
        if unit not in unit_multipliers or not amount.isdigit():
            return None
        return int(amount) * unit_multipliers[unit]

    def replay(self, series: ReplaySeries) -> tuple[list[StrategySignal], BarContext]:
        latest_signals: list[StrategySignal] = []
        support_top = support_bottom = resistance_top = resistance_bottom = None
        support_touches = resistance_touches = 0
        prev_touch_support = False
        prev_touch_resistance = False
        previous_context: BarContext | None = None

        for index, candle in enumerate(self.payload.candles):
            signals: list[StrategySignal] = []
            cfg = self.payload.config
            close = series.closes[index]
            high = series.highs[index]
            low = series.lows[index]
            avg = series.avg[index]
            atr = series.atr[index]
            adx = series.adx[index]
            bb_width = series.bb_width_pct[index]
            direction = series.directions[index]
            prev_direction = series.directions[index - 1] if index > 0 else 0
            long_flip = direction == 1 and prev_direction == -1
            short_flip = direction == -1 and prev_direction == 1

            if series.pivot_high[index] is not None:
                pivot = series.pivot_high[index] or 0.0
                width = (atr or 0.0) * DEFAULT_SR_ATR_MULT
                resistance_top = pivot + width
                resistance_bottom = pivot - width
                resistance_touches = 0
            if series.pivot_low[index] is not None:
                pivot = series.pivot_low[index] or 0.0
                width = (atr or 0.0) * DEFAULT_SR_ATR_MULT
                support_top = pivot + width
                support_bottom = pivot - width
                support_touches = 0

            support_tolerance = (atr or 0.0) * DEFAULT_SR_TOUCH_ATR_MULT
            resistance_tolerance = (atr or 0.0) * DEFAULT_SR_TOUCH_ATR_MULT
            price_touch_support = (
                support_top is not None
                and support_bottom is not None
                and low <= support_top + support_tolerance
                and high >= support_bottom - support_tolerance
            )
            price_touch_resistance = (
                resistance_top is not None
                and resistance_bottom is not None
                and high >= resistance_bottom - resistance_tolerance
                and low <= resistance_top + resistance_tolerance
            )
            if price_touch_support and not prev_touch_support:
                support_touches += 1
            if price_touch_resistance and not prev_touch_resistance:
                resistance_touches += 1
            prev_touch_support = bool(price_touch_support)
            prev_touch_resistance = bool(price_touch_resistance)
            support_strength = min(5, support_touches + 1) if support_top is not None else 0
            resistance_strength = min(5, resistance_touches + 1) if resistance_top is not None else 0

            previous_close = series.closes[index - 1] if index > 0 else close
            break_resistance = (
                resistance_top is not None and close > resistance_top and previous_close <= resistance_top
            )
            break_support = support_bottom is not None and close < support_bottom and previous_close >= support_bottom
            retest_resistance_as_support = (
                resistance_top is not None
                and resistance_bottom is not None
                and close > resistance_top
                and low <= resistance_top
                and low >= resistance_bottom - support_tolerance
            )
            retest_support_as_resistance = (
                support_top is not None
                and support_bottom is not None
                and close < support_bottom
                and high >= support_bottom
                and high <= support_top + resistance_tolerance
            )

            atr_pct = atr / close * 100 if atr is not None and close else None
            vol_ok = atr_pct is not None and atr_pct >= cfg.min_atr_pct
            slope_norm = self.slope_norm(series.avg, series.atr, index)
            trend_slope_ok = slope_norm is not None and slope_norm >= cfg.trend_slope_min
            htf_dir = int(series.htf["dir"][index] or 0)
            mtf_trend_ok_long = self.mtf_trend_ok(series, index, "long")
            mtf_trend_ok_short = self.mtf_trend_ok(series, index, "short")
            is_trend_market = bool(vol_ok and adx is not None and adx >= cfg.trend_adx_min and trend_slope_ok and htf_dir != 0)
            is_range_market = bool(
                vol_ok and adx is not None and adx <= cfg.range_adx_max and bb_width is not None and bb_width <= cfg.range_bb_width_max
            )
            is_chaos_market = bool(
                (not vol_ok)
                or (
                    adx is not None
                    and slope_norm is not None
                    and bb_width is not None
                    and adx < cfg.range_adx_max
                    and slope_norm < cfg.trend_slope_min
                    and bb_width > cfg.range_bb_width_max
                )
            )
            market_state_text = self.market_state_text(is_chaos_market, is_trend_market, is_range_market)
            trend_engine_on = is_trend_market
            reversal_engine_on = is_range_market
            not_chase_long = avg is not None and atr is not None and close <= avg + atr * cfg.no_chase_atr_mult
            not_chase_short = avg is not None and atr is not None and close >= avg - atr * cfg.no_chase_atr_mult
            trade_allowed = not is_chaos_market
            allow_long = htf_dir == 1 and mtf_trend_ok_long and adx is not None and adx >= cfg.trend_adx_min
            allow_short = htf_dir == -1 and mtf_trend_ok_short and adx is not None and adx >= cfg.trend_adx_min
            can_initial_long = self.state.position_size <= 0
            can_initial_short = self.state.position_size >= 0
            trend_long_signal = bool(
                trend_engine_on and trade_allowed and long_flip and allow_long and can_initial_long and not_chase_long
            )
            trend_short_signal = bool(
                trend_engine_on and trade_allowed and short_flip and allow_short and can_initial_short and not_chase_short
            )

            pullback_long = avg is not None and low <= avg * (1 - DEFAULT_PULLBACK_PERC)
            prev_pullback_long = False
            pullback_short = avg is not None and high >= avg * (1 + DEFAULT_PULLBACK_PERC)
            prev_pullback_short = False
            if index > 0 and series.avg[index - 1] is not None:
                prev_pullback_long = series.lows[index - 1] <= (series.avg[index - 1] or 0.0) * (1 - DEFAULT_PULLBACK_PERC)
                prev_pullback_short = series.highs[index - 1] >= (series.avg[index - 1] or 0.0) * (1 + DEFAULT_PULLBACK_PERC)
            resume_long = bool(
                DEFAULT_USE_ADD
                and trend_engine_on
                and trade_allowed
                and prev_pullback_long
                and avg is not None
                and close > avg
                and allow_long
                and self.state.position_size > 0
                and self.state.open_trades < DEFAULT_MAX_OPEN_TRADES
            )
            resume_short = bool(
                DEFAULT_USE_ADD
                and trend_engine_on
                and trade_allowed
                and prev_pullback_short
                and avg is not None
                and close < avg
                and allow_short
                and self.state.position_size < 0
                and self.state.open_trades < DEFAULT_MAX_OPEN_TRADES
            )
            break_retest_long_add = bool(
                DEFAULT_USE_BREAK_RETEST_ADD
                and trend_engine_on
                and trade_allowed
                and retest_resistance_as_support
                and allow_long
                and self.state.position_size > 0
                and self.state.open_trades < DEFAULT_MAX_OPEN_TRADES
                and not resume_long
            )
            break_retest_short_add = bool(
                DEFAULT_USE_BREAK_RETEST_ADD
                and trend_engine_on
                and trade_allowed
                and retest_support_as_resistance
                and allow_short
                and self.state.position_size < 0
                and self.state.open_trades < DEFAULT_MAX_OPEN_TRADES
                and not resume_short
            )

            rev_long_signal, rev_short_signal = self.reversal_signals(
                series,
                index,
                trade_allowed=trade_allowed,
                reversal_engine_on=reversal_engine_on,
                htf_dir=htf_dir,
                adx=adx,
                price_touch_support=bool(price_touch_support),
                price_touch_resistance=bool(price_touch_resistance),
                support_strength=support_strength,
                resistance_strength=resistance_strength,
                can_open_long=can_initial_long,
                can_open_short=can_initial_short,
                trend_long_signal=trend_long_signal,
                trend_short_signal=trend_short_signal,
            )

            if trend_long_signal:
                self.has_base_long = True
                self.base_long_entry_atr = atr
            if resume_long:
                self.has_pullback_long = True
            if break_retest_long_add:
                self.has_break_long = True
            if trend_short_signal:
                self.has_base_short = True
                self.base_short_entry_atr = atr
            if resume_short:
                self.has_pullback_short = True
            if break_retest_short_add:
                self.has_break_short = True

            current_r = self.current_r(close, atr)
            long_weakness = bool(
                (self.state.position_size > 0 and not mtf_trend_ok_long)
                or self.adx_weak(series.adx, index)
                or (self.state.position_size > 0 and price_touch_resistance and resistance_strength >= DEFAULT_SR_REDUCE_STRENGTH_MIN)
            )
            short_weakness = bool(
                (self.state.position_size < 0 and not mtf_trend_ok_short)
                or self.adx_weak(series.adx, index)
                or (self.state.position_size < 0 and price_touch_support and support_strength >= DEFAULT_SR_REDUCE_STRENGTH_MIN)
            )
            weak_reduce_long_signal = bool(
                DEFAULT_USE_WEAKNESS_REDUCE
                and self.state.position_size > 0
                and (self.has_base_long or self.has_pullback_long or self.has_break_long)
                and not self.state.long_weak_reduce_done
                and current_r is not None
                and current_r >= DEFAULT_WEAK_REDUCE_MIN_R
                and long_weakness
            )
            weak_reduce_short_signal = bool(
                DEFAULT_USE_WEAKNESS_REDUCE
                and self.state.position_size < 0
                and (self.has_base_short or self.has_pullback_short or self.has_break_short)
                and not self.state.short_weak_reduce_done
                and current_r is not None
                and current_r >= DEFAULT_WEAK_REDUCE_MIN_R
                and short_weakness
            )

            if weak_reduce_long_signal:
                signal = self.make_signal("weak_reduce_long_signal", close, atr)
                signals.append(signal)
                self.add_signal_event(index, signal)
                self.state.reduce("reduce_long", "long", close, DEFAULT_WEAK_REDUCE_QTY_PCT)
            if weak_reduce_short_signal:
                signal = self.make_signal("weak_reduce_short_signal", close, atr)
                signals.append(signal)
                self.add_signal_event(index, signal)
                self.state.reduce("reduce_short", "short", close, DEFAULT_WEAK_REDUCE_QTY_PCT)

            if self.state.position_size == 0:
                self.active_engine = ACTIVE_NONE
            if trend_long_signal or trend_short_signal:
                self.active_engine = ACTIVE_TREND
            if resume_long or resume_short:
                self.active_engine = ACTIVE_PULLBACK_ADD
            if break_retest_long_add or break_retest_short_add:
                self.active_engine = ACTIVE_BREAK_RETEST_ADD
            if rev_long_signal or rev_short_signal:
                self.active_engine = ACTIVE_REVERSAL

            if (trend_long_signal or rev_long_signal) and self.state.position_size < 0:
                self.state.close_side("short", close)
            if (trend_short_signal or rev_short_signal) and self.state.position_size > 0:
                self.state.close_side("long", close)

            entry_signals = [
                ("trend_long_signal", trend_long_signal),
                ("trend_short_signal", trend_short_signal),
                ("resume_long", resume_long),
                ("resume_short", resume_short),
                ("break_retest_long_add", break_retest_long_add),
                ("break_retest_short_add", break_retest_short_add),
                ("reversal_long_signal", rev_long_signal),
                ("reversal_short_signal", rev_short_signal),
            ]
            for signal_type, enabled in entry_signals:
                if not enabled:
                    continue
                signal = self.make_signal(signal_type, close, atr)
                signals.append(signal)
                self.add_signal_event(index, signal)
                self.state.entry(signal.title, signal.side, close, DEFAULT_ENTRY_QTY_PCT, atr)

            self.add_sr_events(
                index,
                close=close,
                high=high,
                low=low,
                break_resistance=bool(break_resistance),
                break_support=bool(break_support),
                retest_resistance_as_support=bool(retest_resistance_as_support),
                retest_support_as_resistance=bool(retest_support_as_resistance),
            )

            if (
                self.state.position_size == 0
                and not any(enabled for _, enabled in entry_signals)
                and not weak_reduce_long_signal
                and not weak_reduce_short_signal
            ):
                self.clear_entry_records()

            remaining_position_pct = (
                abs(self.state.position_size) / self.state.position_peak_size * 100
                if self.state.position_peak_size > 0
                else None
            )
            support_zone = StrategyZone(
                top=support_top,
                bottom=support_bottom,
                strength=support_strength,
                touched=bool(price_touch_support),
            )
            resistance_zone = StrategyZone(
                top=resistance_top,
                bottom=resistance_bottom,
                strength=resistance_strength,
                touched=bool(price_touch_resistance),
            )
            risk_status = "允许交易" if trade_allowed else "禁止开仓"
            previous_context = BarContext(
                index=index,
                market_state_text=market_state_text,
                risk_status=risk_status,
                active_engine=self.active_engine,
                current_r=self.current_r(close, atr),
                remaining_position_pct=remaining_position_pct,
                support=support_zone,
                resistance=resistance_zone,
                metrics=StrategyMetrics(
                    adx=adx,
                    atr_pct=atr_pct,
                    rsi=series.rsi[index],
                    slope_norm=slope_norm,
                    bb_width_pct=bb_width,
                ),
            )
            if index == len(self.payload.candles) - 1:
                latest_signals = signals

            _ = pullback_long, pullback_short, break_resistance, break_support

        if previous_context is None:
            previous_context = BarContext(
                index=len(self.payload.candles) - 1,
                market_state_text="transition_observation",
                risk_status="观察",
                active_engine=ACTIVE_NONE,
                current_r=None,
                remaining_position_pct=None,
                support=StrategyZone(),
                resistance=StrategyZone(),
                metrics=StrategyMetrics(),
            )
        return latest_signals, previous_context

    def reversal_signals(
        self,
        series: ReplaySeries,
        index: int,
        *,
        trade_allowed: bool,
        reversal_engine_on: bool,
        htf_dir: int,
        adx: float | None,
        price_touch_support: bool,
        price_touch_resistance: bool,
        support_strength: int,
        resistance_strength: int,
        can_open_long: bool,
        can_open_short: bool,
        trend_long_signal: bool,
        trend_short_signal: bool,
    ) -> tuple[bool, bool]:
        if index == 0:
            return False, False
        avg = series.avg[index]
        atr = series.atr[index]
        prev_avg = series.avg[index - 1]
        prev_atr = series.atr[index - 1]
        prev_rsi = series.rsi[index - 1]
        if avg is None or atr is None or prev_avg is None or prev_atr is None or prev_rsi is None:
            return False, False
        lower_extreme = avg - atr * DEFAULT_REV_ATR_EXTREME
        upper_extreme = avg + atr * DEFAULT_REV_ATR_EXTREME
        prev_lower_extreme = prev_avg - prev_atr * DEFAULT_REV_ATR_EXTREME
        prev_upper_extreme = prev_avg + prev_atr * DEFAULT_REV_ATR_EXTREME
        prev_rev_long_setup = series.lows[index - 1] <= prev_lower_extreme and prev_rsi <= DEFAULT_RSI_OS
        prev_rev_short_setup = series.highs[index - 1] >= prev_upper_extreme and prev_rsi >= DEFAULT_RSI_OB
        rev_long_confirm = prev_rev_long_setup and series.closes[index] > lower_extreme and series.closes[index] > series.opens[index]
        rev_short_confirm = prev_rev_short_setup and series.closes[index] < upper_extreme and series.closes[index] < series.opens[index]
        allow_countertrend = DEFAULT_ALLOW_COUNTERTREND_REVERSAL and adx is not None and adx <= DEFAULT_REV_ADX_MAX
        allow_rev_long = DEFAULT_USE_REVERSAL and reversal_engine_on and (htf_dir == 1 or allow_countertrend)
        allow_rev_short = DEFAULT_USE_REVERSAL and reversal_engine_on and (htf_dir == -1 or allow_countertrend)
        reversal_long_sr_ok = (not DEFAULT_USE_SR_FILTER_FOR_REVERSAL) or (
            price_touch_support and support_strength >= DEFAULT_MIN_SR_STRENGTH_FOR_REVERSAL
        )
        reversal_short_sr_ok = (not DEFAULT_USE_SR_FILTER_FOR_REVERSAL) or (
            price_touch_resistance and resistance_strength >= DEFAULT_MIN_SR_STRENGTH_FOR_REVERSAL
        )
        return (
            bool(
                trade_allowed
                and rev_long_confirm
                and allow_rev_long
                and reversal_long_sr_ok
                and can_open_long
                and not trend_long_signal
            ),
            bool(
                trade_allowed
                and rev_short_confirm
                and allow_rev_short
                and reversal_short_sr_ok
                and can_open_short
                and not trend_short_signal
            ),
        )

    def make_response(
        self,
        series: ReplaySeries,
        latest_signals: list[StrategySignal],
        context: BarContext,
    ) -> StrategyRunResponse:
        market_state = self.market_state(latest_signals, series.directions[-1], context.market_state_text)
        return StrategyRunResponse(
            symbol=self.payload.symbol,
            timeframe=self.payload.timeframe,
            bar_time=self.payload.candles[-1].open_time,
            market_state=market_state,
            signals=latest_signals,
            diagnostics=StrategyDiagnostics(
                market_state_text=context.market_state_text,
                risk_status=context.risk_status,
                active_engine=context.active_engine,
                current_position=self.state.current_position,
                current_r=context.current_r,
                remaining_position_pct=context.remaining_position_pct,
                bands=self.make_bands(series),
                support=context.support,
                resistance=context.resistance,
                overlays=self.make_overlays(series, latest_signals, context),
                signal_timeline=self.signal_timeline,
            ),
            metrics=context.metrics,
        )

    def make_signal(self, signal_type: str, price: float, atr: float | None) -> StrategySignal:
        action, engine, side, title = SIGNAL_DEFS[signal_type]
        stop_mult, tp_mult = self.risk_multipliers(signal_type)
        if signal_type.startswith("weak_reduce"):
            stop_price = None
            take_profit_price = None
            reduce_pct = DEFAULT_WEAK_REDUCE_QTY_PCT
        elif side == "long":
            stop_price = price - atr * stop_mult if atr is not None else None
            take_profit_price = price + atr * tp_mult if atr is not None else None
            reduce_pct = None
        else:
            stop_price = price + atr * stop_mult if atr is not None else None
            take_profit_price = price - atr * tp_mult if atr is not None else None
            reduce_pct = None
        return StrategySignal(
            type=signal_type,
            title=title,
            engine=engine,
            side=side,
            action=action,
            price=price,
            reduce_pct=reduce_pct,
            stop_price=stop_price,
            take_profit_price=take_profit_price,
            score_impact=score_strategy_signal(signal_type),
        )

    def add_signal_event(self, index: int, signal: StrategySignal) -> None:
        candle = self.payload.candles[index]
        self.signal_timeline.append(
            StrategyTimelineSignal(
                type=signal.type,
                title=signal.title,
                engine=signal.engine,
                side=signal.side,
                action=signal.action,
                price=signal.price,
                reduce_pct=signal.reduce_pct,
                stop_price=signal.stop_price,
                take_profit_price=signal.take_profit_price,
                score_impact=signal.score_impact,
                bar_time=candle.open_time,
            )
        )
        kind = "reduce" if signal.action and "reduce" in signal.action else "entry"
        self.overlay_events.append(
            StrategyOverlayEvent(
                open_time=candle.open_time,
                price=signal.price,
                label=signal.title,
                kind=kind,
                side=signal.side,
            )
        )

    def add_sr_events(
        self,
        index: int,
        *,
        close: float,
        high: float,
        low: float,
        break_resistance: bool,
        break_support: bool,
        retest_resistance_as_support: bool,
        retest_support_as_resistance: bool,
    ) -> None:
        candle = self.payload.candles[index]
        event_specs = [
            (break_resistance, high, "突破压力", "sr_break", "long"),
            (break_support, low, "跌破支撑", "sr_break", "short"),
            (retest_resistance_as_support, low, "回踩确认", "sr_retest", "long"),
            (retest_support_as_resistance, high, "反抽确认", "sr_retest", "short"),
        ]
        for enabled, price, label, kind, side in event_specs:
            if not enabled:
                continue
            self.overlay_events.append(
                StrategyOverlayEvent(
                    open_time=candle.open_time,
                    price=price if price else close,
                    label=label,
                    kind=kind,
                    side=side,
                )
            )

    def risk_multipliers(self, signal_type: str) -> tuple[float, float]:
        if signal_type in {"resume_long", "resume_short"}:
            return DEFAULT_PULLBACK_ADD_SL_ATR_MULT, DEFAULT_TP_ATR_MULT
        if signal_type in {"break_retest_long_add", "break_retest_short_add"}:
            return DEFAULT_BREAK_ADD_SL_ATR_MULT, DEFAULT_TP_ATR_MULT
        if signal_type in {"reversal_long_signal", "reversal_short_signal"}:
            return DEFAULT_REV_SL_ATR_MULT, DEFAULT_REV_TP_ATR_MULT
        return DEFAULT_SL_ATR_MULT, DEFAULT_TP_ATR_MULT

    def make_overlays(
        self,
        series: ReplaySeries,
        latest_signals: list[StrategySignal],
        context: BarContext,
    ) -> StrategyOverlays:
        return StrategyOverlays(
            points=self.make_overlay_points(series),
            events=self.overlay_events,
            zones=self.make_overlay_zones(context),
            risk_lines=self.make_risk_lines(latest_signals),
            panel=self.make_overlay_panel(context, series.directions[-1] if series.directions else 0),
        )

    def make_overlay_points(self, series: ReplaySeries) -> list[StrategyOverlayPoint]:
        points: list[StrategyOverlayPoint] = []
        buffer_multiplier = self.payload.config.buffer_ratio * self.payload.config.mult
        for index, (candle, avg, dev, atr, direction) in enumerate(
            zip(
                self.payload.candles,
                series.avg,
                series.dev,
                series.atr,
                series.directions,
                strict=True,
            )
        ):
            buffer = dev * buffer_multiplier if dev is not None else None
            points.append(
                StrategyOverlayPoint(
                    open_time=candle.open_time,
                    close_time=candle.close_time,
                    avg=avg,
                    upper=avg + buffer if avg is not None and buffer is not None else None,
                    lower=avg - buffer if avg is not None and buffer is not None else None,
                    upper_extreme=avg + atr * DEFAULT_REV_ATR_EXTREME if avg is not None and atr is not None else None,
                    lower_extreme=avg - atr * DEFAULT_REV_ATR_EXTREME if avg is not None and atr is not None else None,
                    direction=direction,
                    htf_direction=int(series.htf["dir"][index] or 0),
                )
            )
        return points

    def make_overlay_zones(self, context: BarContext) -> list[StrategyOverlayZone]:
        zones: list[StrategyOverlayZone] = []
        if context.support.top is not None or context.support.bottom is not None:
            zones.append(
                StrategyOverlayZone(
                    kind="support",
                    top=context.support.top,
                    bottom=context.support.bottom,
                    strength=context.support.strength,
                    touched=context.support.touched,
                )
            )
        if context.resistance.top is not None or context.resistance.bottom is not None:
            zones.append(
                StrategyOverlayZone(
                    kind="resistance",
                    top=context.resistance.top,
                    bottom=context.resistance.bottom,
                    strength=context.resistance.strength,
                    touched=context.resistance.touched,
                )
            )
        return zones

    def make_risk_lines(self, latest_signals: list[StrategySignal]) -> list[StrategyRiskLine]:
        lines: list[StrategyRiskLine] = []
        for signal in latest_signals:
            if signal.stop_price is not None:
                lines.append(
                    StrategyRiskLine(
                        kind="stop",
                        price=signal.stop_price,
                        side=signal.side,
                        label="止损",
                    )
                )
            if signal.take_profit_price is not None:
                lines.append(
                    StrategyRiskLine(
                        kind="take_profit",
                        price=signal.take_profit_price,
                        side=signal.side,
                        label="止盈",
                    )
                )
        return lines

    def make_overlay_panel(self, context: BarContext, direction: int) -> dict[str, str]:
        metrics = context.metrics
        return {
            "市场状态": context.market_state_text,
            "风控状态": context.risk_status,
            "当前周期趋势": self.direction_text(direction),
            "当前引擎": context.active_engine,
            "当前持仓": self.state.current_position,
            "ADX强度": self.format_panel_number(metrics.adx),
            "斜率ATR倍数": self.format_panel_number(metrics.slope_norm),
            "ATR波动率%": self.format_panel_number(metrics.atr_pct),
            "RSI状态": self.format_panel_number(metrics.rsi),
            "当前R倍数": "-" if context.current_r is None else f"{context.current_r:.2f}R",
            "剩余仓位": "-" if context.remaining_position_pct is None else f"{context.remaining_position_pct:.2f}%",
        }

    def format_panel_number(self, value: float | None) -> str:
        return "-" if value is None else f"{value:.2f}"

    def direction_text(self, direction: int) -> str:
        if direction > 0:
            return "多头"
        if direction < 0:
            return "空头"
        return "震荡"

    def make_bands(self, series: ReplaySeries) -> list[StrategyBandPoint]:
        bands: list[StrategyBandPoint] = []
        buffer_multiplier = self.payload.config.buffer_ratio * self.payload.config.mult
        for candle, avg, dev, direction in zip(
            self.payload.candles,
            series.avg,
            series.dev,
            series.directions,
            strict=True,
        ):
            buffer = dev * buffer_multiplier if dev is not None else None
            bands.append(
                StrategyBandPoint(
                    open_time=candle.open_time,
                    avg=avg,
                    upper=avg + buffer if avg is not None and buffer is not None else None,
                    lower=avg - buffer if avg is not None and buffer is not None else None,
                    direction=direction,
                )
            )
        return bands

    def metrics_at(self, series: ReplaySeries, index: int) -> StrategyMetrics:
        close = series.closes[index]
        atr = series.atr[index]
        atr_pct = atr / close * 100 if atr is not None and close else None
        return StrategyMetrics(
            adx=series.adx[index],
            atr_pct=atr_pct,
            rsi=series.rsi[index],
            slope_norm=self.slope_norm(series.avg, series.atr, index),
            bb_width_pct=series.bb_width_pct[index],
        )

    def direction_series(
        self,
        closes: list[float],
        averages: list[float | None],
        deviations: list[float | None],
        buffer_multiplier: float,
    ) -> list[int]:
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

    def mtf_trend_ok(self, series: ReplaySeries, index: int, side: str) -> bool:
        mtf_close = series.mtf["close"][index]
        mtf_avg = series.mtf["avg"][index]
        mtf_dev = series.mtf["dev"][index]
        if mtf_close is None or mtf_avg is None or mtf_dev is None:
            return False
        buffer = mtf_dev * self.payload.config.buffer_ratio * self.payload.config.mult * 0.3
        if side == "long":
            return bool(mtf_close > mtf_avg + buffer)
        return bool(mtf_close < mtf_avg - buffer)

    def slope_norm(self, averages: list[float | None], atr: list[float | None], index: int) -> float | None:
        slope_len = self.payload.config.slope_len
        if index - slope_len < 0:
            return None
        current_avg = averages[index]
        previous_avg = averages[index - slope_len]
        current_atr = atr[index]
        if current_avg is None or previous_avg is None or current_atr is None or current_atr <= 0:
            return None
        return abs(current_avg - previous_avg) / current_atr

    def adx_weak(self, adx: list[float | None], index: int) -> bool:
        lookback = DEFAULT_WEAK_ADX_LOOKBACK
        if index - lookback < 0 or adx[index] is None or adx[index - lookback] is None:
            return False
        return bool((adx[index] or 0.0) <= (adx[index - lookback] or 0.0) - DEFAULT_WEAK_ADX_DROP_MIN)

    def current_r(self, close: float, atr: float | None) -> float | None:
        if self.state.position_size > 0:
            reference_atr = self.base_long_entry_atr if self.base_long_entry_atr is not None else atr
            risk = reference_atr * DEFAULT_SL_ATR_MULT if reference_atr is not None else None
            return (close - self.state.position_avg_price) / risk if risk and risk > 0 else None
        if self.state.position_size < 0:
            reference_atr = self.base_short_entry_atr if self.base_short_entry_atr is not None else atr
            risk = reference_atr * DEFAULT_SL_ATR_MULT if reference_atr is not None else None
            return (self.state.position_avg_price - close) / risk if risk and risk > 0 else None
        return None

    def clear_entry_records(self) -> None:
        self.base_long_entry_atr = None
        self.base_short_entry_atr = None
        self.has_base_long = False
        self.has_pullback_long = False
        self.has_break_long = False
        self.has_base_short = False
        self.has_pullback_short = False
        self.has_break_short = False

    def market_state_text(self, is_chaos: bool, is_trend: bool, is_range: bool) -> str:
        if is_chaos:
            return "混沌禁开"
        if is_trend:
            return "趋势市场"
        if is_range:
            return "震荡市场"
        return "过渡观察"

    def market_state(self, signals: list[StrategySignal], direction: int, market_state_text: str) -> str:
        if signals:
            return signals[0].type
        if market_state_text == "混沌禁开":
            return "chaos_no_trade"
        if market_state_text == "趋势市场":
            return "trend_market_waiting_signal"
        if market_state_text == "震荡市场":
            return "range_market_waiting_reversal"
        if direction == 1:
            return "long_trend_no_signal"
        if direction == -1:
            return "short_trend_no_signal"
        return "transition_observation"
