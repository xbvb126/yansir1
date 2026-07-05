import type { KlineCandle, KlineConfirmationResult } from "./klineConfirmation";

export type LabTimeframe = KlineConfirmationResult["timeframe"];

export type KlineStreamEvent = {
  symbol: string;
  timeframe: LabTimeframe;
  candle: KlineCandle;
  closed: boolean;
  source?: string;
};

type BinanceKlinePayload = {
  t?: number;
  T?: number;
  s?: string;
  i?: string;
  o?: string | number;
  h?: string | number;
  l?: string | number;
  c?: string | number;
  v?: string | number;
  x?: boolean;
};

const BINANCE_KLINE_STREAM_URL = "wss://stream.binance.com:9443/stream";

export const KLINE_TIMEFRAME_MS: Record<LabTimeframe, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000
};

export function buildBinanceKlineStreamUrl(symbol: string, timeframe: string, baseUrl = BINANCE_KLINE_STREAM_URL): string {
  const url = new URL(baseUrl);
  const streamSymbol = normalizeStreamSymbol(symbol).toLowerCase();
  const streamTimeframe = normalizeRealtimeTimeframe(timeframe);
  url.searchParams.set("streams", `${streamSymbol}@kline_${streamTimeframe}`);
  return url.toString();
}

export function parseBinanceKlineStreamEvent(payload: unknown): KlineStreamEvent | null {
  const record = asRecord(payload);
  const data = asRecord(record?.data) ?? record;
  if (data?.e !== "kline") return null;

  const kline = asRecord(data.k) as BinanceKlinePayload | null;
  if (!kline) return null;

  const openTime = Number(kline.t);
  const closeTime = Number(kline.T);
  const open = parseMarketPrice(kline.o);
  const high = parseMarketPrice(kline.h);
  const low = parseMarketPrice(kline.l);
  const close = parseMarketPrice(kline.c);
  const volume = parseMarketPrice(kline.v) ?? 0;

  if (
    !Number.isFinite(openTime)
    || !Number.isFinite(closeTime)
    || open == null
    || high == null
    || low == null
    || close == null
    || high < low
    || Math.max(open, close) > high
    || Math.min(open, close) < low
  ) {
    return null;
  }

  return {
    symbol: normalizeDisplaySymbol(String(kline.s || data.s || "")),
    timeframe: normalizeRealtimeTimeframe(String(kline.i || "")),
    closed: Boolean(kline.x),
    source: "binance-spot-stream",
    candle: {
      open_time: openTime,
      close_time: closeTime,
      open,
      high,
      low,
      close,
      volume
    }
  };
}

export function parseYansirKlineStreamEvent(payload: unknown): KlineStreamEvent | null {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  const record = asRecord(parsed);
  const candleRecord = asRecord(record?.candle);
  if (!record || !candleRecord) return null;

  const symbol = normalizeDisplaySymbol(String(record.symbol || record.displaySymbol || ""));
  const timeframe = normalizeRealtimeTimeframe(String(record.timeframe || ""));
  const candle = normalizeStreamCandle(candleRecord);
  if (!candle) return null;

  return {
    symbol,
    timeframe,
    candle,
    closed: Boolean(record.closed),
    source: String(record.source || "yansir-market-proxy")
  };
}

export function parseMarketPrice(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function mergeKlineCandles(current: KlineCandle[], incoming: KlineCandle[], limit = 180): KlineCandle[] {
  const byOpenTime = new Map<number, KlineCandle>();

  [...current, ...incoming].forEach((candle) => {
    if (Number.isFinite(candle.open_time)) {
      byOpenTime.set(candle.open_time, { ...candle });
    }
  });

  return [...byOpenTime.values()]
    .sort((left, right) => left.open_time - right.open_time)
    .slice(-Math.max(1, limit));
}

export function mergeLivePriceIntoCandles(
  candles: KlineCandle[],
  price: number | null,
  timeframe: string,
  now = Date.now()
): KlineCandle[] {
  if (!Number.isFinite(price) || price == null || price <= 0 || !candles.length) {
    return candles;
  }

  const intervalMs = KLINE_TIMEFRAME_MS[normalizeRealtimeTimeframe(timeframe)];
  const latest = candles[candles.length - 1];
  const nextOpenTime = latest.open_time + intervalMs;

  if (now < nextOpenTime) {
    const updated = {
      ...latest,
      close: price,
      high: Math.max(latest.high, price),
      low: Math.min(latest.low, price)
    };
    return [...candles.slice(0, -1), updated];
  }

  const openTime = Math.max(nextOpenTime, Math.floor(now / intervalMs) * intervalMs);
  const next: KlineCandle = {
    open_time: openTime,
    close_time: openTime + intervalMs - 1,
    open: latest.close,
    high: Math.max(latest.close, price),
    low: Math.min(latest.close, price),
    close: price,
    volume: 0
  };

  return [...candles, next];
}

function normalizeRealtimeTimeframe(value: string): LabTimeframe {
  return value === "15m" || value === "1h" || value === "4h" ? value : "5m";
}

function normalizeStreamCandle(candle: Record<string, unknown>): KlineCandle | null {
  const openTime = Number(candle.open_time);
  const closeTime = candle.close_time == null ? null : Number(candle.close_time);
  const open = parseMarketPrice(candle.open);
  const high = parseMarketPrice(candle.high);
  const low = parseMarketPrice(candle.low);
  const close = parseMarketPrice(candle.close);
  const volume = parseMarketPrice(candle.volume) ?? 0;

  if (
    !Number.isFinite(openTime)
    || (closeTime != null && !Number.isFinite(closeTime))
    || open == null
    || high == null
    || low == null
    || close == null
    || high < low
    || Math.max(open, close) > high
    || Math.min(open, close) < low
  ) {
    return null;
  }

  return {
    open_time: openTime,
    close_time: closeTime,
    open,
    high,
    low,
    close,
    volume
  };
}

function normalizeStreamSymbol(symbol: string): string {
  const clean = String(symbol || "BTC").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.endsWith("USDT") ? clean : `${clean || "BTC"}USDT`;
}

function normalizeDisplaySymbol(symbol: string): string {
  return normalizeStreamSymbol(symbol).replace(/USDT$/u, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
