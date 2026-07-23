const TIMEFRAME_MS = {
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000
} as const;

export type FormalSignalSource = "realtime" | "reconciliation";

export type FormalSignalJob = {
  key: string;
  symbol: string;
  timeframe: keyof typeof TIMEFRAME_MS;
  klineOpenTime: number;
  closedAt: Date;
  enqueuedAt: Date;
  source: FormalSignalSource;
};

export type ClosedBinanceKline = {
  t: number;
  T: number;
  s: string;
  i: string;
  x: boolean;
};

function normalizeFormalTimeframe(timeframe: string): keyof typeof TIMEFRAME_MS {
  if (timeframe in TIMEFRAME_MS) return timeframe as keyof typeof TIMEFRAME_MS;
  throw new Error(`unsupported_formal_timeframe:${timeframe}`);
}

function timeframeMs(timeframe: string): number {
  return TIMEFRAME_MS[normalizeFormalTimeframe(timeframe)];
}

export function formalSignalJobKey(symbol: string, timeframe: string, klineOpenTime: number): string {
  return `${symbol}:${timeframe}:${klineOpenTime}`;
}

export function expectedFormalBarTime(timeframe: string, closedAt: Date): number {
  const duration = timeframeMs(timeframe);
  return Math.floor(closedAt.getTime() / duration) * duration - duration;
}

export function formalSignalJobFromClosedKline(
  kline: ClosedBinanceKline,
  now = new Date()
): FormalSignalJob | null {
  if (!kline.x) return null;
  const timeframe = normalizeFormalTimeframe(kline.i);
  const symbol = kline.s.trim().toUpperCase();
  const closedAt = new Date(kline.T + 1);
  const expectedOpen = expectedFormalBarTime(timeframe, closedAt);
  if (kline.t !== expectedOpen) {
    throw new Error(
      `unexpected_closed_kline_boundary:${symbol}:${timeframe}:expected=${expectedOpen}:actual=${kline.t}`
    );
  }
  return {
    key: formalSignalJobKey(symbol, timeframe, kline.t),
    symbol,
    timeframe,
    klineOpenTime: kline.t,
    closedAt,
    enqueuedAt: now,
    source: "realtime"
  };
}

export function closedCandleOpenTimesBetween(
  timeframe: string,
  fromExclusive: Date,
  toInclusive: Date
): number[] {
  const duration = timeframeMs(timeframe);
  const openTimes: number[] = [];
  let openTime = Math.floor(fromExclusive.getTime() / duration) * duration;

  while (openTime + duration <= toInclusive.getTime()) {
    if (openTime + duration > fromExclusive.getTime()) openTimes.push(openTime);
    openTime += duration;
  }

  return openTimes;
}
