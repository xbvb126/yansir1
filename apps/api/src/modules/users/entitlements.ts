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
  const planName = planOverride?.plan || user.plan;
  const planKey = planName.toLowerCase();
  const fallback = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;
  const dailySignalQuota = Number(planOverride?.dailySignalQuota ?? user.signalQuota ?? fallback.dailySignalQuota);
  const maxWatchlistSymbols = Number(planOverride?.maxWatchlistSymbols ?? fallback.maxWatchlistSymbols);
  const allowedTimeframes = normalizeAllowedTimeframes(planOverride?.allowedTimeframes, fallback.allowedTimeframes);
  const supportsFeishu = Boolean(planOverride?.supportsFeishu ?? fallback.feishuAlerts);
  const supportsApi = Boolean(planOverride?.supportsApi ?? fallback.apiAccess);
  const supportsTeam = Boolean(planOverride?.supportsTeam ?? fallback.teamSeats > 0);

  return {
    plan: planName,
    maxScanSymbols: maxWatchlistSymbols,
    maxWatchlistSymbols,
    dailySignalQuota,
    remainingSignals: Math.max(0, dailySignalQuota - user.signalUsed),
    dailyPushUsed: user.signalUsed,
    dailyPushSkipped: 0,
    dailyPushFailed: 0,
    remainingDailyPushes: Math.max(0, Number(planOverride?.maxPushPerDay ?? fallback.maxPushPerDay) - user.signalUsed),
    feishuAlerts: supportsFeishu && user.feishuEnabled,
    apiAccess: supportsApi,
    teamSeats: supportsTeam ? fallback.teamSeats : 0,
    minAlertScore: Number(planOverride?.minAlertScore ?? fallback.minAlertScore),
    allowedTimeframes,
    realtimeDelayHours: Number(planOverride?.realtimeDelayHours ?? fallback.realtimeDelayHours),
    historyDays: Number(planOverride?.historyDays ?? fallback.historyDays),
    maxPushPerDay: Number(planOverride?.maxPushPerDay ?? fallback.maxPushPerDay),
    signalOutcomes: Boolean(planOverride?.supportsSignalOutcomes ?? fallback.signalOutcomes)
  };
}

function normalizeAllowedTimeframes(value: string[] | null | undefined, fallback: string[]) {
  const timeframes = (value?.length ? value : fallback)
    .map((timeframe) => String(timeframe || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(timeframes));
}
