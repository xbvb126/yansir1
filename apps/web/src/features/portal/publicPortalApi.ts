import { apiGet } from "../../lib/api";

export type PublicSignal = {
  id: string;
  symbol: string;
  rawSymbol: string;
  direction: "long" | "short";
  score: number;
  time: string;
  title: string;
  reason: string;
  engine?: string;
  performance: {
    returns: Record<string, number | null>;
    outcomeStatus?: "pending" | "completed" | null;
    access?: { previewOnly: boolean; lockedFields: string[] };
  } | null;
};

export type PublicSignalsResponse = {
  signals: PublicSignal[];
  delayHours: 8;
  historyDays: 7;
  access: { performancePreviewOnly: true; lockedPerformanceFields: string[] };
  pagination: { page: number; limit: number; total: number; hasMore: boolean; nextPage: number | null };
};

export type PublicPerformanceSummary = {
  windowDays: 7;
  generatedAt: string;
  methodologyVersion: string;
  totalSignals: number;
  completed24hCount: number;
  pending24hCount: number;
  directionalHitRate1h: number | null;
  averageDirectionalReturn1h: number | null;
};

export type PublicSignalsQuery = Record<string, string | number | readonly string[] | null | undefined>;

export function getPublicSignals(query: PublicSignalsQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else {
      params.set(key, String(value));
    }
  }
  return apiGet<PublicSignalsResponse>(`/api/strategy/public-signals?${params}`);
}

export function getPublicPerformanceSummary() {
  return apiGet<PublicPerformanceSummary>("/api/strategy/public-performance-summary");
}
