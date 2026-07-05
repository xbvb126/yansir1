import { Candle } from "./market.types";

export type KlineStreamTimeframe = "5m" | "15m" | "1h" | "4h";

export type KlineStreamRequest = {
  symbol: string;
  displaySymbol: string;
  timeframe: KlineStreamTimeframe;
};

export type KlineStreamEvent = KlineStreamRequest & {
  source: "binance-spot-stream";
  closed: boolean;
  eventTime?: number;
  candle: Candle;
};

type BinanceKlineEnvelope = {
  stream?: string;
  data?: {
    e?: string;
    E?: number;
    s?: string;
    k?: {
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
  };
};

const DEFAULT_STREAM_BASE_URL = "wss://data-stream.binance.vision/stream";
const VALID_TIMEFRAMES = new Set<KlineStreamTimeframe>(["5m", "15m", "1h", "4h"]);

export function normalizeKlineStreamRequest(symbol = "BTCUSDT", timeframe = "5m"): KlineStreamRequest {
  const normalizedSymbol = normalizeMarketSymbol(symbol);
  const normalizedTimeframe = normalizeStreamTimeframe(timeframe);
  return {
    symbol: normalizedSymbol,
    displaySymbol: normalizedSymbol.replace(/USDT$/u, ""),
    timeframe: normalizedTimeframe
  };
}

export function buildKlineStreamUrl(request: Pick<KlineStreamRequest, "symbol" | "timeframe">, baseUrl = DEFAULT_STREAM_BASE_URL) {
  const url = new URL(baseUrl);
  url.searchParams.set("streams", `${request.symbol.toLowerCase()}@kline_${request.timeframe}`);
  return url.toString();
}

export function parseKlineStreamMessage(raw: unknown): KlineStreamEvent | null {
  let payload: BinanceKlineEnvelope;
  try {
    payload = typeof raw === "string" ? JSON.parse(raw) as BinanceKlineEnvelope : raw as BinanceKlineEnvelope;
  } catch {
    return null;
  }

  const data = payload?.data;
  const kline = data?.k;
  if (data?.e !== "kline" || !kline?.s || !kline.i) return null;

  const request = normalizeKlineStreamRequest(kline.s, kline.i);
  const candle = normalizeStreamCandle(kline);
  if (!candle) return null;

  return {
    ...request,
    source: "binance-spot-stream",
    closed: Boolean(kline.x),
    eventTime: typeof data.E === "number" ? data.E : undefined,
    candle
  };
}

function normalizeMarketSymbol(symbol: string) {
  const clean = String(symbol || "BTC").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.endsWith("USDT") ? clean : `${clean || "BTC"}USDT`;
}

function normalizeStreamTimeframe(timeframe: string): KlineStreamTimeframe {
  const clean = String(timeframe || "5m").trim().toLowerCase();
  return VALID_TIMEFRAMES.has(clean as KlineStreamTimeframe) ? clean as KlineStreamTimeframe : "5m";
}

function normalizeStreamCandle(kline: NonNullable<NonNullable<BinanceKlineEnvelope["data"]>["k"]>): Candle | null {
  const openTime = Number(kline.t);
  const closeTime = Number(kline.T);
  const open = parsePositiveNumber(kline.o);
  const high = parsePositiveNumber(kline.h);
  const low = parsePositiveNumber(kline.l);
  const close = parsePositiveNumber(kline.c);
  const volume = parsePositiveNumber(kline.v) ?? 0;

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
    open_time: openTime,
    close_time: closeTime,
    open,
    high,
    low,
    close,
    volume
  };
}

function parsePositiveNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
