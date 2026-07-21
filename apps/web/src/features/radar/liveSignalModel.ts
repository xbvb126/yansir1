export type LiveSignalDirection = "long" | "short" | "neutral";
export type LiveSignalTone = "opportunity" | "risk" | "watch";
export type LiveSignalFilter = "now" | "long" | "risk" | "watch";
export type StrategyListeningStatus = "live" | "degraded" | "paused";
export type LiveSignalSource = "strategy" | "market";

export type RawRadarSignal = {
  id?: string;
  symbol?: string;
  name?: string;
  direction?: string;
  action?: string | null;
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
  timeframe?: string;
  triggerPrice?: number | string;
  price?: number | string;
  change24h?: number | string;
  source?: LiveSignalSource;
  payload?: {
    action?: string | null;
    reducePct?: number | null;
    reduce_pct?: number | null;
  };
};

export type LiveSignal = {
  id: string;
  symbol: string;
  name: string;
  direction: LiveSignalDirection;
  tone: LiveSignalTone;
  score: number;
  confidence: number;
  action?: string | null;
  risk: string;
  status: string;
  strategyName: string;
  trigger: string;
  generatedAt: string;
  timeframe?: string;
  triggerPrice?: number | string;
  price?: number | string;
  change24h?: number | string;
  source: LiveSignalSource;
};

export type SignalFact = {
  label: string;
  value: string;
  emphasis?: boolean;
};

const directionCopy: Record<LiveSignalDirection, string> = {
  long: "做多",
  short: "做空",
  neutral: "观望",
};

const statusCopy: Record<string, string> = {
  active: "生效中",
  ready: "已就绪",
  scanning: "扫描中",
  idle: "待命中",
  "no-signal": "暂无信号",
  error: "异常",
  live: "监听中",
  degraded: "延迟",
  paused: "暂停",
  watch: "观察中",
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
  const raw = `${signal.direction ?? resolveSignalAction(signal) ?? signal.side ?? ""}`.toLowerCase();
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
  const action = resolveSignalAction(signal);
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
    action,
    risk: signal.risk ?? "策略风险模型",
    status: signal.status ?? "active",
    strategyName: signal.strategyName ?? signal.strategy ?? "Yansir 策略",
    trigger: signal.trigger ?? signal.reason ?? signal.body ?? signal.title ?? "策略触发已确认",
    generatedAt,
    timeframe: signal.timeframe,
    triggerPrice: signal.triggerPrice ?? signal.price,
    price: signal.price,
    change24h: signal.change24h,
    source: signal.source === "market" ? "market" : "strategy",
  };
}

function resolveSignalAction(signal: RawRadarSignal): string | null {
  return signal.action ?? signal.payload?.action ?? null;
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
    { label: "信号来源", value: "Yansir 策略引擎", emphasis: true },
    { label: "币种", value: signal.symbol, emphasis: true },
    { label: "方向", value: formatDirectionLabel(signal.direction), emphasis: signal.direction !== "neutral" },
    { label: "策略分", value: `${signal.score}/100`, emphasis: true },
    { label: "置信度", value: `${signal.confidence}/100` },
    { label: "风险", value: signal.risk },
    { label: "触发原因", value: signal.trigger },
    { label: "AI 边界", value: "仅用于解释和复核；策略信号保持最高优先级。" },
  ];
}

export function formatDirectionLabel(direction: LiveSignalDirection): string {
  return directionCopy[direction];
}

export function formatSignalStatus(status: string): string {
  const cleanStatus = status.trim().toLowerCase();
  return statusCopy[cleanStatus] ?? status;
}

export function formatSignalTime(isoTime: string, now = Date.now()): string {
  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) return "时间未知";
  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}秒前`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}小时前`;
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
