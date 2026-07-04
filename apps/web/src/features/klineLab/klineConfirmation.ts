export type KlineDirection = "long" | "short";

export type KlineConfirmationState =
  | "no-signal"
  | "watch-next"
  | "confirmed"
  | "warning"
  | "invalidated";

export type KlineEvidenceStatus = "pass" | "watch" | "fail";

export type KlineCandle = {
  open_time: number;
  close_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type KlineSignalInput = {
  direction: KlineDirection;
  price: number;
  timeframe?: string | null;
  symbol?: string | null;
};

export type KlineBandPoint = {
  open_time: number;
  close_time: number;
  close: number;
  basis: number;
  upper: number;
  lower: number;
  atr: number;
};

export type KlineEvidence = {
  key: string;
  label: string;
  status: KlineEvidenceStatus;
  weight: number;
  score: number;
  value: number;
  message: string;
};

export type KlineConfirmationResult = {
  state: KlineConfirmationState;
  direction: KlineDirection | null;
  timeframe: "5m" | "15m" | "1h" | "4h";
  signalPrice: number | null;
  score: number;
  evidence: KlineEvidence[];
  bands: KlineBandPoint[];
  validCandleCount: number;
};

type KlineConfirmationInput = {
  candles?: KlineCandle[] | null;
  signal?: KlineSignalInput | null;
};

const VALID_TIMEFRAMES = new Set(["5m", "15m", "1h", "4h"]);
const DEFAULT_TIMEFRAME: KlineConfirmationResult["timeframe"] = "5m";
const RECENT_CANDLE_COUNT = 5;
const MIN_CONFIRMATION_CANDLES = 8;
const BAND_SPAN = 8;
const BAND_MULTIPLIER = 0.85;

export function normalizeLabSymbol(value: string | null | undefined): string {
  const clean = `${value ?? ""}`.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutQuote = clean.replace(/(USDT|USDC|BUSD|FDUSD|USD)$/u, "");
  return withoutQuote || clean || "BTC";
}

export function normalizeLabTimeframe(value: string | null | undefined): KlineConfirmationResult["timeframe"] {
  const clean = `${value ?? ""}`.trim().toLowerCase();
  return VALID_TIMEFRAMES.has(clean) ? (clean as KlineConfirmationResult["timeframe"]) : DEFAULT_TIMEFRAME;
}

export function classifyKlineSignal(input: KlineConfirmationInput): KlineConfirmationResult {
  const candles = validCandles(input.candles);
  const bands = buildBands(candles);
  const signal = input.signal;
  const timeframe = normalizeLabTimeframe(signal?.timeframe);

  if (!signal || !Number.isFinite(signal.price)) {
    return result("no-signal", null, timeframe, null, 0, [], bands, candles.length);
  }

  const direction = signal.direction;
  const signalPrice = signal.price;

  if (candles.length < MIN_CONFIRMATION_CANDLES) {
    return result("watch-next", direction, timeframe, signalPrice, 0, [], bands, candles.length);
  }

  const recentCandles = candles.slice(-RECENT_CANDLE_COUNT);
  const recentBands = bands.slice(-RECENT_CANDLE_COUNT);
  const lastCandle = recentCandles[recentCandles.length - 1];
  const previousCandle = recentCandles[recentCandles.length - 2];
  const lastBand = recentBands[recentBands.length - 1];
  const atr = Math.max(lastBand.atr, 0.00000001);

  const evidence = [
    trendBandEvidence(direction, recentCandles, recentBands),
    closeStabilityEvidence(direction, recentCandles, signalPrice, atr),
    bodyQualityEvidence(direction, recentCandles),
    wickRiskEvidence(direction, recentCandles),
    atrDistanceEvidence(direction, lastCandle.close, signalPrice, atr)
  ];
  const score = Math.round(evidence.reduce((total, item) => total + item.score, 0));
  const invalidated = isInvalidated(direction, lastCandle.close, previousCandle.close, signalPrice, lastBand, atr);

  if (invalidated) {
    return result("invalidated", direction, timeframe, signalPrice, score, evidence, bands, candles.length);
  }

  const hasFailedEvidence = evidence.some((item) => item.status === "fail");
  const state = score >= 75 && !hasFailedEvidence ? "confirmed" : "warning";
  return result(state, direction, timeframe, signalPrice, score, evidence, bands, candles.length);
}

function result(
  state: KlineConfirmationState,
  direction: KlineDirection | null,
  timeframe: KlineConfirmationResult["timeframe"],
  signalPrice: number | null,
  score: number,
  evidence: KlineEvidence[],
  bands: KlineBandPoint[],
  validCandleCount: number
): KlineConfirmationResult {
  return {
    state,
    direction,
    timeframe,
    signalPrice,
    score,
    evidence,
    bands,
    validCandleCount
  };
}

function validCandles(candles: KlineCandle[] | null | undefined): KlineCandle[] {
  return (candles ?? []).filter((candle) => {
    if (!Number.isFinite(candle.open_time) || !Number.isFinite(candle.close_time)) return false;
    if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high)) return false;
    if (!Number.isFinite(candle.low) || !Number.isFinite(candle.close)) return false;
    if (candle.high < candle.low) return false;
    if (Math.max(candle.open, candle.close) > candle.high) return false;
    return Math.min(candle.open, candle.close) >= candle.low;
  });
}

