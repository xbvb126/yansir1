export type LiveSignalDirection = "long" | "short" | "neutral";
export type LiveSignalTone = "opportunity" | "risk" | "watch";
export type LiveSignalFilter = "now" | "long" | "risk" | "watch";
export type StrategyListeningStatus = "live" | "degraded" | "paused";

export type RawRadarSignal = {
  id?: string;
  symbol?: string;
  name?: string;
  direction?: string;
  action?: string;
  side?: string;
  score?: number;
  confidence?: number | string;
  strength?: number;
  risk?: string;
  status?: string;
  strategy?: string;
  strategyName?: string;
  trigger?: string;
  reason?: string;
  title?: string;
  body?: string;
  generatedAt?: string;
  createdAt?: string;
  timestamp?: string | number;
  time?: string;
  price?: number | string;
  change24h?: number | string;
};

export type LiveSignal = {
  id: string;
  symbol: string;
  name: string;
  direction: LiveSignalDirection;
  tone: LiveSignalTone;
  score: number;
  confidence: number;
  risk: string;
  status: string;
  strategyName: string;
  trigger: string;
  generatedAt: string;
  price?: number | string;
  change24h?: number | string;
  source: "strategy";
};

export type SignalFact = {
  label: string;
  value: string;
  emphasis?: boolean;
};

const riskWords = [
  "risk",
  "danger",
  "stop",
  "drawdown",
  "\u98ce\u9669",
  "\u6b62\u635f",
  "\u9ad8\u98ce\u9669",
];

export function normalizeDirection(signal: RawRadarSignal): LiveSignalDirection {
  const raw = `${signal.direction ?? signal.action ?? signal.side ?? ""}`.toLowerCase();
  if (raw.includes("short") || raw.includes("sell") || raw.includes("\u7a7a")) return "short";
  if (raw.includes("long") || raw.includes("buy") || raw.includes("\u591a")) return "long";
  return "neutral";
}

export function normalizeScore(value: number | string | undefined, fallback = 0): number {
  const numericValue = typeof value === "string" ? Number.parseFloat(value) : value;
  if (typeof numericValue !== "number" || Number.isNaN(numericValue)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export function resolveSignalTone(signal: RawRadarSignal): LiveSignalTone {
  const riskText = `${signal.risk ?? ""} ${signal.status ?? ""} ${signal.reason ?? ""} ${signal.body ?? ""}`.toLowerCase();
  if (riskWords.some((word) => riskText.includes(word.toLowerCase()))) return "risk";
  if (signal.status?.toLowerCase().includes("watch")) return "watch";
  return "opportunity";
}

export function toLiveSignal(signal: RawRadarSignal, index: number): LiveSignal {
  const direction = normalizeDirection(signal);
  const score = normalizeScore(signal.score ?? signal.strength, 50);
  const confidence = normalizeScore(signal.confidence, score);
  const generatedAt = normalizeGeneratedAt(signal);
  const symbol = (signal.symbol ?? "UNKNOWN").toUpperCase();

  return {
    id: signal.id ?? `${symbol}-${generatedAt}-${index}`,
    symbol,
    name: signal.name ?? symbol,
    direction,
    tone: resolveSignalTone(signal),
    score,
    confidence,
    risk: signal.risk ?? "Strategy risk model",
    status: signal.status ?? "active",
    strategyName: signal.strategyName ?? signal.strategy ?? "Yansir Strategy",
    trigger: signal.trigger ?? signal.reason ?? signal.body ?? signal.title ?? "Strategy trigger confirmed",
    generatedAt,
    price: signal.price,
    change24h: signal.change24h,
    source: "strategy",
  };
}

export function sortLiveSignals(signals: LiveSignal[]): LiveSignal[] {
  return [...signals].sort((a, b) => {
    const timeDelta = Date.parse(b.generatedAt) - Date.parse(a.generatedAt);
    if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
    return b.score - a.score;
  });
}

export function filterLiveSignals(signals: LiveSignal[], filter: LiveSignalFilter): LiveSignal[] {
  if (filter === "long") return signals.filter((signal) => signal.direction === "long");
  if (filter === "risk") return signals.filter((signal) => signal.tone === "risk");
  if (filter === "watch") return signals.filter((signal) => signal.tone === "watch");
  return signals;
}

export function buildSelectedSignalFacts(signal: LiveSignal): SignalFact[] {
  return [
    { label: "Signal source", value: "Yansir strategy engine", emphasis: true },
    { label: "Symbol", value: signal.symbol, emphasis: true },
    { label: "Direction", value: signal.direction.toUpperCase(), emphasis: signal.direction !== "neutral" },
    { label: "Score", value: `${signal.score}/100`, emphasis: true },
    { label: "Confidence", value: `${signal.confidence}/100` },
    { label: "Risk", value: signal.risk },
    { label: "Trigger", value: signal.trigger },
    { label: "AI role", value: "Explain and review only; strategy signal remains authoritative." },
  ];
}

export function formatSignalTime(isoTime: string, now = Date.now()): string {
  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) return "time unavailable";
  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}

function normalizeGeneratedAt(signal: RawRadarSignal): string {
  const rawTime = signal.generatedAt ?? signal.createdAt ?? signal.timestamp ?? signal.time;
  if (typeof rawTime === "number") return new Date(rawTime).toISOString();
  if (typeof rawTime === "string") {
    const parsed = Date.parse(rawTime);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
}
