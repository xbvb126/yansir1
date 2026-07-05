from pydantic import BaseModel, Field


class Candle(BaseModel):
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int | None = None


class StrategyConfig(BaseModel):
    length: int = 28
    mult: float = 1.0
    buffer_ratio: float = 0.20
    htf_tf: str = "60"
    mtf_tf: str = "15"
    adx_len: int = 14
    adx_smooth: int = 14
    trend_adx_min: float = 18.0
    range_adx_max: float = 20.0
    slope_len: int = 10
    trend_slope_min: float = 0.25
    bb_len: int = 20
    bb_mult: float = 2.0
    range_bb_width_max: float = 5.0
    min_atr_pct: float = 0.10
    no_chase_atr_mult: float = 2.2
    atr_len: int = 14
    rsi_len: int = 14


class StrategyRunRequest(BaseModel):
    symbol: str
    timeframe: str = "5m"
    mtf_timeframe: str = "15m"
    htf_timeframe: str = "1h"
    candles: list[Candle] = Field(default_factory=list)
    mtf_candles: list[Candle] = Field(default_factory=list)
    htf_candles: list[Candle] = Field(default_factory=list)
    config: StrategyConfig = Field(default_factory=StrategyConfig)


class StrategyBandPoint(BaseModel):
    open_time: int
    avg: float | None = None
    upper: float | None = None
    lower: float | None = None
    direction: int = 0


class StrategyZone(BaseModel):
    top: float | None = None
    bottom: float | None = None
    strength: int = 0
    touched: bool = False


class StrategyDiagnostics(BaseModel):
    market_state_text: str = "unknown"
    risk_status: str = "unknown"
    active_engine: str = "无"
    current_position: str = "空仓"
    current_r: float | None = None
    remaining_position_pct: float | None = None
    bands: list[StrategyBandPoint] = Field(default_factory=list)
    support: StrategyZone = Field(default_factory=StrategyZone)
    resistance: StrategyZone = Field(default_factory=StrategyZone)


class StrategySignal(BaseModel):
    type: str
    title: str
    engine: str
    side: str
    action: str | None = None
    price: float
    reduce_pct: float | None = None
    stop_price: float | None = None
    take_profit_price: float | None = None
    score_impact: int = 0


class StrategyMetrics(BaseModel):
    adx: float | None = None
    atr_pct: float | None = None
    rsi: float | None = None
    slope_norm: float | None = None
    bb_width_pct: float | None = None


class StrategyRunResponse(BaseModel):
    symbol: str
    timeframe: str
    bar_time: int | None = None
    market_state: str
    signals: list[StrategySignal]
    diagnostics: StrategyDiagnostics = Field(default_factory=StrategyDiagnostics)
    metrics: StrategyMetrics