function buildBands(candles: KlineCandle[]): KlineBandPoint[] {
  const alpha = 2 / (BAND_SPAN + 1);
  let ema = candles[0]?.close ?? 0;
  let atr = candles[0] ? candles[0].high - candles[0].low : 0;

  return candles.map((candle, index) => {
    const previousClose = index > 0 ? candles[index - 1].close : candle.close;
    const range = trueRange(candle, previousClose);

    if (index === 0) {
      ema = candle.close;
      atr = range;
    } else {
      ema = ema + alpha * (candle.close - ema);
      atr = atr + alpha * (range - atr);
    }

    const width = atr * BAND_MULTIPLIER;
    return {
      open_time: candle.open_time,
      close_time: candle.close_time,
      close: candle.close,
      basis: ema,
      upper: ema + width,
      lower: ema - width,
      atr
    };
  });
}

function trueRange(candle: KlineCandle, previousClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose)
  );
}

function trendBandEvidence(
  direction: KlineDirection,
  candles: KlineCandle[],
  bands: KlineBandPoint[]
): KlineEvidence {
  const lastBand = bands[bands.length - 1];
  const firstBand = bands[0];
  const slope = lastBand.basis - firstBand.basis;
  const alignedCount = candles.reduce((count, candle, index) => {
    const band = bands[index];
    const aligned = direction === "long" ? candle.close >= band.basis : candle.close <= band.basis;
    return aligned ? count + 1 : count;
  }, 0);
  const alignedSlope = direction === "long" ? slope > 0 : slope < 0;
  const guarded = direction === "long"
    ? candles[candles.length - 1].close >= lastBand.lower
    : candles[candles.length - 1].close <= lastBand.upper;
  let status: KlineEvidenceStatus = "fail";

  if (alignedSlope && alignedCount >= 4) {
    status = "pass";
  } else if (guarded && alignedCount >= 2) {
    status = "watch";
  }

  return evidence(
    "trend-band",
    "Trend band",
    status,
    25,
    alignedCount,
    `${alignedCount} of ${candles.length} closes held the signal side of the EMA band`
  );
}

function closeStabilityEvidence(
  direction: KlineDirection,
  candles: KlineCandle[],
  signalPrice: number,
  atr: number
): KlineEvidence {
  const lastTwo = candles.slice(-2);
  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const stableCount = lastTwo.filter((candle) => {
    return direction === "long" ? candle.close >= signalPrice : candle.close <= signalPrice;
  }).length;
  const movedForward = direction === "long"
    ? lastCandle.close >= previousCandle.close
    : lastCandle.close <= previousCandle.close;
  const adverseDistance = direction === "long"
    ? (signalPrice - lastCandle.close) / atr
    : (lastCandle.close - signalPrice) / atr;
  let status: KlineEvidenceStatus = "fail";

  if (stableCount === 2 && movedForward) {
    status = "pass";
  } else if (stableCount >= 1 || adverseDistance <= 0.35) {
    status = "watch";
  }

  return evidence(
    "close-stability",
    "Close stability",
    status,
    25,
    stableCount,
    `${stableCount} of the last 2 closes held beyond the signal price`
  );
}

