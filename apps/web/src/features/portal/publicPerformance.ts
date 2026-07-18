import type { PublicSignal } from "./publicPortalApi";

export type TrackRecordRow = {
  id: string;
  symbol: string;
  direction: string;
  score: number;
  time: string;
  return15m: string;
  return1h: string;
  return24h: "会员解锁" | string;
  pending: boolean;
  completionStatus: "pending" | "completed";
};

type PublicPerformanceInput = {
  loading: boolean;
  error: string | Error | null;
  staleAt: string | null;
  rows: TrackRecordRow[];
};

export type PublicPerformanceState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; rows: TrackRecordRow[]; staleAt: string | null }
  | { kind: "unavailable"; message: string; cached: TrackRecordRow[]; staleAt: string | null };

export function formatPublicPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "计算中";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

export function toTrackRecordRow(signal: PublicSignal): TrackRecordRow {
  const performance = signal.performance;
  const displayReturn = (window: string) =>
    performance?.access?.lockedFields.includes(window) ? "会员解锁" : formatPublicPercent(performance?.returns[window]);
  return {
    id: signal.id,
    symbol: signal.symbol,
    direction: signal.direction,
    score: signal.score,
    time: signal.time,
    return15m: displayReturn("15m"),
    return1h: displayReturn("1h"),
    return24h: displayReturn("24h"),
    pending: performance?.outcomeStatus !== "completed",
    completionStatus: performance?.outcomeStatus === "completed" ? "completed" : "pending"
  };
}

export function publicPerformanceState(input: PublicPerformanceInput): PublicPerformanceState {
  if (input.error) {
    return {
      kind: "unavailable",
      message: typeof input.error === "string" ? input.error : input.error.message,
      cached: input.rows,
      staleAt: input.staleAt
    };
  }
  if (input.loading && input.rows.length === 0) return { kind: "loading" };
  if (input.rows.length === 0) return { kind: "empty" };
  return { kind: "ready", rows: input.rows, staleAt: input.staleAt };
}
