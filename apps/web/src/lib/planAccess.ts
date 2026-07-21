export type FrontendUserLike = {
  id?: string;
  role?: string;
  plan?: string;
};

export type FrontendEntitlementsLike = {
  plan?: string;
  feishuAlerts?: boolean;
  maxPushPerDay?: number;
  dailySignalQuota?: number;
  teamSeats?: number;
  allowedTimeframes?: string[];
  signalOutcomes?: boolean;
};

export type RouteAccessPromptLike<View extends string = string> = {
  title: string;
  desc: string;
  targetView: View;
  fallbackView: View;
  actionLabel?: string;
};

export type PerformanceLike = {
  entryPrice?: number | null;
  prices?: Record<string, number | null | undefined>;
  returns?: Record<string, number | null | undefined>;
  maxFavorablePct?: number | null;
  maxAdversePct?: number | null;
  outcomeStatus?: string | null;
  evaluatedUntil?: string | null;
  updatedAt?: string | null;
} | null;

const PUBLIC_VIEWS = ["data", "claw", "radar", "account", "plans", "login", "register"];
const LOCKED_PERFORMANCE_FIELDS = ["4h", "24h", "maxFavorablePct", "maxAdversePct"];

export function planLevel(plan?: string) {
  const normalized = String(plan || "free").toLowerCase();
  if (normalized.includes("svip") || normalized.includes("pro") || normalized.includes("高级")) return 3;
  if (normalized.includes("vip") || normalized.includes("基础")) return 2;
  return 1;
}

export function isSignedInUser(user: FrontendUserLike) {
  return Boolean(user.id && user.role !== "guest");
}

export function routeAccessPrompt<View extends string>(view: View, user: FrontendUserLike, entitlements: FrontendEntitlementsLike): RouteAccessPromptLike<View> | null {
  const signedIn = isSignedInUser(user);
  const planName = entitlements.plan || user.plan || "Free";
  const dailyPushLimit = Number(entitlements.maxPushPerDay ?? entitlements.dailySignalQuota ?? 0);
  const pushAllowed = Boolean(entitlements.feishuAlerts) && dailyPushLimit > 0;
  const teamSeats = Number(entitlements.teamSeats || 0);

  if (PUBLIC_VIEWS.includes(view)) return null;

  if (view === "signal") {
    if (!signedIn) {
      return {
        title: "登录后打开告警中心",
        desc: "未登录只能查看 8 小时延迟的公开历史信号。登录并配置自选币种后，才能管理实时推送。",
        targetView: "login" as View,
        fallbackView: "account" as View,
        actionLabel: "去登录"
      };
    }
    if (!pushAllowed) {
      return {
        title: "升级打开实时告警中心",
        desc: `当前 ${planName} 套餐不含实时推送或每日推送额度为 0。升级后可配置飞书 Webhook、最低分数、冷却时间和每日推送额度。`,
        targetView: "plans" as View,
        fallbackView: "account" as View
      };
    }
  }

  if (view === "team") {
    if (!signedIn) {
      return {
        title: "登录后使用团队管理",
        desc: "团队邀请、佣金和成员数据需要登录账号后查看。",
        targetView: "login" as View,
        fallbackView: "account" as View,
        actionLabel: "去登录"
      };
    }
    if (teamSeats <= 1) {
      return {
        title: "升级解锁团队管理",
        desc: `当前 ${planName} 套餐没有团队席位。升级后可管理邀请链接、团队成员和佣金数据。`,
        targetView: "plans" as View,
        fallbackView: "account" as View
      };
    }
  }

  if (view === "kline-lab" && user.role !== "admin") {
    return {
      title: signedIn ? "当前账号无内部验信权限" : "登录管理员账号",
      desc: signedIn ? "内部验信实验室仅管理员可访问。请切换管理员账号，或返回账号中心。" : "内部验信实验室仅管理员账号可访问，请先登录。",
      targetView: (signedIn ? "account" : "login") as View,
      fallbackView: "account" as View,
      actionLabel: signedIn ? "返回我的" : "去登录"
    };
  }

  if (view === "admin" && user.role !== "admin") {
    return {
      title: signedIn ? "当前账号无后台权限" : "登录管理员账号",
      desc: signedIn ? "后台运营页面仅管理员可访问。请切换管理员账号，或返回账户中心。" : "后台运营页面仅管理员账号可访问，请先登录。",
      targetView: (signedIn ? "account" : "login") as View,
      fallbackView: "account" as View,
      actionLabel: signedIn ? "返回我的" : "去登录"
    };
  }

  return null;
}

export function isTimeframeAllowed(timeframe: string, entitlements: FrontendEntitlementsLike) {
  const allowed = entitlements.allowedTimeframes?.length ? entitlements.allowedTimeframes : ["5m"];
  return allowed.includes(timeframe);
}

export function canAddWatchlistSymbol(limits: { maxWatchlistSymbols?: number; activeSymbolCount?: number }, alreadySelected = false) {
  if (alreadySelected) return true;
  const max = Number(limits.maxWatchlistSymbols ?? 0);
  if (max <= 0) return false;
  return Number(limits.activeSymbolCount ?? 0) < max;
}

export function canUseFullPerformance(entitlements: FrontendEntitlementsLike) {
  return Boolean(entitlements.signalOutcomes) || planLevel(entitlements.plan) >= 2;
}

export function visiblePerformanceForEntitlements(performance: PerformanceLike, entitlements: FrontendEntitlementsLike) {
  if (!performance) return null;
  if (canUseFullPerformance(entitlements)) {
    return {
      ...performance,
      lockedFields: [],
      previewOnly: false
    };
  }
  const returns = performance.returns || {};
  return {
    ...performance,
    returns: {
      "15m": returns["15m"] ?? null,
      "1h": returns["1h"] ?? null
    },
    maxFavorablePct: null,
    maxAdversePct: null,
    lockedFields: [...LOCKED_PERFORMANCE_FIELDS],
    previewOnly: true
  };
}