function bodyQualityEvidence(direction: KlineDirection, candles: KlineCandle[]): KlineEvidence {
  const rangeTotal = candles.reduce((total, candle) => total + candle.high - candle.low, 0);
  const bodyTotal = candles.reduce((total, candle) => total + Math.abs(candle.close - candle.open), 0);
  const bodyRatio = rangeTotal > 0 ? bodyTotal / rangeTotal : 0;
  const directionalCount = candles.filter((candle) => {
    return direction === "long" ? candle.close > candle.open : candle.close < candle.open;
  }).length;
  let status: KlineEvidenceStatus = "fail";

  if (bodyRatio >= 0.45 && directionalCount >= 3) {
    status = "pass";
  } else if (bodyRatio >= 0.32 && directionalCount >= 2) {
    status = "watch";
  }

  return evidence(
    "body-quality",
    "Body quality",
    status,
    20,
    round(bodyRatio),
    `${directionalCount} of ${candles.length} candles closed in the signal direction`
  );
}

function wickRiskEvidence(direction: KlineDirection, candles: KlineCandle[]): KlineEvidence {
  const rangeTotal = candles.reduce((total, candle) => total + candle.high - candle.low, 0);
  const riskyWickTotal = candles.reduce((total, candle) => {
    if (direction === "long") return total + candle.high - Math.max(candle.open, candle.close);
    return total + Math.min(candle.open, candle.close) - candle.low;
  }, 0);
  const wickRatio = rangeTotal > 0 ? riskyWickTotal / rangeTotal : 1;
  let status: KlineEvidenceStatus = "fail";

  if (wickRatio <= 0.25) {
    status = "pass";
  } else if (wickRatio <= 0.4) {
    status = "watch";
  }

  return evidence(
    "wick-risk",
    "Opposite wick risk",
    status,
    15,
    round(wickRatio),
    "Opposite-side rejection stayed within the recent candle range"
  );
}

function atrDistanceEvidence(
  direction: KlineDirection,
  lastClose: number,
  signalPrice: number,
  atr: number
): KlineEvidence {
  const distance = direction === "long"
    ? (lastClose - signalPrice) / atr
    : (signalPrice - lastClose) / atr;
  let status: KlineEvidenceStatus = "fail";

  if (distance >= 0 && distance <= 1.5) {
    status = "pass";
  } else if (distance > -0.25 && distance <= 2.5) {
    status = "watch";
  }

  return evidence(
    "atr-distance",
    "ATR distance",
    status,
    15,
    round(distance),
    "Last close is measured against the signal price in ATR units"
  );
}

function evidence(
  key: string,
  label: string,
  status: KlineEvidenceStatus,
  weight: number,
  value: number,
  message: string
): KlineEvidence {
  return {
    key,
    label,
    status,
    weight,
    score: statusScore(status, weight),
    value,
    message
  };
}

function statusScore(status: KlineEvidenceStatus, weight: number): number {
  if (status === "pass") return weight;
  if (status === "watch") return weight * 0.55;
  return 0;
}

function isInvalidated(
  direction: KlineDirection,
  lastClose: number,
  previousClose: number,
  signalPrice: number,
  band: KlineBandPoint,
  atr: number
): boolean {
  if (direction === "long") {
    const priceFailed = lastClose < signalPrice - atr * 0.35;
    const bandFailed = lastClose < band.basis && previousClose < band.basis;
    return priceFailed && bandFailed;
  }

  const priceFailed = lastClose > signalPrice + atr * 0.35;
  const bandFailed = lastClose > band.basis && previousClose > band.basis;
  return priceFailed && bandFailed;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
