import { UserRecord } from "../shared/mocks";

export type PlanEntitlementRecord = {
  plan?: string | null;
  dailySignalQuota?: number | null;
  supportsFeishu?: boolean | null;
  supportsApi?: boolean | null;
  supportsTeam?: boolean | null;
  maxWatchlistSymbols?: number | null;
  allowedTimeframes?: string[] | null;
  realtimeDelayHours?: number | null;
  historyDays?: number | null;
  minAlertScore?: number | null;
  maxPushPerDay?: number | null;
  supportsSignalOutcomes?: boolean | null;
};

export type UserEntitlements = {
  plan: string;
  formalSignalAccess: "delayed" | "realtime";
  formalSignalDelayHours: number;
  formalSignalHistoryDays: number;
  intrabarPreview: boolean;
  maxScanSymbols: number;
  maxWatchlistSymbols: number;
  dailySignalQuota: number;
  remainingSignals: number;
  dailyPushUsed: number;
  dailyPushSkipped: number;
  dailyPushFailed: number;
  remainingDailyPushes: number;
  feishuAlerts: boolean;
  apiAccess: boolean;
  teamSeats: number;
  minAlertScore: number;
  allowedTimeframes: string[];
  realtimeDelayHours: number;
  historyDays: number;
  maxPushPerDay: number;
  signalOutcomes: boolean;
};

type PlanLimits = Omit<UserEntitlements, "plan" | "remainingSignals" | "dailyPushUsed" | "dailyPushSkipped" | "dailyPushFailed" | "remainingDailyPushes">;

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    formalSignalAccess: "delayed",
    formalSignalDelayHours: 8,
    formalSignalHistoryDays: 7,
    intrabarPreview: false,
    maxScanSymbols: 5,
    maxWatchlistSymbols: 5,
    dailySignalQuota: 10,
    feishuAlerts: false,
    apiAccess: false,
    teamSeats: 0,
    minAlertScore: 80,
    allowedTimeframes: ["5m"],
    realtimeDelayHours: 8,
    historyDays: 7,
    maxPushPerDay: 0,
    signalOutcomes: false
  },
  vip: {
    formalSignalAccess: "realtime",
    formalSignalDelayHours: 0,
    formalSignalHistoryDays: 30,
    intrabarPreview: false,
    maxScanSymbols: 50,
    maxWatchlistSymbols: 50,
    dailySignalQuota: 300,
    feishuAlerts: true,
    apiAccess: false,
    teamSeats: 1,
    minAlertScore: 65,
    allowedTimeframes: ["5m", "15m"],
    realtimeDelayHours: 0,
    historyDays: 30,
    maxPushPerDay: 300,
    signalOutcomes: true
  },
  svip: {
    formalSignalAccess: "realtime",
    formalSignalDelayHours: 0,
    formalSignalHistoryDays: 180,
    intrabarPreview: false,
    maxScanSymbols: 200,
    maxWatchlistSymbols: 200,
    dailySignalQuota: 2000,
    feishuAlerts: true,
    apiAccess: true,
    teamSeats: 5,
    minAlertScore: 65,
    allowedTimeframes: ["5m", "15m", "30m", "1h", "4h"],
    realtimeDelayHours: 0,
    historyDays: 180,
    maxPushPerDay: 2000,
    signalOutcomes: true
  }
};

export function buildEntitlements(user: UserRecord, planOverride?: PlanEntitlementRecord | null): UserEntitlements {
  const planName = user.plan || "Free";
  const planKey = planName.toLowerCase();
  const fallback = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;
  const dailySignalQuota = tightenNumericLimit(fallback.dailySignalQuota, planOverride?.dailySignalQuota, user.signalQuota);
  const maxWatchlistSymbols = tightenNumericLimit(fallback.maxWatchlistSymbols, planOverride?.maxWatchlistSymbols);
  const allowedTimeframes = normalizeAllowedTimeframes(planOverride?.allowedTimeframes, fallback.allowedTimeframes);
  const supportsFeishu = tightenBooleanLimit(fallback.feishuAlerts, planOverride?.supportsFeishu);
  const supportsApi = tightenBooleanLimit(fallback.apiAccess, planOverride?.supportsApi);
  const supportsTeam = tightenBooleanLimit(fallback.teamSeats > 0, planOverride?.supportsTeam);
  const configuredMaxPushPerDay = tightenNumericLimit(fallback.maxPushPerDay, planOverride?.maxPushPerDay);
  const maxPushPerDay = supportsFeishu ? configuredMaxPushPerDay : 0;
  const minAlertScore = tightenMinimumScore(fallback.minAlertScore, planOverride?.minAlertScore);
  const signalOutcomes = tightenBooleanLimit(fallback.signalOutcomes, planOverride?.supportsSignalOutcomes);

  return {
    plan: planName,
    formalSignalAccess: fallback.formalSignalAccess,
    formalSignalDelayHours: fallback.formalSignalDelayHours,
    formalSignalHistoryDays: fallback.formalSignalHistoryDays,
    intrabarPreview: fallback.intrabarPreview,
    maxScanSymbols: maxWatchlistSymbols,
    maxWatchlistSymbols,
    dailySignalQuota,
    remainingSignals: Math.max(0, dailySignalQuota - user.signalUsed),
    dailyPushUsed: user.signalUsed,
    dailyPushSkipped: 0,
    dailyPushFailed: 0,
    remainingDailyPushes: Math.max(0, maxPushPerDay - user.signalUsed),
    feishuAlerts: supportsFeishu && user.feishuEnabled,
    apiAccess: supportsApi,
    teamSeats: supportsTeam ? fallback.teamSeats : 0,
    minAlertScore,
    allowedTimeframes,
    realtimeDelayHours: fallback.formalSignalDelayHours,
    historyDays: fallback.formalSignalHistoryDays,
    maxPushPerDay,
    signalOutcomes
  };
}

function normalizeAllowedTimeframes(value: string[] | null | undefined, fallback: string[]) {
  const timeframes = (value === null || value === undefined ? fallback : value)
    .map((timeframe) => String(timeframe || "").trim().toLowerCase())
    .filter(Boolean);
  const planTimeframes = new Set(fallback);
  return Array.from(new Set(timeframes)).filter((timeframe) => planTimeframes.has(timeframe));
}

function tightenNumericLimit(cap: number, ...overrides: Array<number | null | undefined>) {
  return overrides.reduce<number>((limit, override) => {
    if (override === null || override === undefined) return limit;
    const numeric = Number(override);
    return Number.isFinite(numeric) ? Math.min(limit, Math.max(0, numeric)) : limit;
  }, cap);
}

function tightenBooleanLimit(planAllows: boolean, override: boolean | null | undefined) {
  return planAllows && override !== false;
}

function tightenMinimumScore(floor: number, override: number | null | undefined) {
  if (override === null || override === undefined || !Number.isFinite(Number(override))) return floor;
  return Math.max(floor, Math.min(100, Number(override)));
}
