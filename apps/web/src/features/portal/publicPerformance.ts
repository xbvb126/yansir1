import type { PublicPerformanceSummary, PublicSignal } from "./publicPortalApi";

export type TrustSummaryView = {
  hitRate: string;
  averageReturn: string;
  sampleCount: string;
  sampleCaption: string;
  isEmpty: boolean;
};

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

function formatPercent(value: number | null | undefined, digits: number, signed: boolean) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "计算中";
  const percent = value * 100;
  const sign = signed && percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits)}%`;
}

export function toTrustSummaryView(summary: PublicPerformanceSummary): TrustSummaryView {
  const isEmpty = summary.totalSignals === 0;
  return {
    hitRate: formatPercent(isEmpty ? null : summary.directionalHitRate1h, 1, false),
    averageReturn: formatPercent(isEmpty ? null : summary.averageDirectionalReturn1h, 2, true),
    sampleCount: summary.totalSignals.toLocaleString("en-US"),
    sampleCaption: isEmpty ? "暂无满足公开条件的样本" : "公开信号样本",
    isEmpty,
  };
}

type TrackRecordEmptyContext = {
  symbol: string;
  direction: "all" | "long" | "short";
  delayHours: number | null;
  historyDays: number | null;
};

export function describeTrackRecordEmptyState(context: TrackRecordEmptyContext): string {
  const symbol = context.symbol || "全部币种";
  const direction = context.direction === "long" ? "看多" : context.direction === "short" ? "看空" : "全部方向";
  const publicBounds = context.delayHours === null && context.historyDays === null
    ? "服务端延迟与公开历史范围读取中"
    : [
        context.delayHours === null ? "服务端延迟读取中" : `公开信号延迟 ${context.delayHours} 小时`,
        context.historyDays === null ? "公开历史范围读取中" : `历史范围 ${context.historyDays} 天`
      ].join("，");
  const retry = context.symbol || context.direction !== "all" ? "可清空币种或切换方向后重试" : "可调整筛选后重试";
  return `当前筛选：${symbol} · ${direction}。${publicBounds}；${retry}，系统不会补造信号。`;
}

export function publicReturnTone(value: string): "positive" | "negative" | "neutral" | "locked" {
  if (value === "会员解锁") return "locked";
  if (value.startsWith("+")) return "positive";
  if (value.startsWith("-")) return "negative";
  return "neutral";
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
