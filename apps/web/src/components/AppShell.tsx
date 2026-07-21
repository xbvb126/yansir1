import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, setActiveUserId, setAuthToken } from "../lib/api";
import { planLevel, routeAccessPrompt } from "../lib/planAccess";
import { normalizeViewParam } from "../lib/viewRouting";
import { AIClawExperience } from "../features/claw/AIClawExperience";
import { buildAIClawPrompt } from "../features/claw/aiClawPrompts";
import { KlineLabView } from "../features/klineLab/KlineLabView";
import { LiveSignalCommand } from "../features/radar/LiveSignalCommand";
import { RadarWorkspaceChrome } from "../features/radar/RadarWorkspaceChrome";
import type { RadarCategoryItem } from "../features/radar/RadarWorkspaceChrome";
import type { LiveSignal, LiveSignalFilter, StrategyListeningStatus } from "../features/radar/liveSignalModel";
import { formatDirectionLabel, toLiveSignal } from "../features/radar/liveSignalModel";
import { BottomNav, ViewName } from "./BottomNav";

type Direction = "long" | "short" | "flat";
type Tone = "success" | "warning" | "danger" | "normal";
type RadarGroup = "surge" | "opportunity" | "risk";
type RadarCategoryId = "all" | "long" | "short" | "breakout" | "rebound" | "volume" | "capital";

type Signal = {
  id?: string;
  symbol: string;
  price?: string;
  gain?: string;
  time?: string;
  score: number;
  direction?: Direction;
  title: string;
  reason: string;
  confidence?: string;
};

type MarketRow = {
  symbol: string;
  price: string;
  change: string;
  score: number;
  state: string;
  oi?: string;
  funding?: string;
  source?: string;
  trend?: number[];
  volumeTrend?: number[];
  trendSource?: string;
};

type MarketStats = {
  monitoredSymbols: number;
  crowdedRisks: number;
  liveSources?: number;
  updatedAt?: string;
};

type Factor = {
  name: string;
  value: string;
  desc: string;
  level: "high" | "risk" | "normal";
};

type CurrentUser = {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "member" | "guest";
  plan: string;
  status?: string;
  expiresAt: string;
  signalUsed: number;
  signalQuota: number;
  feishuEnabled?: boolean;
  teamSeats: string;
};

type Entitlements = {
  plan: string;
  maxScanSymbols: number;
  maxWatchlistSymbols?: number;
  dailySignalQuota: number;
  remainingSignals: number;
  dailyPushUsed?: number;
  dailyPushSkipped?: number;
  dailyPushFailed?: number;
  remainingDailyPushes?: number;
  feishuAlerts: boolean;
  apiAccess: boolean;
  teamSeats: number;
  minAlertScore: number;
  allowedTimeframes: string[];
  maxPushPerDay?: number;
  realtimeDelayHours?: number;
  historyDays?: number;
  signalOutcomes?: boolean;
};

type RouteAccessPrompt = {
  title: string;
  desc: string;
  targetView: ViewName;
  fallbackView: ViewName;
  actionLabel?: string;
};

type Plan = {
  id?: string;
  code?: string;
  name: string;
  price: number;
  signalQuota: number;
  feishu: boolean;
  apiAccess: boolean;
  maxWatchlistSymbols?: number;
  allowedTimeframes?: string[];
  realtimeDelayHours?: number;
  historyDays?: number;
  minAlertScore?: number;
  maxPushPerDay?: number;
  signalOutcomes?: boolean;
  teamSeats?: number;
  features: string[];
};

type BillingOrder = {
  id: string;
  planName: string;
  amount: number;
  status: string;
  createdAt: string;
  checkoutUrl?: string;
  userId?: string;
  userName?: string;
};

type PaymentProviderStatus = {
  provider: "mock" | "stripe" | "wechat" | "alipay";
  enabled: boolean;
  mode: "mock" | "external";
  message: string;
};

type PaymentProviderSummary = {
  defaultProvider: PaymentProviderStatus["provider"];
  providers: PaymentProviderStatus[];
};

type TeamLevel = 1 | 2 | 3;
type TeamMember = { id: string; name: string; phone: string; plan: string; status: string; level: TeamLevel; joinedAt: string };
type TeamOrder = { id: string; userId: string; userName: string; planName: string; amount: number; status: string; paidAt?: string; createdAt: string; level: TeamLevel };
type TeamCommission = { level: TeamLevel; rate: number; members: number; paidOrders: number; commission: number };
type TeamDashboard = { inviteCode: string; inviteUrl: string; summary: { members: number; paidOrders: number; commission: number }; commissions: TeamCommission[]; members: TeamMember[]; orders: TeamOrder[] };

type FeishuConfig = {
  webhookUrl?: string;
  enabled?: boolean;
  minScore?: number;
  cooldownMinutes?: number;
  config?: {
    enabled?: boolean;
    configured?: boolean;
    webhookMasked?: string;
    minScore?: number;
    cooldownMinutes?: number;
    minAllowedScore?: number;
    maxPushPerDay?: number;
    feishuAllowed?: boolean;
    source?: string;
  };
};
type ClawBlock = { type: "summary" | "group" | "risk" | "action"; title: string; items: string[]; time?: string };
type ClawResponse = { message?: string; blocks: ClawBlock[]; mode?: "llm" | "template" | "fallback"; source?: string; provider?: string; model?: string; llmConfigured?: boolean; fallbackReason?: string };
type ClawStatus = { llmConfigured: boolean; provider: string; model?: string; source?: string };
type ChatMessage = { role: "user" | "agent"; text?: string; blocks?: ClawBlock[]; meta?: string };
type SignalPerformance = {
  entryPrice?: number | null;
  prices?: { "15m"?: number | null; "1h"?: number | null; "4h"?: number | null; "24h"?: number | null };
  returns?: { "5m"?: number | null; "15m"?: number | null; "1h"?: number | null; "4h"?: number | null; "24h"?: number | null };
  maxFavorablePct?: number | null;
  maxAdversePct?: number | null;
  outcomeStatus?: string | null;
  evaluatedUntil?: string | null;
  updatedAt?: string | null;
} | null;
type ScanRecord = { id: string; body: string; signature?: string; tags: string[]; time: string; timestamp?: number; title: string; tone: Tone; performance?: SignalPerformance };
type RadarTimelineRecord = ScanRecord & {
  symbol: string;
  group: RadarGroup;
  category: string;
  score?: number;
  direction?: Direction;
  action?: string | null;
  strategyName?: string;
  trigger?: string;
  risk?: string;
  payload?: {
    action?: string | null;
    reducePct?: number | null;
    reduce_pct?: number | null;
  };
};
type StrategyScanAlertResponse = {
  scan: {
    finishedAt: string;
    timeframes?: string[];
    symbols: string[];
    summary: { signals: number; scanned: number; succeeded: number; failed: number };
    results: Array<{
      ok: boolean;
      symbol: string;
      result?: {
        symbol: string;
        timeframe: string;
        bar_time: number | null;
        market_state: string;
        signals: Array<{
          type: string;
          title: string;
          engine: string;
          side: Direction;
          action?: string | null;
          reduce_pct?: number | null;
          reducePct?: number | null;
          price: number;
          score_impact: number;
        }>;
        metrics: Record<string, number | null>;
      };
    }>;
  };
  alert: { sent?: number; skipped?: number; blocked?: boolean; reason?: string };
};
type StrategyInboxSignal = {
  id: string;
  signalEventId: string;
  symbol: string;
  rawSymbol?: string;
  timeframe: string;
  direction: Direction;
  action?: string | null;
  signalType?: string;
  engine?: string;
  price: number;
  score: number;
  title: string;
  reason: string;
  time: string;
  receivedAt: string;
  status: string;
  payload?: {
    action?: string | null;
    reducePct?: number | null;
    reduce_pct?: number | null;
  };
  performance?: SignalPerformance;
};

type StrategyWatchlistItem = {
  id?: string;
  symbol: string;
  timeframes: string[];
  enabled: boolean;
  minScore: number;
  signalScope: string;
  pushEnabled: boolean;
};
type StrategyWatchlistLimits = {
  plan: string;
  maxWatchlistSymbols: number;
  activeSymbolCount: number;
  remainingSymbolSlots: number;
  allowedTimeframes: string[];
  minAlertScore: number;
  maxPushPerDay?: number;
  realtimeDelayHours?: number;
  historyDays?: number;
  signalOutcomes?: boolean;
};
type StrategyWatchlistResponse = {
  watchlist: StrategyWatchlistItem[];
  limits: StrategyWatchlistLimits;
};

type StrategySignalPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextPage: number | null;
};
type StrategySignalListResponse = {
  signals?: StrategyInboxSignal[];
  delayHours?: number;
  mode?: "current" | "all";
  pagination?: StrategySignalPagination;
};
type AppDataCache = {
  timestamp: number;
  signals: Signal[];
  marketRows: MarketRow[];
  factors: Factor[];
  marketStats: MarketStats;
  currentUser: CurrentUser;
  entitlements: Entitlements;
  plans: Plan[];
  orders: BillingOrder[];
  teamDashboard: TeamDashboard;
  paymentProviders: PaymentProviderSummary;
};

const API_TIMEOUT_MS = 30000;
const APP_DATA_CACHE_KEY = "radar.appDataCache";
const WATCHLIST_STORAGE_KEY = "radar.watchlistSymbols";
const SCAN_HISTORY_STORAGE_KEY = "radar.scanHistory";
const SCAN_HISTORY_LIMIT = 12;
const STRATEGY_TRACK_STORAGE_KEY = "radar.strategyTrackRecords";
const STRATEGY_TRACK_HISTORY_LIMIT = 80;
const STRATEGY_TRACK_TIMEFRAMES = ["5m", "15m", "1h", "4h"];
const MARKET_LIST_INITIAL_LIMIT = 30;
const MARKET_LIST_PAGE_SIZE = 30;
const defaultWatchlistSymbols = ["BTC", "ETH", "SOL"];

const emptyUser: CurrentUser = {
  id: "",
  name: "未登录",
  phone: "",
  role: "guest",
  plan: "Free",
  status: "trial",
  expiresAt: "",
  signalUsed: 0,
  signalQuota: 0,
  feishuEnabled: false,
  teamSeats: "0/0"
};

const emptyEntitlements: Entitlements = {
  plan: "Free",
  maxScanSymbols: 0,
  maxWatchlistSymbols: 0,
  dailySignalQuota: 0,
  remainingSignals: 0,
  dailyPushUsed: 0,
  dailyPushSkipped: 0,
  dailyPushFailed: 0,
  remainingDailyPushes: 0,
  feishuAlerts: false,
  apiAccess: false,
  teamSeats: 0,
  minAlertScore: 0,
  allowedTimeframes: [],
  maxPushPerDay: 0,
  realtimeDelayHours: 8,
  historyDays: 7,
  signalOutcomes: false
};

const emptyTeamDashboard: TeamDashboard = {
  inviteCode: "",
  inviteUrl: "",
  summary: { members: 0, paidOrders: 0, commission: 0 },
  commissions: [
    { level: 1, rate: 0.18, members: 0, paidOrders: 0, commission: 0 },
    { level: 2, rate: 0.08, members: 0, paidOrders: 0, commission: 0 },
    { level: 3, rate: 0.03, members: 0, paidOrders: 0, commission: 0 }
  ],
  members: [],
  orders: []
};

const emptyPaymentProviders: PaymentProviderSummary = { defaultProvider: "mock", providers: [] };

let initialAppDataCache: AppDataCache | null | undefined;

function getInitialAppDataCache() {
  if (initialAppDataCache === undefined) {
    initialAppDataCache = readAppDataCache();
  }
  return initialAppDataCache;
}

function readAppDataCache(): AppDataCache | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APP_DATA_CACHE_KEY) || "null") as Partial<AppDataCache> | null;
    if (!parsed || !Array.isArray(parsed.marketRows)) return null;
    return {
      timestamp: Number(parsed.timestamp) || 0,
      signals: Array.isArray(parsed.signals) ? (parsed.signals as Signal[]) : [],
      marketRows: parsed.marketRows as MarketRow[],
      factors: Array.isArray(parsed.factors) ? (parsed.factors as Factor[]) : [],
      marketStats: parsed.marketStats || { monitoredSymbols: parsed.marketRows.length, crowdedRisks: 0, liveSources: 0 },
      currentUser: parsed.currentUser || emptyUser,
      entitlements: parsed.entitlements || emptyEntitlements,
      plans: Array.isArray(parsed.plans) ? (parsed.plans as Plan[]) : [],
      orders: Array.isArray(parsed.orders) ? (parsed.orders as BillingOrder[]) : [],
      teamDashboard: parsed.teamDashboard || emptyTeamDashboard,
      paymentProviders: parsed.paymentProviders || emptyPaymentProviders
    };
  } catch {
    return null;
  }
}

function writeAppDataCache(cache: AppDataCache) {
  try {
    if (!cache.marketRows.length) return;
    window.localStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cache));
    initialAppDataCache = cache;
  } catch {
    // Local cache is best-effort only.
  }
}

function clearAppDataCache() {
  try {
    window.localStorage.removeItem(APP_DATA_CACHE_KEY);
    initialAppDataCache = null;
  } catch {
    // Local cache is best-effort only.
  }
}

export function AppShell() {
  const initialCache = getInitialAppDataCache();
  const [view, setView] = useState<ViewName>(() => readView());
  const [selectedSymbol, setSelectedSymbol] = useState(() => readSymbolParam());
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("ready");
  const [dataError, setDataError] = useState("");
  const [toast, setToast] = useState("");
  const [signals, setSignals] = useState<Signal[]>(() => initialCache?.signals || []);
  const [marketRows, setMarketRows] = useState<MarketRow[]>(() => initialCache?.marketRows || []);
  const [factors, setFactors] = useState<Factor[]>(() => initialCache?.factors || []);
  const [marketStats, setMarketStats] = useState<MarketStats>(() => initialCache?.marketStats || { monitoredSymbols: 0, crowdedRisks: 0, liveSources: 0 });
  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => initialCache?.currentUser || emptyUser);
  const [currentUserVerified, setCurrentUserVerified] = useState(false);
  const [currentUserVerificationReady, setCurrentUserVerificationReady] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements>(() => initialCache?.entitlements || emptyEntitlements);
  const [plans, setPlans] = useState<Plan[]>(() => initialCache?.plans || []);
  const [orders, setOrders] = useState<BillingOrder[]>(() => initialCache?.orders || []);
  const [teamDashboard, setTeamDashboard] = useState<TeamDashboard>(() => initialCache?.teamDashboard || emptyTeamDashboard);
  const [paymentProviders, setPaymentProviders] = useState<PaymentProviderSummary>(() => initialCache?.paymentProviders || emptyPaymentProviders);
  const [searchOpen, setSearchOpen] = useState(false);
  const [routePrompt, setRoutePrompt] = useState<RouteAccessPrompt | null>(null);
  const [valueClawSignalContext, setValueClawSignalContext] = useState<LiveSignal | null>(null);
  const [symbolSignalContext, setSymbolSignalContext] = useState<LiveSignal | null>(null);
  const authGenerationRef = useRef(0);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const onPop = () => {
      const nextView = readView();
      const nextSymbol = readSymbolParam();
      if (nextView === "kline-lab" && !currentUserVerificationReady) {
        setView(nextView);
        setSelectedSymbol(nextSymbol);
        return;
      }
      const prompt = routeAccessPrompt(nextView, currentUser, entitlements);
      if (prompt) {
        setRoutePrompt(prompt);
        setView(prompt.fallbackView);
        setSelectedSymbol("");
        replaceAppUrl(prompt.fallbackView);
        return;
      }
      setView(nextView);
      setSelectedSymbol(nextSymbol);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [currentUser, currentUserVerificationReady, entitlements]);

  useEffect(() => {
    if (view === "kline-lab" && !currentUserVerificationReady) return;
    const prompt = routeAccessPrompt(view, currentUser, entitlements);
    if (!prompt) return;
    setRoutePrompt(prompt);
    setView(prompt.fallbackView);
    setSelectedSymbol("");
    replaceAppUrl(prompt.fallbackView);
  }, [view, currentUser, currentUserVerificationReady, entitlements]);

  async function refreshAll() {
    const refreshGeneration = authGenerationRef.current;
    const failed: string[] = [];
    const [signalsRes, marketRes, meRes, plansRes, teamRes, paymentRes] = await Promise.allSettled([
      withClientTimeout(apiGet<{ signals: Signal[] }>("/api/signals"), "signals"),
      withClientTimeout(apiGet<{ stats?: MarketStats; rows: MarketRow[]; factors: Factor[] }>("/api/market/overview"), "market"),
      withClientTimeout(apiGet<{ user: CurrentUser; entitlements: Entitlements }>("/api/me"), "me"),
      withClientTimeout(apiGet<{ plans: Plan[] }>("/api/billing/plans"), "plans"),
      withClientTimeout(apiGet<TeamDashboard>("/api/team"), "team"),
      withClientTimeout(apiGet<PaymentProviderSummary>("/api/billing/providers"), "payment")
    ]);

    let nextSignals = signals;
    let nextMarketRows = marketRows;
    let nextFactors = factors;
    let nextMarketStats = marketStats;
    let nextCurrentUser = currentUser;
    let nextEntitlements = entitlements;
    let nextPlans = plans;
    let nextOrders = orders;
    let nextTeamDashboard = teamDashboard;
    let nextPaymentProviders = paymentProviders;

    if (signalsRes.status === "fulfilled") {
      nextSignals = signalsRes.value.signals || [];
      setSignals(nextSignals);
    } else {
      failed.push("信号");
    }

    if (marketRes.status === "fulfilled") {
      nextMarketRows = marketRes.value.rows || [];
      nextFactors = marketRes.value.factors || [];
      nextMarketStats = marketRes.value.stats || { monitoredSymbols: 0, crowdedRisks: 0, liveSources: 0 };
      setMarketRows(nextMarketRows);
      setFactors(nextFactors);
      setMarketStats(nextMarketStats);
    } else {
      failed.push("行情");
    }

    const canApplyMeResult = refreshGeneration === authGenerationRef.current;
    const nextOrderUser = canApplyMeResult && meRes.status === "fulfilled" ? meRes.value.user : currentUser;
    if (meRes.status === "fulfilled") {
      nextCurrentUser = meRes.value.user || emptyUser;
      nextEntitlements = meRes.value.entitlements || emptyEntitlements;
      if (canApplyMeResult) {
        setCurrentUser(nextCurrentUser);
        setEntitlements(nextEntitlements);
        setCurrentUserVerified(true);
        setCurrentUserVerificationReady(true);
      }
    } else {
      if (canApplyMeResult) {
        setCurrentUserVerified(false);
        setCurrentUserVerificationReady(true);
      }
      failed.push("账户");
    }

    if (plansRes.status === "fulfilled") {
      nextPlans = plansRes.value.plans || [];
      setPlans(nextPlans);
    } else {
      failed.push("套餐");
    }

    if (teamRes.status === "fulfilled") {
      nextTeamDashboard = teamRes.value || emptyTeamDashboard;
      setTeamDashboard(nextTeamDashboard);
    } else {
      failed.push("团队");
    }

    if (paymentRes.status === "fulfilled") {
      nextPaymentProviders = paymentRes.value || emptyPaymentProviders;
      setPaymentProviders(nextPaymentProviders);
    } else {
      failed.push("支付");
    }

    try {
      const path = nextOrderUser?.id && nextOrderUser.role !== "admin" ? `/api/billing/orders?userId=${encodeURIComponent(nextOrderUser.id)}` : "/api/billing/orders";
      const ordersRes = await withClientTimeout(apiGet<{ orders: BillingOrder[] }>(path), "orders");
      nextOrders = ordersRes.orders || [];
      setOrders(nextOrders);
    } catch {
      failed.push("订单");
    }

    if (refreshGeneration === authGenerationRef.current) {
      writeAppDataCache({
        timestamp: Date.now(),
        signals: nextSignals,
        marketRows: nextMarketRows,
        factors: nextFactors,
        marketStats: nextMarketStats,
        currentUser: nextCurrentUser,
        entitlements: nextEntitlements,
        plans: nextPlans,
        orders: nextOrders,
        teamDashboard: nextTeamDashboard,
        paymentProviders: nextPaymentProviders
      });
    }
    setDataStatus("ready");
    setDataError(failed.length ? `部分接口连接失败：${failed.join("、")}，已展示本地缓存。` : "");
  }

  function navigate(nextView: ViewName) {
    setValueClawSignalContext(null);
    setSymbolSignalContext(null);
    const prompt = routeAccessPrompt(nextView, currentUser, entitlements);
    if (prompt) {
      setRoutePrompt(prompt);
      setView(prompt.fallbackView);
      setSelectedSymbol("");
      replaceAppUrl(prompt.fallbackView);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setView(nextView);
    setSelectedSymbol("");
    replaceAppUrl(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openValueClawFromSignal(signal: LiveSignal) {
    navigate("claw");
    setValueClawSignalContext(signal);
    showToast(`${signal.symbol} 的 AIClaw 复核上下文已准备好`);
  }

  function openSymbol(symbol: string) {
    const clean = normalizeDisplaySymbol(symbol);
    if (!clean) return;
    setValueClawSignalContext(null);
    setSymbolSignalContext(null);
    setView("data");
    setSelectedSymbol(clean);
    replaceAppUrl("data", clean);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSymbolFromRadar(signal: LiveSignal) {
    setValueClawSignalContext(null);
    setSymbolSignalContext(signal);
    setView("data");
    setSelectedSymbol(signal.symbol);
    replaceAppUrl("data", signal.symbol);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeSymbol() {
    setSymbolSignalContext(null);
    setSelectedSymbol("");
    replaceAppUrl("data");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function handleLogin(phone: string, password: string) {
    authGenerationRef.current += 1;
    setCurrentUserVerified(false);
    setCurrentUserVerificationReady(false);
    const response = await apiPost<{ token: string; user: CurrentUser }>("/api/auth/login", { phone, password });
    setAuthToken(response.token);
    setActiveUserId(response.user.id);
    setCurrentUser(response.user);
    showToast("登录成功");
    await refreshAll();
    navigate("account");
  }

  async function handleRegister(name: string, phone: string, password: string) {
    authGenerationRef.current += 1;
    setCurrentUserVerified(false);
    setCurrentUserVerificationReady(false);
    const response = await apiPost<{ token: string; user: CurrentUser }>("/api/auth/register", { name, phone, password });
    setAuthToken(response.token);
    setActiveUserId(response.user.id);
    setCurrentUser(response.user);
    showToast("注册成功");
    await refreshAll();
    navigate("account");
  }

  function logout() {
    authGenerationRef.current += 1;
    setAuthToken("");
    setActiveUserId("");
    setCurrentUserVerified(false);
    setCurrentUserVerificationReady(false);
    setCurrentUser(emptyUser);
    setEntitlements(emptyEntitlements);
    clearAppDataCache();
    showToast("已退出当前账号");
    navigate("account");
  }

  async function createOrder(plan: Plan) {
    if (!currentUser.id) {
      showToast("请先登录后再购买会员");
      navigate("login");
      return;
    }

    const response = await apiPost<{ order: BillingOrder }>("/api/billing/orders", {
      userId: currentUser.id,
      phone: currentUser.phone,
      planCode: plan.code || plan.id || plan.name,
      provider: "mock"
    });
    setOrders((items) => [response.order, ...items.filter((item) => item.id !== response.order.id)]);
    showToast("订单已生成");
  }

  async function payOrder(order: BillingOrder) {
    const response = await apiPost<{ order: BillingOrder; user: CurrentUser }>(`/api/billing/orders/${order.id}/pay`, {});
    setOrders((items) => items.map((item) => (item.id === response.order.id ? response.order : item)));
    setCurrentUserVerified(false);
    setCurrentUserVerificationReady(false);
    setCurrentUser(response.user);
    showToast("支付成功，会员权益已更新");
    await refreshAll();
  }

  const rows = marketRows;
  const safeSignals = signals;
  const isSubPage = ["plans", "team", "admin", "login", "register", "kline-lab"].includes(view);
  const showBottomNav = !isSubPage;
  const showSymbolDetail = view === "data" && selectedSymbol;
  const canRenderKlineLab = view === "kline-lab" && currentUserVerificationReady && currentUserVerified && Boolean(currentUser.id) && currentUser.role === "admin";

  return (
    <main className={`app-shell view-${showSymbolDetail ? "symbol" : view}`}>
      {dataStatus !== "loading" && showSymbolDetail && (
        <SymbolDetailPage symbol={selectedSymbol} seedRows={rows} signals={safeSignals} radarSignalContext={normalizeDisplaySymbol(symbolSignalContext?.symbol || "") === normalizeDisplaySymbol(selectedSymbol) ? symbolSignalContext : null} currentUser={currentUser} entitlements={entitlements} onBack={closeSymbol} onNavigate={navigate} onOpenValueClawSignal={openValueClawFromSignal} onToast={showToast} />
      )}
      {dataStatus !== "loading" && !showSymbolDetail && view === "data" && (
        <DataPage currentUser={currentUser} entitlements={entitlements} rows={rows} stats={marketStats} factors={factors} signals={safeSignals} onNavigate={navigate} onOpenSearch={() => setSearchOpen(true)} onOpenSymbol={openSymbol} onToast={showToast} />
      )}
      {dataStatus !== "loading" && !showSymbolDetail && view === "radar" && (
        <RadarPage currentUser={currentUser} entitlements={entitlements} rows={rows} signals={safeSignals} stats={marketStats} onNavigate={navigate} onOpenSearch={() => setSearchOpen(true)} onOpenSymbol={openSymbol} onOpenSymbolSignal={openSymbolFromRadar} onOpenValueClawSignal={openValueClawFromSignal} onToast={showToast} />
      )}
      {dataStatus !== "loading" && !showSymbolDetail && view === "signal" && (
        <AlertsPage entitlements={entitlements} signals={safeSignals} onNavigate={navigate} onOpenSearch={() => setSearchOpen(true)} onOpenSymbol={openSymbol} onToast={showToast} />
      )}
      {dataStatus !== "loading" && !showSymbolDetail && view === "claw" && (
        <ValueClawPage currentUser={currentUser} rows={rows} signals={safeSignals} signalContext={valueClawSignalContext} onClearSignalContext={() => setValueClawSignalContext(null)} onNavigate={navigate} onOpenSymbol={openSymbol} onToast={showToast} />
      )}
      {dataStatus !== "loading" && !showSymbolDetail && view === "account" && (
        <AccountPage currentUser={currentUser} entitlements={entitlements} rows={rows} signals={safeSignals} onLogout={logout} onOpenSearch={() => setSearchOpen(true)} onNavigate={navigate} />
      )}
      {dataStatus !== "loading" && view === "plans" && (
        <PlansPage paymentProviders={paymentProviders} plans={plans} orders={orders} currentUser={currentUser} onBack={() => navigate("account")} onCreateOrder={createOrder} onPayOrder={payOrder} />
      )}
      {dataStatus !== "loading" && view === "team" && <TeamPage dashboard={teamDashboard} currentUser={currentUser} onBack={() => navigate("account")} />}
      {dataStatus !== "loading" && canRenderKlineLab && <KlineLabView currentUser={currentUser} rows={rows} navigate={navigate} showToast={showToast} />}
      {dataStatus !== "loading" && view === "kline-lab" && !canRenderKlineLab && (
        <section className="view active-view kline-lab-view" aria-label="内部页面验证中">
          <header className="kline-lab-header">
            <button className="kline-lab-back" type="button" onClick={() => navigate("radar")} aria-label="返回">
              返回
            </button>
            <div className="kline-lab-title">
              <span>Yansir Internal</span>
              <h1>K线验信室</h1>
            </div>
            <span className="kline-confirmation-badge">验证中</span>
          </header>
          <section className="kline-strategy-panel empty" aria-label="管理员权限验证">
            <strong>内部页面验证中</strong>
            <p>正在验证管理员权限，验证完成前不会请求策略 inbox。</p>
          </section>
        </section>
      )}
      {dataStatus !== "loading" && view === "login" && <LoginPage onBack={() => navigate("account")} onLogin={handleLogin} onRegister={() => navigate("register")} />}
      {dataStatus !== "loading" && view === "register" && <RegisterPage onBack={() => navigate("login")} onRegister={handleRegister} />}
      {dataError && dataStatus === "ready" && <div className="toast subtle-toast">{dataError}</div>}
      {searchOpen && <GlobalSearch rows={rows} onClose={() => setSearchOpen(false)} onOpenSymbol={openSymbol} />}
      {showBottomNav && <BottomNav activeView={view} onChange={navigate} />}
      {routePrompt && (
        <UpgradeModal
          title={routePrompt.title}
          desc={routePrompt.desc}
          actionLabel={routePrompt.actionLabel || (routePrompt.targetView === "login" ? "去登录" : "查看会员套餐")}
          onClose={() => setRoutePrompt(null)}
          onUpgrade={() => {
            const target = routePrompt.targetView;
            setRoutePrompt(null);
            navigate(target);
          }}
        />
      )}
      {toast && <div className="toast show">{toast}</div>}
    </main>
  );
}

function DataPage({ currentUser, entitlements, factors, onNavigate, onOpenSearch, onOpenSymbol, onToast, rows, signals, stats }: { currentUser: CurrentUser; entitlements: Entitlements; factors: Factor[]; onNavigate: (view: ViewName) => void; onOpenSearch: () => void; onOpenSymbol: (symbol: string) => void; onToast: (message: string) => void; rows: MarketRow[]; signals: Signal[]; stats: MarketStats }) {
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(readWatchlistSymbols);
  const [watchlistLimits, setWatchlistLimits] = useState<StrategyWatchlistLimits | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; desc: string } | null>(null);
  const [marketTab, setMarketTab] = useState<"all" | "watchlist">("all");
  const [flowMode, setFlowMode] = useState<"exchange" | "capital">("exchange");
  const [flowWindow, setFlowWindow] = useState<"1H" | "4H" | "8H" | "24H">("8H");
  const [trendOverrides, setTrendOverrides] = useState<Record<string, number[]>>({});
  const [visibleCount, setVisibleCount] = useState(MARKET_LIST_INITIAL_LIMIT);
  const listRef = useRef<HTMLElement | null>(null);
  const pendingTrendSymbols = useRef<Set<string>>(new Set());
  const watchlistRows = watchlistSymbols
    .map((symbol) => rows.find((row) => normalizeDisplaySymbol(row.symbol) === normalizeDisplaySymbol(symbol)))
    .filter((row): row is MarketRow => Boolean(row));
  const showingWatchlist = marketTab === "watchlist";
  const marketSource = showingWatchlist ? watchlistRows : rows;
  const marketRows = showingWatchlist ? marketSource : marketSource.slice(0, visibleCount);
  const hasMore = !showingWatchlist && marketRows.length < rows.length;
  const firstTrend = rows[0]?.trend?.length ? rows[0].trend : rows.map((row) => parseNumber(row.change));
  const firstVolumeTrend = rows[0]?.volumeTrend?.length ? rows[0].volumeTrend : firstTrend;
  const windowPriceTrend = selectFlowWindow(firstTrend, flowWindow);
  const windowVolumeTrend = selectFlowWindow(firstVolumeTrend, flowWindow);
  const flowTrend =
    flowMode === "capital"
      ? windowPriceTrend
      : windowVolumeTrend;
  const positiveCount = rows.filter((row) => !row.change.startsWith("-")).length;
  const flowMetricLabel = flowMode === "exchange" ? "成交活跃" : "价格动能";
  const flowMetricValue =
    flowMode === "exchange"
      ? formatCompactMarketValue(sumWindowQuoteVolume(windowVolumeTrend, windowPriceTrend)) || rows[0]?.oi || "-"
      : `${countPositiveMoves(windowPriceTrend)}/${Math.max(windowPriceTrend.length - 1, 1)}`;

  useEffect(() => {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  useEffect(() => {
    if (!currentUser.id) {
      setWatchlistLimits(null);
      return;
    }
    let alive = true;
    apiGet<StrategyWatchlistResponse>("/api/strategy/watchlist")
      .then((response) => {
        if (!alive) return;
        setWatchlistLimits(response.limits);
        const serverSymbols = response.watchlist.filter((item) => item.enabled).map((item) => normalizeDisplaySymbol(item.symbol)).filter(Boolean);
        setWatchlistSymbols(Array.from(new Set(serverSymbols)));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [currentUser.id]);

  useEffect(() => {
    if (!showingWatchlist) setVisibleCount(MARKET_LIST_INITIAL_LIMIT);
  }, [rows.length, showingWatchlist]);

  useEffect(() => {
    setTrendOverrides({});
    pendingTrendSymbols.current.clear();
  }, [rows]);

  useEffect(() => {
    const missingRows = marketRows
      .filter((row) => {
        const symbol = normalizeDisplaySymbol(row.symbol);
        return !row.trend?.length && !trendOverrides[symbol]?.length && !pendingTrendSymbols.current.has(symbol);
      })
      .slice(0, 8);

    if (!missingRows.length) return;

    let cancelled = false;
    missingRows.forEach((row) => {
      const symbol = normalizeDisplaySymbol(row.symbol);
      pendingTrendSymbols.current.add(symbol);
      void apiGet<{ candles: Array<{ close: number }> }>(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=5m&limit=288`)
        .then((result) => {
          const trend = result.candles.map((candle) => candle.close).filter(Number.isFinite);
          if (!cancelled && trend.length) {
            setTrendOverrides((current) => ({ ...current, [symbol]: trend }));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          pendingTrendSymbols.current.delete(symbol);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [marketRows, trendOverrides]);

  useEffect(() => {
    if (showingWatchlist || !hasMore) return;
    let ticking = false;
    const maybeLoad = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const target = listRef.current;
        if (!target) return;
        if (target.getBoundingClientRect().bottom <= window.innerHeight + 640) {
          setVisibleCount((count) => Math.min(count + MARKET_LIST_PAGE_SIZE, rows.length));
        }
      });
    };
    maybeLoad();
    window.addEventListener("scroll", maybeLoad, { passive: true });
    window.addEventListener("resize", maybeLoad);
    return () => {
      window.removeEventListener("scroll", maybeLoad);
      window.removeEventListener("resize", maybeLoad);
    };
  }, [hasMore, rows.length, showingWatchlist]);

  function cycleFlowWindow() {
    const windows: Array<"1H" | "4H" | "8H" | "24H"> = ["1H", "4H", "8H", "24H"];
    setFlowWindow((current) => windows[(windows.indexOf(current) + 1) % windows.length]);
  }

  const statsCards = [
    { label: "全市场监控", value: stats.monitoredSymbols || rows.length, desc: "个 · 系统样本", icon: "database" },
    { label: "全市场异常", value: stats.crowdedRisks || signals.filter((signal) => signal.score >= 70).length, desc: "条 · 系统扫描信号", icon: "target" },
    { label: "系统数据源", value: stats.liveSources ? "实时" : rows.length ? "降级" : "未连接", desc: "Binance Futures", icon: "clock" }
  ];

  return (
    <section className="view active-view polished-screen data-polished">
      <Topbar title="数据" eyebrow="实时市场流" badge="数据中枢" onSearch={onOpenSearch} />
      <section className="polished-overview">
        <div>
          <h1>市场概览</h1>
          <p>多市场资金流、价格行为、成交量同步扫描</p>
          <div className="chip-row"><span>实时更新</span></div>
        </div>
        <span className="health-badge"><SystemIcon name="check" />正常</span>
        <MiniSparkline values={firstTrend} variant="dual" />
      </section>
      <div className="market-focus-rail" aria-label="市场焦点">
        {rows.slice(0, 4).map((row) => (
          <button type="button" key={`focus-${row.symbol}`} onClick={() => onOpenSymbol(row.symbol)}>
            <CoinIcon symbol={row.symbol} />
            <span><strong>{normalizeDisplaySymbol(row.symbol)}</strong><em className={row.change.startsWith("-") ? "negative" : ""}>{row.change}</em></span>
          </button>
        ))}
      </div>
      <section className="stat-grid">
        {statsCards.map((item) => (
          <article key={item.label}>
            <span><SystemIcon name={item.icon} />{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.desc}</em>
          </article>
        ))}
      </section>
      <section className="polished-card flow-card">
        <div className="card-title">
          <div className="flow-title-copy"><h2>链上资金流</h2><span>净流入与成交活跃度对照</span></div>
          <button type="button" aria-label={`切换资金流时间窗口，当前 ${flowWindow}`} onClick={cycleFlowWindow}>{flowWindow}</button>
        </div>
        <div className="flow-chart refined-flow-chart">
          <div className="flow-chart-toolbar"><span>{flowMetricLabel}</span><strong>{flowMetricValue}</strong></div>
          <FlowChart key={`${flowMode}-${flowWindow}`} values={flowTrend} mode={flowMode} />
          <div className="flow-legend" role="tablist" aria-label="资金流指标">
            <button className={flowMode === "exchange" ? "active" : ""} type="button" onClick={() => setFlowMode("exchange")}>成交活跃</button>
            <button className={flowMode === "capital" ? "active" : ""} type="button" onClick={() => setFlowMode("capital")}>价格动能</button>
            <em>{flowWindow}</em>
          </div>
        </div>
      </section>
      <section className="factor-grid market-factor-grid">
        {factors.slice(0, 3).map((factor) => (
          <article className="factor-chip" key={factor.name}>
            <span>{factor.name}</span>
            <strong>{factor.value}</strong>
            <em>{factor.desc}</em>
          </article>
        ))}
      </section>
      <section className="polished-card market-list-card" ref={listRef}>
        <div className="card-title market-list-title">
          <div className="inline-title-copy"><h2>市场热度排行</h2><span>按异常评分与价格行为排序</span></div>
        </div>
        <div className="market-segment-tabs" role="tablist">
          <button className={marketTab === "all" ? "active" : ""} type="button" onClick={() => setMarketTab("all")}>全部市场 <span>{rows.length}</span></button>
          <button className={marketTab === "watchlist" ? "active" : ""} type="button" onClick={() => currentUser.id ? setMarketTab("watchlist") : setUpgradePrompt({ title: "登录后使用我的自选", desc: "未登录只能查看全市场延迟历史。登录后可管理自选币种，付费套餐可解锁更多币种和周期。" })}>我的自选 <span>{watchlistLimits ? `${watchlistLimits.activeSymbolCount}/${watchlistLimits.maxWatchlistSymbols}` : watchlistRows.length}</span></button>
        </div>
        <div className="table-labels with-trend"><span>币种</span><span>价格</span><span>24H</span><span>趋势</span></div>
        {showingWatchlist && (
          <div className="market-load-state">套餐 {watchlistLimits?.plan || entitlements.plan} · 自选 {watchlistLimits ? `${watchlistLimits.activeSymbolCount}/${watchlistLimits.maxWatchlistSymbols}` : `${watchlistRows.length}/${entitlements.maxWatchlistSymbols || 0}`} · 可用周期 {(watchlistLimits?.allowedTimeframes?.length ? watchlistLimits.allowedTimeframes : entitlements.allowedTimeframes).join(" / ") || "5m"}</div>
        )}
        {showingWatchlist && watchlistLimits && watchlistLimits.remainingSymbolSlots <= 0 && (
          <UpgradeGuideCard title="自选额度已用完" desc={`当前 ${watchlistLimits.plan} 最多自选 ${watchlistLimits.maxWatchlistSymbols} 个币种，升级后可追踪更多币种和周期。`} onClick={() => onNavigate("plans")} />
        )}
        <div className="polished-list">
          {marketRows.map((row) => {
            const falling = isNegativeChange(row.change);
            return (
              <button className="market-list-row with-trend" type="button" key={row.symbol} onClick={() => onOpenSymbol(row.symbol)}>
                <span className="market-symbol"><CoinIcon symbol={row.symbol} /><span><strong>{normalizeDisplaySymbol(row.symbol)}</strong><small>{row.state}</small></span></span>
                <strong>{row.price}</strong>
                <em className={falling ? "negative" : ""}>{row.change}</em>
                <span className={`market-trend-mini ${falling ? "red" : "green"}`}><MiniSparkline values={row.trend?.length ? row.trend : trendOverrides[normalizeDisplaySymbol(row.symbol)] || []} variant={falling ? "red" : "dual"} /></span>
              </button>
            );
          })}
        </div>
        <div className="market-load-state">{hasMore ? `继续下滑加载更多 · 已显示 ${marketRows.length}/${rows.length}` : `已显示全部 ${marketRows.length} 个市场`}</div>
      </section>
      {upgradePrompt && <UpgradeModal title={upgradePrompt.title} desc={upgradePrompt.desc} onClose={() => setUpgradePrompt(null)} onUpgrade={() => { setUpgradePrompt(null); onNavigate(currentUser.id ? "plans" : "login"); }} actionLabel={currentUser.id ? "查看会员套餐" : "去登录"} />}
    </section>
  );
}

function RadarPage({ currentUser, entitlements, onNavigate, onOpenSearch, onOpenSymbol, onOpenSymbolSignal, onOpenValueClawSignal, onToast, rows, signals, stats }: { currentUser: CurrentUser; entitlements: Entitlements; onNavigate: (view: ViewName) => void; onOpenSearch: () => void; onOpenSymbol: (symbol: string) => void; onOpenSymbolSignal: (signal: LiveSignal) => void; onOpenValueClawSignal: (signal: LiveSignal) => void; onToast: (message: string) => void; rows: MarketRow[]; signals: Signal[]; stats: MarketStats }) {
  const [trackingSection, setTrackingSection] = useState<"ai" | "strategy" | "mine">("strategy");
  const [activeRadarCategory, setActiveRadarCategory] = useState<RadarCategoryId>("all");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(readWatchlistSymbols);
  const [activeLiveFilter, setActiveLiveFilter] = useState<LiveSignalFilter>("now");
  const [selectedLiveSignalId, setSelectedLiveSignalId] = useState<string | undefined>();
  const [ruleSettingsOpen, setRuleSettingsOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; desc: string } | null>(null);
  const [radarWindow, setRadarWindow] = useState<"4H" | "8H" | "24H">("8H");
  const [radarThreshold, setRadarThreshold] = useState(70);
  const [radarPushEnabled, setRadarPushEnabled] = useState(true);
  const [scanNow, setScanNow] = useState(() => Date.now());
  const [strategyRecords, setStrategyRecords] = useState<RadarTimelineRecord[]>(readStrategyTrackRecords);
  const [strategyStatus, setStrategyStatus] = useState<"idle" | "scanning" | "ready" | "no-signal" | "error">("idle");
  const [strategyHistoryMode, setStrategyHistoryMode] = useState<"current" | "all">("current");
  const [strategyFilterSymbol, setStrategyFilterSymbol] = useState("");
  const [strategyFilterTimeframe, setStrategyFilterTimeframe] = useState("all");
  const [strategyFilterDirection, setStrategyFilterDirection] = useState("all");
  const [strategyFilterMinScore, setStrategyFilterMinScore] = useState("all");
  const [strategyPagination, setStrategyPagination] = useState<StrategySignalPagination | null>(null);
  const [strategyLoadingMore, setStrategyLoadingMore] = useState(false);
  const [strategyLastScan, setStrategyLastScan] = useState("");
  const [strategyScanSummary, setStrategyScanSummary] = useState("");
  const strategyScanInFlight = useRef(false);
  const strategyScheduleStarted = useRef(false);
  const scanBaseTime = useMemo(() => currentScanSlot(scanNow), [scanNow]);
  const scanSchedule = getNextScanSchedule(stats.updatedAt, scanNow);
  const radarRecords = useMemo<RadarTimelineRecord[]>(() => signals.map((signal, index) => {
    const symbol = normalizeDisplaySymbol(signal.symbol);
    const row = rows.find((item) => normalizeDisplaySymbol(item.symbol) === symbol);
    const category = radarMonitorCategory(signal);
    const timestamp = signal.time ? timestampFromScanTime(signal.time) : scanBaseTime - index * 15 * 60 * 1000;
    const record = buildSignalScanRecord(symbol, signal);

    return {
      ...record,
      id: record.id || `${symbol}-${index}`,
      symbol,
      group: category.key,
      category: category.label,
      time: signal.time || formatClockTime(timestamp || scanBaseTime),
      timestamp,
      title: `${symbol} ${signal.title}`,
      body: buildRadarRecordBody(signal, row),
      tags: [symbol, category.tag, row?.source === "binance" ? "合约" : "行情同步"],
      tone: category.tone,
      score: signal.score,
      direction: signal.direction,
      strategyName: "Yansir 雷达",
      trigger: signal.reason || signal.title,
      risk: category.key === "risk" ? category.label : undefined
    };
  }), [rows, scanBaseTime, signals]);

  const watchlistSet = useMemo(() => new Set(watchlistSymbols.map(normalizeDisplaySymbol)), [watchlistSymbols]);
  const strategySectionRecords = useMemo<RadarTimelineRecord[]>(() =>
    buildAllMarketRadarRecords(rows, strategyRecords, {
      mode: "strategy",
      scanBaseTime
    }),
  [rows, scanBaseTime, strategyRecords]);
  const marketSectionRecords = useMemo<RadarTimelineRecord[]>(() =>
    buildAllMarketRadarRecords(rows, radarRecords, {
      mode: "market",
      scanBaseTime
    }),
  [rows, radarRecords, scanBaseTime]);
  const sectionRecords = trackingSection === "strategy"
    ? strategySectionRecords
    : trackingSection === "mine"
      ? marketSectionRecords.filter((record) => watchlistSet.has(record.symbol))
      : marketSectionRecords;
  const isStrategyWaitingRecord = (record: RadarTimelineRecord) => record.category === "等待策略信号";
  const matchesSectionFilter = (record: RadarTimelineRecord, filter: RadarCategoryId) => {
    if (filter === "all") return true;
    if (isStrategyWaitingRecord(record)) return false;
    if (filter === "long") return record.direction === "long";
    if (filter === "short") return record.direction === "short" || record.group === "risk";
    const searchableText = [record.category, record.title, record.body, record.trigger, ...record.tags].join(" ");
    if (filter === "breakout") return /趋势|突破/.test(searchableText);
    if (filter === "rebound") return /回调|反弹/.test(searchableText);
    if (filter === "volume") return /成交量|放量/.test(searchableText);
    return /资金|资金费率/.test(searchableText);
  };
  const filteredSignals = sectionRecords.filter((record) => matchesSectionFilter(record, activeRadarCategory));
  const radarCategoryItems: RadarCategoryItem[] = [
    { id: "all", label: "全部", count: sectionRecords.length },
    { id: "long", label: "看多", count: sectionRecords.filter((record) => matchesSectionFilter(record, "long")).length },
    { id: "short", label: "看空", count: sectionRecords.filter((record) => matchesSectionFilter(record, "short")).length },
    { id: "breakout", label: "趋势突破", count: sectionRecords.filter((record) => matchesSectionFilter(record, "breakout")).length },
    { id: "rebound", label: "回调反弹", count: sectionRecords.filter((record) => matchesSectionFilter(record, "rebound")).length },
    { id: "volume", label: "成交量异动", count: sectionRecords.filter((record) => matchesSectionFilter(record, "volume")).length },
    { id: "capital", label: "资金异动", count: sectionRecords.filter((record) => matchesSectionFilter(record, "capital")).length }
  ];
  const liveSignals = useMemo<LiveSignal[]>(() => filteredSignals.map((record, index) => {
    const timestamp = record.timestamp ?? timestampFromScanTime(record.time) ?? scanBaseTime - index * 15 * 60 * 1000;
    const row = rows.find((item) => normalizeDisplaySymbol(item.symbol) === normalizeDisplaySymbol(record.symbol));
    const source = trackingSection === "strategy" ? "strategy" : "market";
    const waitingStrategySignal = source === "strategy" && record.category === "等待策略信号";
    return toLiveSignal({
      id: record.id,
      symbol: record.symbol,
      direction: waitingStrategySignal ? "flat" : record.direction ?? (record.group === "risk" ? "short" : "long"),
      action: record.action ?? record.payload?.action ?? null,
      score: record.score,
      risk: record.risk ?? (record.group === "risk" ? record.category : undefined),
      status: waitingStrategySignal ? "no-signal" : "active",
      strategyName: waitingStrategySignal ? "已纳入全市场策略扫描" : record.strategyName ?? record.tags[2] ?? "Yansir 策略",
      trigger: record.trigger ?? record.body,
      generatedAt: new Date(timestamp).toISOString(),
      price: row?.price,
      change24h: row?.change,
      source,
      payload: record.payload
    }, index);
  }), [filteredSignals, rows, scanBaseTime, trackingSection]);
  const listeningStatus: StrategyListeningStatus = strategyStatus === "error"
    ? "degraded"
    : strategyStatus === "idle" || strategyStatus === "no-signal"
      ? "paused"
      : "live";
  const listenerLabel = strategyStatus === "error"
    ? "监听异常"
    : strategyStatus === "scanning"
      ? "扫描中"
      : strategyStatus === "ready"
        ? "数据已更新"
        : strategyStatus === "no-signal"
          ? "本轮无信号"
          : "等待监听";
  const liveFilterLabels: Record<LiveSignalFilter, string> = {
    now: "全部",
    long: "做多",
    risk: "风险",
    watch: "观察"
  };
  const latestScanLabel = strategyLastScan || formatClockTime(scanBaseTime);
  const activeScopeLabel = trackingSection === "strategy"
    ? strategyHistoryMode === "current"
      ? "全市场策略信号"
      : "全部历史策略信号"
    : trackingSection === "mine"
      ? "我的关注信号"
      : "全市场雷达信号";
  const liveEmptyState = {
    title: strategyStatus === "error" ? "策略信号暂时延迟" : "暂无符合条件的策略信号",
    description:
      strategyStatus === "error"
        ? "正在使用最近一次策略数据，新的信号恢复后会自动更新。"
        : "策略引擎没有发现满足当前筛选条件的信号，这不是 AI 判断缺席。",
    meta: [
      "信号来源：Yansir 策略引擎",
      `最近扫描：${latestScanLabel}`,
      `当前范围：${activeScopeLabel}`,
      `当前筛选：${liveFilterLabels[activeLiveFilter]}`
    ],
    primaryAction: {
      label: "放宽筛选",
      onClick: () => {
        setActiveLiveFilter("now");
        setActiveRadarCategory("all");
        setStrategyFilterDirection("all");
        setStrategyFilterMinScore("all");
      }
    },
    secondaryAction: {
      label: "查看扫描记录",
      onClick: () => setTrackingSection("strategy")
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
    } catch {
      // Keep the current session usable if local storage is unavailable.
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    const timer = window.setInterval(() => setScanNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    strategyScheduleStarted.current = false;
    void ensureStrategyRealtime();
  }, [currentUser.id, watchlistSymbols.join(",")]);

  useEffect(() => {
    if (trackingSection !== "strategy") return;
    void refreshLatestStrategyScan(true);
    const timer = window.setInterval(() => {
      void refreshLatestStrategyScan(false);
    }, 10 * 1000);
    return () => window.clearInterval(timer);
  }, [trackingSection, currentUser.id, strategyHistoryMode, strategyFilterSymbol, strategyFilterTimeframe, strategyFilterDirection, strategyFilterMinScore]);

  useEffect(() => {
    if (trackingSection !== "strategy") return;
    setStrategyRecords([]);
    setStrategyPagination(null);
    writeStrategyTrackRecords([]);
  }, [currentUser.id, strategyHistoryMode, strategyFilterSymbol, strategyFilterTimeframe, strategyFilterDirection, strategyFilterMinScore, trackingSection]);

  async function scanStrategyTrack(silent: boolean) {
    if (strategyScanInFlight.current) {
      return;
    }

    const symbols = watchlistSymbols.map(normalizeDisplaySymbol).filter(Boolean);
    if (!symbols.length) {
      setStrategyStatus("idle");
      return;
    }

    strategyScanInFlight.current = true;
    setStrategyStatus(strategyRecords.length ? "ready" : "scanning");
    try {
      const response = await withClientTimeout(
        apiPost<StrategyScanAlertResponse>("/api/strategy/scan/alert", {
          symbols,
          timeframes: STRATEGY_TRACK_TIMEFRAMES,
          minScore: 65,
          directions: ["long", "short"],
          cooldownMinutes: 15,
          limit: 180
        }),
        "strategy scan",
        45000
      );
      const nextRecords = strategyScanToRecords(response);
      setStrategyLastScan(formatStrategyScanTime(response.scan.finishedAt));
      setStrategyScanSummary(strategyScanSummaryText(response));
      if (nextRecords.length) {
        setStrategyRecords((items) => {
          const merged = mergeStrategyRecords([...nextRecords, ...items]).slice(0, 40);
          writeStrategyTrackRecords(merged);
          return merged;
        });
        setStrategyStatus("ready");
        if (!silent && response.alert?.sent) {
          onToast(`策略信号已推送飞书 ${response.alert.sent} 条`);
        }
      } else {
        setStrategyStatus("no-signal");
      }
    } catch {
      setStrategyStatus("error");
      setStrategyScanSummary("策略服务或 API 暂时不可用，已等待下一轮自动扫描。");
      if (!silent) {
        onToast("策略信号扫描失败");
      }
    } finally {
      strategyScanInFlight.current = false;
    }
  }

  async function ensureStrategyRealtime() {
    if (strategyScheduleStarted.current) return;

    strategyScheduleStarted.current = true;
    try {
      if (currentUser.id) {
        const localSymbols = watchlistSymbols.map(normalizeDisplaySymbol).filter(Boolean);
        if (localSymbols.length) {
          await apiPut("/api/strategy/watchlist", {
            items: localSymbols.map((symbol) => ({ symbol, timeframes: STRATEGY_TRACK_TIMEFRAMES, enabled: true, minScore: 65, signalScope: "all", pushEnabled: true }))
          });
        }
      }
      await apiPost("/api/strategy/scan/schedule/stop", {});
      await apiPost("/api/strategy/realtime/start", {
        timeframes: STRATEGY_TRACK_TIMEFRAMES,
        minScore: 65,
        directions: ["long", "short"],
        cooldownMinutes: 15
      });
      setStrategyScanSummary(currentUser.id
        ? "实时K线监听已启动：有新的 Pine V6 标准多空信号时才显示并触发推送。"
        : "未登录仅展示延迟8小时的策略信号；登录后可查看自选币种实时信号并接收推送。"
      );
    } catch {
      strategyScheduleStarted.current = false;
    }
  }

  function strategySignalEndpoint(page = 1, limit = 80) {
    const params = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (currentUser.id) params.set("mode", strategyHistoryMode);
    const cleanSymbol = normalizeDisplaySymbol(strategyFilterSymbol.trim());
    if (cleanSymbol) params.set("symbol", cleanSymbol);
    if (strategyFilterTimeframe !== "all") params.set("timeframe", strategyFilterTimeframe);
    if (strategyFilterDirection !== "all") params.set("direction", strategyFilterDirection);
    if (strategyFilterMinScore !== "all") params.set("minScore", strategyFilterMinScore);
    return currentUser.id
      ? `/api/strategy/inbox?${params.toString()}`
      : `/api/strategy/public-signals?${params.toString()}`;
  }

  function resetStrategyFilters() {
    setStrategyFilterSymbol("");
    setStrategyFilterTimeframe("all");
    setStrategyFilterDirection("all");
    setStrategyFilterMinScore("all");
    setActiveRadarCategory("all");
  }

  function selectRadarCategory(categoryId: string) {
    const nextCategory = categoryId as RadarCategoryId;
    setActiveRadarCategory(nextCategory);
    setStrategyFilterDirection(nextCategory === "long" || nextCategory === "short" ? nextCategory : "all");
  }

  async function refreshLatestStrategyScan(runIfMissing = false) {
    try {
      const response = await apiGet<StrategySignalListResponse>(strategySignalEndpoint(1, 80));
      setStrategyPagination(response.pagination || null);
      const inboxSignals = Array.isArray(response.signals) ? response.signals : [];
      if (!inboxSignals.length) {
        setStrategyStatus(strategyRecords.length && !runIfMissing ? "ready" : "idle");
        if (runIfMissing) {
          setStrategyScanSummary(currentUser.id
            ? (strategyHistoryMode === "current"
              ? "实时K线监听中：当前自选币种/周期暂无 Pine V6 信号；切到“全部历史”可看取消自选前的历史。"
              : "全部历史里暂无已投递到你的策略信号；后续命中自选后会长期保留。")
            : "未登录仅能查看8小时前的公开历史信号；最近8小时实时信号需登录后查看。"
          );
          setStrategyRecords([]);
          writeStrategyTrackRecords([]);
        }
        return;
      }

      const nextRecords = inboxSignals.map(strategyInboxToRecord);
      setStrategyLastScan(formatStrategyScanTime(inboxSignals[0].receivedAt || inboxSignals[0].time));
      setStrategyScanSummary(currentUser.id
        ? `${strategyHistoryMode === "current" ? "当前自选" : "全部历史"}策略信号 ${response.pagination?.total ?? inboxSignals.length} 条，当前页 ${inboxSignals.length} 条。`
        : `公开延迟信号 ${response.pagination?.total ?? inboxSignals.length} 条，仅展示8小时以前的历史信号。`
      );
      const merged = runIfMissing
        ? mergeStrategyRecords(nextRecords).slice(0, STRATEGY_TRACK_HISTORY_LIMIT)
        : mergeStrategyRecords([...nextRecords, ...strategyRecords]).slice(0, Math.max(STRATEGY_TRACK_HISTORY_LIMIT, strategyRecords.length));
      writeStrategyTrackRecords(merged.slice(0, STRATEGY_TRACK_HISTORY_LIMIT));
      setStrategyRecords(merged);
      setStrategyStatus("ready");
    } catch {
      setStrategyStatus(strategyRecords.length ? "ready" : "error");
    }
  }

  async function loadMoreStrategySignals() {
    if (!strategyPagination?.hasMore || strategyLoadingMore) return;
    setStrategyLoadingMore(true);
    try {
      const nextPage = strategyPagination.nextPage || strategyPagination.page + 1;
      const response = await apiGet<StrategySignalListResponse>(strategySignalEndpoint(nextPage, strategyPagination.limit));
      setStrategyPagination(response.pagination || null);
      const nextRecords = (response.signals || []).map(strategyInboxToRecord);
      setStrategyRecords((items) => {
        const merged = mergeStrategyRecords([...items, ...nextRecords]).slice(0, Math.max(STRATEGY_TRACK_HISTORY_LIMIT, items.length + nextRecords.length));
        writeStrategyTrackRecords(merged.slice(0, STRATEGY_TRACK_HISTORY_LIMIT));
        return merged;
      });
    } catch {
      onToast("加载更多策略历史失败");
    } finally {
      setStrategyLoadingMore(false);
    }
  }

  function handleOpenValueClaw(signalId: string) {
    const signal = liveSignals.find((item) => item.id === signalId);
    if (signal) {
      onOpenValueClawSignal(signal);
      return;
    }
    onNavigate("claw");
  }

  function handleOpenSignalDetail(symbol: string) {
    const signal = liveSignals.find((item) => item.symbol === symbol);
    if (signal) {
      onOpenSymbolSignal(signal);
      return;
    }
    onOpenSymbol(symbol);
  }

  function handleToggleWatchSymbol(symbol: string) {
    const cleanSymbol = normalizeDisplaySymbol(symbol);
    if (!cleanSymbol) return;

    const normalizedItems = watchlistSymbols.map(normalizeDisplaySymbol).filter(Boolean);
    const isWatched = normalizedItems.includes(cleanSymbol);
    const nextItems = isWatched
      ? normalizedItems.filter((item) => item !== cleanSymbol)
      : [...normalizedItems, cleanSymbol];
    setWatchlistSymbols(nextItems);
    onToast(isWatched ? `${cleanSymbol} 已移出观察列表` : `${cleanSymbol} 已加入观察列表`);
  }

  return (
    <section className="view active-view polished-screen radar-tracking-screen">
      <section id="radar-tools-panel" className="radar-tools-panel" aria-label="信号筛选与历史">
      <RadarWorkspaceChrome
        activeSource={trackingSection}
        onSourceChange={setTrackingSection}
        listenerLabel={listenerLabel}
        latestScanLabel={latestScanLabel}
        categoryItems={radarCategoryItems}
        activeCategory={activeRadarCategory}
        onCategoryChange={selectRadarCategory}
        onOpenFilters={() => setRuleSettingsOpen(true)}
      />
      {trackingSection !== "strategy" && <section className="ai-track-login-strip">
        <span>{currentUser.id ? `已同步实时信号，下次扫描 ${scanSchedule.time}` : `当前可查看 ${radarWindow} 前信号，登录了解更多。`}</span>
        <button type="button" onClick={() => (currentUser.id ? setRuleSettingsOpen(true) : setUpgradePrompt({ title: "登录后配置雷达规则", desc: "未登录只能查看延迟信号。登录后可配置规则，升级后可开启更多周期、推送和完整战绩。" }))}>{currentUser.id ? "规则" : "去登录"}</button>
      </section>}
      {trackingSection === "strategy" && currentUser.id && <section className="ai-track-login-strip">
        <span>{strategyHistoryMode === "current" ? "当前自选：只看仍启用自选币种/周期" : "全部历史：保留取消自选前收到过的信号"}</span>
        <button type="button" onClick={() => setStrategyHistoryMode((mode) => mode === "current" ? "all" : "current")}>{strategyHistoryMode === "current" ? "全部历史" : "当前自选"}</button>
      </section>}
      {trackingSection === "strategy" && !currentUser.id && (
        <UpgradeGuideCard title="实时信号需登录后开启" desc="未登录只能查看 8 小时延迟的全市场历史；登录并升级后可按自选币种实时接收推送。" actionLabel="登录查看实时" onClick={() => onNavigate("login")} />
      )}
      {trackingSection === "strategy" && currentUser.id && planLevel(entitlements.plan) < 3 && (
        <UpgradeGuideCard title="升级解锁更多周期和完整战绩" desc={`${entitlements.plan || "Free"} 当前可用周期 ${(entitlements.allowedTimeframes || []).join(" / ") || "5m"}，升级可解锁更多自选、4h/24h 战绩和更高推送额度。`} onClick={() => onNavigate("plans")} />
      )}
      {ruleSettingsOpen && (
        <div className="symbol-alert-modal radar-rule-modal">
          <button className="symbol-alert-backdrop" type="button" aria-label="关闭雷达规则设置" onClick={() => setRuleSettingsOpen(false)} />
          <section className="polished-card symbol-alert-card symbol-rule-card" role="dialog" aria-modal="true" aria-label="雷达规则设置">
            <div className="symbol-alert-head">
              <span><SystemIcon name="target" /></span>
              <div><strong>雷达规则设置</strong><em>调整扫描窗口、入选阈值与推送方式</em></div>
              <button type="button" aria-label="关闭" onClick={() => setRuleSettingsOpen(false)}><SystemIcon name="x" /></button>
            </div>
            {trackingSection === "strategy" && (
              <div className="strategy-filter-panel">
                <div className="strategy-filter-row symbol-row">
                  <label>
                    <span>币种</span>
                    <input value={strategyFilterSymbol} onChange={(event) => setStrategyFilterSymbol(event.target.value)} placeholder="BTC / ETH / SOL" />
                  </label>
                  <button type="button" onClick={resetStrategyFilters}>重置</button>
                </div>
                <div className="strategy-filter-row quick-row" role="group" aria-label="策略信号周期筛选">
                  {["all", "5m", "15m", "1h", "4h"].map((item) => {
                    const allowed = item === "all" || !currentUser.id || (entitlements.allowedTimeframes || ["5m"]).includes(item);
                    return <button key={`tf-${item}`} className={`${strategyFilterTimeframe === item ? "active" : ""} ${allowed ? "" : "locked"}`} type="button" aria-disabled={!allowed} onClick={() => allowed ? setStrategyFilterTimeframe(item) : setUpgradePrompt({ title: `升级解锁 ${item} 策略信号`, desc: `${entitlements.plan || "Free"} 当前可用周期 ${(entitlements.allowedTimeframes || ["5m"]).join(" / ")}。升级后可查看更多周期的历史和实时信号。` })}>{item === "all" ? "全部周期" : item}{allowed ? "" : " · 升级"}</button>;
                  })}
                </div>
                <div className="strategy-filter-row quick-row score-row" role="group" aria-label="策略信号评分筛选">
                  {[{ key: "all", label: "全部评分" }, { key: "65", label: "65+" }, { key: "80", label: "80+" }].map((item) => (
                    <button key={`score-${item.key}`} className={strategyFilterMinScore === item.key ? "active" : ""} type="button" onClick={() => setStrategyFilterMinScore(item.key)}>{item.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="rule-control-group">
              <strong>扫描窗口</strong>
              <div className="rule-segment">
                {(["4H", "8H", "24H"] as const).map((item) => (
                  <button className={radarWindow === item ? "active" : ""} type="button" key={item} onClick={() => setRadarWindow(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="rule-control-group">
              <strong>异常入选阈值</strong>
              <div className="rule-segment">
                {[60, 70, 80].map((item) => {
                  const allowed = item >= (entitlements.minAlertScore || 0);
                  return <button className={`${radarThreshold === item ? "active" : ""} ${allowed ? "" : "locked"}`} type="button" key={item} aria-disabled={!allowed} onClick={() => allowed ? setRadarThreshold(item) : setUpgradePrompt({ title: "当前套餐最低分受限", desc: `${entitlements.plan || "Free"} 最低推送/入选分为 ${entitlements.minAlertScore || 0}+，升级后可使用更灵活的信号阈值。` })}>{item}+{allowed ? "" : " · 套餐最低"}</button>;
                })}
              </div>
            </div>
            <button className={`rule-toggle ${radarPushEnabled ? "on" : ""} ${entitlements.feishuAlerts ? "" : "locked"}`} type="button" aria-pressed={radarPushEnabled} aria-disabled={!entitlements.feishuAlerts} onClick={() => entitlements.feishuAlerts ? setRadarPushEnabled((enabled) => !enabled) : setUpgradePrompt({ title: "升级开启实时推送", desc: "当前套餐不支持飞书实时推送。升级后可把高分信号同步到告警渠道。" })}>
              <span>同步到告警页面</span><i>{entitlements.feishuAlerts ? (radarPushEnabled ? "已开启" : "已关闭") : "升级解锁"}</i>
            </button>
            <button type="button" onClick={() => { setRuleSettingsOpen(false); onToast("雷达规则已保存"); }}>保存规则</button>
          </section>
        </div>
      )}
      </section>
      <section className="live-command__history-actions">
        {trackingSection === "strategy" && strategyPagination?.hasMore && (
          <button className="scan-history-more" type="button" disabled={strategyLoadingMore} onClick={loadMoreStrategySignals}>
            {strategyLoadingMore ? "加载中..." : `加载更多历史（${strategyPagination.total - strategyRecords.length}）`}
          </button>
        )}
      </section>
      <LiveSignalCommand
        signals={liveSignals}
        selectedSignalId={selectedLiveSignalId}
        activeFilter={activeLiveFilter}
        listeningStatus={listeningStatus}
        emptyState={liveEmptyState}
        now={scanNow}
        onFilterChange={setActiveLiveFilter}
        onSelectSignal={setSelectedLiveSignalId}
        onOpenDetail={handleOpenSignalDetail}
        onOpenValueClaw={handleOpenValueClaw}
        onToggleWatch={handleToggleWatchSymbol}
      />
      {upgradePrompt && <UpgradeModal title={upgradePrompt.title} desc={upgradePrompt.desc} onClose={() => setUpgradePrompt(null)} onUpgrade={() => { setUpgradePrompt(null); onNavigate(currentUser.id ? "plans" : "login"); }} actionLabel={currentUser.id ? "查看会员套餐" : "去登录"} />}
    </section>
  );
}


function UpgradeGuideCard({ actionLabel = "查看会员套餐", desc, onClick, title }: { actionLabel?: string; desc: string; onClick: () => void; title: string }) {
  return (
    <section className="upgrade-guide-card">
      <span className="upgrade-guide-badge"><SystemIcon name="spark" />会员权益</span>
      <div><strong>{title}</strong><p>{desc}</p></div>
      <button type="button" onClick={onClick}>{actionLabel}</button>
    </section>
  );
}

function UpgradeModal({ actionLabel = "查看会员套餐", desc, onClose, onUpgrade, title }: { actionLabel?: string; desc: string; onClose: () => void; onUpgrade: () => void; title: string }) {
  return (
    <div className="upgrade-modal">
      <button className="upgrade-modal-backdrop" type="button" aria-label="关闭会员升级提示" onClick={onClose} />
      <section className="polished-card upgrade-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="upgrade-modal-icon"><SystemIcon name="spark" /></div>
        <div><strong>{title}</strong><p>{desc}</p></div>
        <div className="upgrade-modal-actions">
          <button type="button" onClick={onUpgrade}>{actionLabel}</button>
          <button type="button" onClick={onClose}>稍后再说</button>
        </div>
      </section>
    </div>
  );
}

function EntitlementTeaser({ children, label }: { children: ReactNode; label: string }) {
  return <span className="entitlement-teaser"><span>{children}</span><em>{label}</em></span>;
}

function StrategyPerformanceStrip({ entitlements, performance }: { entitlements?: Entitlements; performance?: SignalPerformance }) {
  const showFullOutcome = Boolean(entitlements?.signalOutcomes) || planLevel(entitlements?.plan) >= 2;
  if (!performance) {
    return <span className="strategy-performance-strip pending"><em>战绩</em><strong>计算中</strong><span>等待行情回看</span>{!showFullOutcome && <span>升级后查看完整回看</span>}</span>;
  }
  const returns = performance.returns || {};
  const outcomeLabel = signalOutcomeLabel(performance.outcomeStatus);
  return (
    <span className={`strategy-performance-strip ${showFullOutcome ? "" : "locked"}`}>
      <em>战绩</em>
      <strong>{showFullOutcome ? outcomeLabel : "基础预览"}</strong>
      <span>15m {formatPerformancePct(returns["15m"])}</span>
      <span>1h {formatPerformancePct(returns["1h"])}</span>
      {showFullOutcome ? (
        <>
          <span>4h {formatPerformancePct(returns["4h"])}</span>
          <span>24h {formatPerformancePct(returns["24h"])}</span>
          <span>最大有利 {formatPerformancePct(performance.maxFavorablePct)}</span>
          <span>最大不利 {formatPerformancePct(performance.maxAdversePct)}</span>
        </>
      ) : (
        <EntitlementTeaser label="升级解锁">4h / 24h / 最大波动</EntitlementTeaser>
      )}
    </span>
  );
}

function StrategyPerformanceDetailCard({ entitlements, loading, onUpgrade, record }: { entitlements: Entitlements; loading: boolean; onUpgrade: () => void; record?: RadarTimelineRecord }) {
  const performance = record?.performance;
  const returns = performance?.returns || {};
  if (!record && !loading) {
    return (
      <section className="polished-card symbol-performance-card empty">
        <div className="card-title"><div><h2>策略战绩</h2><span>当前币种暂无可展示的历史策略信号</span></div></div>
        <p>有新的实时信号或公开延迟历史后，这里会展示入场价、回看收益、最大有利和最大不利波动。</p>
      </section>
    );
  }
  return (
    <section className="polished-card symbol-performance-card">
      <div className="card-title">
        <div><h2>策略战绩</h2><span>{loading ? "正在同步历史回看" : record?.title || "最近策略信号"}</span></div>
      </div>
      <div className="symbol-performance-summary">
        <article><span>状态</span><strong>{performance ? signalOutcomeLabel(performance.outcomeStatus) : "计算中"}</strong></article>
        <article><span>入场价</span><strong>{formatPerformancePrice(performance?.entryPrice)}</strong></article>
        <article><span>15m</span><strong className={performanceTone(returns["15m"])}>{formatPerformancePct(returns["15m"])}</strong></article>
        <article><span>1h</span><strong className={performanceTone(returns["1h"])}>{formatPerformancePct(returns["1h"])}</strong></article>
        <article><span>4h</span><strong className={performanceTone(returns["4h"])}>{formatPerformancePct(returns["4h"])}</strong></article>
        <article><span>24h</span><strong className={performanceTone(returns["24h"])}>{formatPerformancePct(returns["24h"])}</strong></article>
      </div>
      <StrategyPerformanceStrip entitlements={entitlements} performance={performance} />
      <p>{record?.body || "等待行情回看完成后展示完整战绩。"}</p>
      {!entitlements.signalOutcomes && (
        <div className="performance-upgrade-note"><span>当前套餐仅展示基础回看，升级后解锁完整 4h/24h、最大有利/不利和历史胜率统计。</span><button type="button" onClick={onUpgrade}>升级查看完整战绩</button></div>
      )}
      {performance?.updatedAt && <small>战绩更新时间：{formatPerformanceDate(performance.updatedAt)}</small>}
    </section>
  );
}

function isStrategyPerformanceRecord(record: ScanRecord) {
  return record.performance !== undefined || record.tags.some((tag) => /Pine|strategy|趋势|反转|看涨|看跌|5m|15m|1h|4h/i.test(tag));
}

function signalOutcomeLabel(status?: string | null) {
  if (status === "success" || status === "win") return "已验证成功";
  if (status === "failed" || status === "loss") return "已验证失败";
  if (status === "expired" || status === "invalid") return "已失效";
  if (status === "partial") return "部分达标";
  return "验证中";
}

function formatPerformancePct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "--";
  const pct = Number(value) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function performanceTone(value?: number | null) {
  const next = Number(value);
  if (!Number.isFinite(next) || next === 0) return "";
  return next > 0 ? "success" : "negative";
}

function formatPerformancePrice(value?: number | null) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return "--";
  if (price >= 1) return price.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatPerformanceDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function AlertsPage({ entitlements, onNavigate, onOpenSearch, onOpenSymbol, onToast, signals }: { entitlements: Entitlements; onNavigate: (view: ViewName) => void; onOpenSearch: () => void; onOpenSymbol: (symbol: string) => void; onToast: (message: string) => void; signals: Signal[] }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; desc: string } | null>(null);
  const dailyPushUsed = Number(entitlements.dailyPushUsed ?? 0);
  const dailyPushLimit = Number(entitlements.maxPushPerDay ?? entitlements.dailySignalQuota ?? 0);
  const remainingDailyPushes = Math.max(0, Number(entitlements.remainingDailyPushes ?? dailyPushLimit - dailyPushUsed));
  const dailyPushPct = dailyPushLimit > 0 ? Math.min(100, Math.round((dailyPushUsed / dailyPushLimit) * 100)) : 0;
  const alertMinScore = Number(entitlements.minAlertScore || 80);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookMasked, setWebhookMasked] = useState("");
  const [pushEnabled, setPushEnabled] = useState(Boolean(entitlements.feishuAlerts));
  const [pushMinScore, setPushMinScore] = useState(entitlements.minAlertScore || 80);
  const [pushCooldownMinutes, setPushCooldownMinutes] = useState(15);
  const [pushSaving, setPushSaving] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    void apiGet<FeishuConfig>("/api/alerts/feishu/config")
      .then((config) => {
        setWebhookUrl("");
        setWebhookMasked(config.config?.webhookMasked || "");
        setPushEnabled(Boolean(config.enabled ?? config.config?.enabled));
        setPushMinScore(Number(config.minScore ?? config.config?.minScore ?? entitlements.minAlertScore ?? 80));
        setPushCooldownMinutes(Number(config.cooldownMinutes ?? config.config?.cooldownMinutes ?? 15));
      })
      .catch(() => undefined);
  }, [settingsOpen, entitlements.minAlertScore]);

  async function saveFeishu() {
    setPushSaving(true);
    try {
      const minAllowedScore = entitlements.minAlertScore || 0;
      const payload: { webhookUrl?: string; enabled: boolean; minScore: number; cooldownMinutes: number } = {
        enabled: pushEnabled,
        minScore: Math.max(minAllowedScore, Math.round(Number(pushMinScore) || minAllowedScore)),
        cooldownMinutes: Math.max(0, Math.min(Math.round(Number(pushCooldownMinutes) || 0), 1440))
      };
      if (webhookUrl.trim()) payload.webhookUrl = webhookUrl.trim();
      const config = await apiPut<FeishuConfig>("/api/alerts/feishu/config", payload);
      setWebhookUrl("");
      setWebhookMasked(config.config?.webhookMasked || webhookMasked);
      setPushEnabled(Boolean(config.enabled ?? config.config?.enabled));
      setPushMinScore(Number(config.minScore ?? config.config?.minScore ?? payload.minScore));
      setPushCooldownMinutes(Number(config.cooldownMinutes ?? config.config?.cooldownMinutes ?? payload.cooldownMinutes));
      onToast("推送设置已保存");
      setSettingsOpen(false);
    } finally {
      setPushSaving(false);
    }
  }

  async function testFeishu() {
    await apiPost("/api/alerts/feishu/test", {});
    onToast("测试推送已发送");
  }

  return (
    <section className="view active-view polished-screen alert-polished">
      <Topbar title="告警" eyebrow="已开启" badge="告警运营" onSearch={onOpenSearch} />
      <section className="polished-card alert-center-card">
        <h1>异常告警中心</h1>
        <p>根据信任度、风险等级和自选币种自动推送</p>
        <div className="risk-tags"><span>高风险 3</span><span>观察 9</span><span>已处理 21</span></div>
      </section>
      <section className="polished-card push-channel-card">
        <span className="icon-tile blue"><SystemIcon name="send" /></span>
        <div><strong>推送渠道</strong><span>飞书、Telegram、邮件</span></div>
        <div className="push-channel-actions">
          <button className="push-settings-button" type="button" onClick={() => entitlements.feishuAlerts ? setSettingsOpen(true) : setUpgradePrompt({ title: "升级配置实时推送", desc: "当前套餐不含飞书实时推送。升级后可配置 Webhook、最低分数和冷却时间。" })}><SystemIcon name="settings" />设置</button>
          <button className={`toggle-switch ${pushEnabled ? "on" : ""} ${entitlements.feishuAlerts ? "" : "locked"}`} type="button" aria-pressed={pushEnabled} aria-disabled={!entitlements.feishuAlerts} aria-label="切换推送渠道" onClick={() => entitlements.feishuAlerts ? setPushEnabled((enabled) => !enabled) : setUpgradePrompt({ title: "升级开启实时推送", desc: "Free 套餐每日推送额度为 0。升级后可按自选币种接收实时信号。" })}><i /></button>
        </div>
      </section>
      <section className="polished-card push-usage-card">
        <div className="card-title"><div><h2>今日推送用量</h2><span>{entitlements.plan} 套餐 · {dailyPushLimit > 0 ? `剩余 ${remainingDailyPushes} 条` : "当前套餐不含实时推送"}</span></div><button type="button" onClick={() => entitlements.feishuAlerts ? setSettingsOpen(true) : setUpgradePrompt({ title: "升级配置推送额度", desc: "当前套餐没有实时推送额度。升级后可设置最低分、冷却时间并开启飞书推送。" })}>配置</button></div>
        <div className="push-usage-meter"><i style={{ width: `${dailyPushPct}%` }} /></div>
        <div className="push-usage-grid">
          <article><span>已成功</span><strong>{dailyPushUsed}</strong></article>
          <article><span>今日上限</span><strong>{dailyPushLimit}</strong></article>
          <article><span>跳过/失败</span><strong>{Number(entitlements.dailyPushSkipped ?? 0)}/{Number(entitlements.dailyPushFailed ?? 0)}</strong></article>
        </div>
      </section>
      {(!entitlements.feishuAlerts || dailyPushLimit <= 0) && (
        <UpgradeGuideCard title="升级开启实时推送" desc="当前套餐不含飞书实时推送或每日额度为 0。升级后可按自选币种即时接收高分信号。" onClick={() => onNavigate("plans")} />
      )}
      <PushPerformanceCard signals={signals} onOpenSymbol={onOpenSymbol} />
      <section className="polished-card alert-queue-card">
        <div className="card-title">
          <div><h2>告警队列</h2></div>
          <button type="button"><SystemIcon name="filter" />全部</button>
        </div>
        <div className="polished-list">
          {signals.slice(0, 5).map((signal) => (
            <article className={`alert-queue-row ${signal.score >= 70 ? "long" : ""}`} key={signal.id || signal.symbol}>
              <CoinIcon symbol={signal.symbol} />
              <div>
                <strong>{signal.symbol} {signal.title}</strong>
                <span>评分 {signal.score} · {signal.confidence || "实时行情"} · {signal.time || "--"}</span>
                <div className="alert-source-row">
                  <span>实时雷达</span>
                  <span>Yansir 策略引擎</span>
                  <span>{signal.score >= alertMinScore ? "已同步" : "观察中"}</span>
                </div>
              </div>
              <em>{scoreLabel(signal.score)}</em>
            </article>
          ))}
        </div>
        <button className="primary-wide" type="button" aria-disabled={!entitlements.feishuAlerts} onClick={() => entitlements.feishuAlerts ? onToast("今日摘要发送任务已加入队列") : setUpgradePrompt({ title: "升级发送今日摘要", desc: "今日摘要属于实时推送权益。升级后可把自选币种信号摘要发送到飞书。" })}><SystemIcon name="send" />{entitlements.feishuAlerts ? "一键发送今日摘要" : "升级发送今日摘要"}</button>
      </section>
      {upgradePrompt && <UpgradeModal title={upgradePrompt.title} desc={upgradePrompt.desc} onClose={() => setUpgradePrompt(null)} onUpgrade={() => { setUpgradePrompt(null); onNavigate("plans"); }} />}
      {settingsOpen && (
        <div className="push-settings-modal">
          <button className="push-settings-backdrop" type="button" onClick={() => setSettingsOpen(false)} />
          <section className="polished-card push-settings-card">
            <div className="push-settings-head">
              <strong>推送设置</strong>
              <span>当前正式可用：飞书 Webhook</span>
              <button className="push-settings-close" type="button" onClick={() => setSettingsOpen(false)}><SystemIcon name="x" /></button>
            </div>
            <div className="push-channel-options">
              <button className="active" type="button"><SystemIcon name="send" /><span>飞书</span><em>可配置</em></button>
              <button className="pending" type="button"><SystemIcon name="message" /><span>Telegram</span><em>待接入</em></button>
              <button className="pending" type="button"><SystemIcon name="bell" /><span>邮件</span><em>待接入</em></button>
            </div>
            <label className="push-webhook-field">
              <span>飞书 Webhook</span>
              <input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={webhookMasked ? `已配置：${webhookMasked}，留空保持不变` : "https://open.feishu.cn/open-apis/bot/v2/hook/..."} />
              {webhookMasked && <em>当前已保存：{webhookMasked}</em>}
            </label>
            <div className="push-rule-grid">
              <label className="push-webhook-field">
                <span>最低推送分数</span>
                <input type="number" min={entitlements.minAlertScore || 0} max="100" value={pushMinScore} onChange={(event) => setPushMinScore(Number(event.target.value))} />
                <em>当前套餐最低不能低于 {entitlements.minAlertScore || 0} 分</em>
              </label>
              <label className="push-webhook-field">
                <span>冷却时间（分钟）</span>
                <input type="number" min="0" max="1440" value={pushCooldownMinutes} onChange={(event) => setPushCooldownMinutes(Number(event.target.value))} />
                <em>同一币种/周期/方向在冷却内不重复推送</em>
              </label>
            </div>
            <label className="push-enable-row">
              <span><strong>启用飞书实时推送</strong><em>{entitlements.feishuAlerts ? `今日 ${dailyPushUsed}/${dailyPushLimit}，剩余 ${remainingDailyPushes} 条` : "当前套餐不支持或未启用飞书"}</em></span>
              <button className={`toggle-switch ${pushEnabled ? "on" : ""} ${entitlements.feishuAlerts ? "" : "locked"}`} type="button" aria-pressed={pushEnabled} aria-disabled={!entitlements.feishuAlerts} onClick={() => entitlements.feishuAlerts ? setPushEnabled((enabled) => !enabled) : setUpgradePrompt({ title: "升级开启飞书推送", desc: "当前套餐暂不支持实时推送。升级后可开启飞书、设置阈值和冷却。" })}><i /></button>
            </label>
            {!entitlements.feishuAlerts && <div className="performance-upgrade-note"><span>当前套餐暂不支持实时推送。</span><button type="button" onClick={() => onNavigate("plans")}>升级开通推送</button></div>}
            <div className="push-settings-actions">
              <button type="button" onClick={saveFeishu} disabled={pushSaving}>{pushSaving ? "保存中..." : "保存设置"}</button>
              <button type="button" onClick={() => entitlements.feishuAlerts ? void testFeishu() : setUpgradePrompt({ title: "升级测试推送", desc: "当前套餐不支持飞书推送。升级后可测试 Webhook 并开启实时信号提醒。" })}>测试推送</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function PushPerformanceCard({ onOpenSymbol, signals }: { onOpenSymbol: (symbol: string) => void; signals: Signal[] }) {
  const [pushTab, setPushTab] = useState<"momentum" | "opportunity" | "risk">("momentum");
  const [gainSortDesc, setGainSortDesc] = useState(true);
  const sourceSignals = signals.filter((signal) => {
    if (pushTab === "opportunity") return signal.score >= 75 || signal.direction === "long";
    if (pushTab === "risk") return signal.score < 60 || signal.direction === "short";
    return signal.score >= 60 || signal.direction !== "short";
  });
  const rows = (sourceSignals.length ? sourceSignals : signals).slice(0, 8).map((signal) => {
    return {
      symbol: signal.symbol,
      price: signal.price || "--",
      gain: signal.gain || "--",
      time: signal.time || "--",
      source: signal.score >= 85 ? "Alpha" : signal.score >= 70 ? "Signal" : ""
    };
  });
  const sortedRows = [...rows].sort((left, right) => {
    const leftGain = Number.parseFloat(left.gain.replace("%", ""));
    const rightGain = Number.parseFloat(right.gain.replace("%", ""));
    if (!Number.isFinite(leftGain) && !Number.isFinite(rightGain)) return 0;
    if (!Number.isFinite(leftGain)) return 1;
    if (!Number.isFinite(rightGain)) return -1;
    return gainSortDesc ? rightGain - leftGain : leftGain - rightGain;
  });

  return (
    <section className="polished-card push-performance-card">
      <div className="card-title">
        <div><h2>推送表现</h2><span>推送后涨幅会在后续行情里持续追踪</span></div>
        <button type="button" aria-pressed="true" onClick={() => setGainSortDesc((current) => !current)}>按涨幅 {gainSortDesc ? "↓" : "↑"}</button>
      </div>
      <div className="push-performance-tabs" role="tablist" aria-label="推送表现分类">
        <button className={pushTab === "momentum" ? "active" : ""} type="button" onClick={() => setPushTab("momentum")}>异动看涨监控</button>
        <button className={pushTab === "opportunity" ? "active" : ""} type="button" onClick={() => setPushTab("opportunity")}>机会看涨监控</button>
        <button className={pushTab === "risk" ? "active" : ""} type="button" onClick={() => setPushTab("risk")}>风险看跌监控</button>
      </div>
      <div className="push-performance-head"><span>币种</span><span>推送价格($)</span><span>推送后涨幅</span><span>时间</span></div>
      <div className="push-performance-list">
        {sortedRows.map((row) => (
          <article className="push-performance-row" key={`${row.symbol}-${row.time}`}>
            <div className="push-performance-coin">
              {row.source && <span>{row.source}</span>}
              <button type="button" onClick={() => onOpenSymbol(row.symbol)}><CoinIcon symbol={row.symbol} /><strong>{normalizeDisplaySymbol(row.symbol)}</strong></button>
            </div>
            <strong className="push-price">{row.price}</strong>
            <em className={row.gain.startsWith("-") ? "negative" : "positive"}>{row.gain}</em>
            <small>{row.time}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ValueClawPage({ currentUser, onClearSignalContext, onNavigate, onOpenSymbol, onToast, rows, signalContext, signals }: { currentUser: CurrentUser; onClearSignalContext: () => void; onNavigate: (view: ViewName) => void; onOpenSymbol: (symbol: string) => void; onToast: (message: string) => void; rows: MarketRow[]; signalContext?: LiveSignal | null; signals: Signal[] }) {
  const [input, setInput] = useState("帮我分析 BTC 当前有没有机会，风险点在哪里");
  const [loading, setLoading] = useState(false);
  const [clawStatus, setClawStatus] = useState<ClawStatus | null>(null);
  const signedIn = Boolean(currentUser.id);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      blocks: [
        { type: "summary", title: "我是 AIClaw，一个面向币种和机会的聊天式 Agent", items: ["你可以直接问某个币为什么异动、现在是否值得跟踪、主要风险是什么、适合怎样设置告警。"] },
        { type: "action", title: "可以这样问", items: ["分析 BTC 当前机会和风险", "今天哪些币值得重点关注？", "帮我解释最新异常信号的触发原因"] }
      ]
    }
  ]);
  const llmOnline = Boolean(clawStatus?.llmConfigured);

  useEffect(() => {
    if (!signalContext) return;
    setInput(`复核 ${signalContext.symbol} 这条 Yansir 策略信号：方向 ${formatDirectionLabel(signalContext.direction)}，策略分 ${signalContext.score}/100，主要风险 ${signalContext.risk}`);
  }, [signalContext]);

  useEffect(() => {
    if (!signedIn) return;
    void apiGet<ClawStatus>("/api/claw/status")
      .then(setClawStatus)
      .catch(() => setClawStatus({ llmConfigured: false, provider: "local-rules", source: "状态接口不可用" }));
  }, [signedIn]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;
    setMessages((items) => [...items, { role: "user", text: prompt }]);
    setInput(prompt);
    setLoading(true);
    try {
      const response = await apiPost<ClawResponse>("/api/claw/chat", { message: prompt });
      setMessages((items) => [...items, { role: "agent", blocks: response.blocks || [], meta: response.mode === "llm" ? `大模型 · ${response.model || response.source || "OpenAI compatible"}` : response.fallbackReason || "实时行情 + 规则分析" }]);
    } catch {
      const target = extractSymbol(prompt) || rows[0]?.symbol || "BTC";
      setMessages((items) => [...items, { role: "agent", blocks: fallbackClawBlocks(target, rows, signals), meta: "接口暂不可用，已使用本地行情上下文生成" }]);
      onToast("AIClaw 暂时使用本地分析");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="view active-view polished-screen claw-agent-screen">
      <AIClawExperience
        status={!signedIn ? "需登录" : llmOnline ? "在线" : "规则分析在线"}
        signedIn={signedIn}
        insightCopy={`已加载 ${rows.length} 个市场行情和 ${signals.length} 条策略信号。`}
        messages={messages.map((message, index) =>
          message.role === "user" ? (
            <div className="agent-message user" key={index}><p>{message.text}</p></div>
          ) : (
            <div className="agent-message agent" key={index}>
              <strong>AIClaw</strong>
              {message.blocks?.map((block) => <ClawBlockCard block={block} key={`${block.type}-${block.title}`} onOpenSymbol={onOpenSymbol} />)}
              {message.meta && <small>{message.meta}</small>}
            </div>
          )
        )}
        signalContext={signalContext ? (
          <div className="ai-claw-signal-context__body">
            <div className="ai-claw-signal-context__facts">
              <span>来自实时雷达</span>
              <strong>{signalContext.symbol}</strong>
              <em>{formatDirectionLabel(signalContext.direction)} · {signalContext.score}/100</em>
            </div>
            <p>{signalContext.trigger}</p>
            <small>AIClaw 仅解释和复核该策略信号，不创建或覆盖交易方向；策略信号仍保持最高优先级。</small>
            <button type="button" onClick={() => onOpenSymbol(signalContext.symbol)}>查看币种详情</button>
          </div>
        ) : undefined}
        input={input}
        loading={loading}
        onQuickAction={(actionId) => setInput(buildAIClawPrompt(actionId, signalContext ? {
          symbol: signalContext.symbol,
          direction: signalContext.direction === "neutral" ? "flat" : signalContext.direction,
          score: signalContext.score,
        } : undefined))}
        onInput={setInput}
        onSubmit={sendMessage}
        onLogin={() => onNavigate("login")}
        onHelp={() => onToast("AIClaw 可解释市场行情和已有策略信号，不会创建或覆盖交易方向")}
        onClearContext={onClearSignalContext}
        renderIcon={(name) => <SystemIcon name={name} />}
      />
    </section>
  );
}

function AccountPage({ currentUser, entitlements, onLogout, onNavigate, onOpenSearch, rows, signals }: { currentUser: CurrentUser; entitlements: Entitlements; rows: MarketRow[]; signals: Signal[]; onLogout: () => void; onNavigate: (view: ViewName) => void; onOpenSearch: () => void }) {
  const signedIn = Boolean(currentUser.id);
  const watchlistCount = readWatchlistSymbols().filter((symbol) => rows.some((row) => normalizeDisplaySymbol(row.symbol) === symbol)).length;
  const measuredSignals = signals.filter((signal) => Number.isFinite(parseNumber(signal.gain)));
  const positiveSignals = measuredSignals.filter((signal) => parseNumber(signal.gain) > 0).length;
  const hitRate = measuredSignals.length ? `${Math.round((positiveSignals / measuredSignals.length) * 100)}%` : "--";

  return (
    <section className="view active-view polished-screen account-polished">
      <Topbar title="我的" eyebrow={`${entitlements.plan || currentUser.plan} 监控计划`} badge="账户与团队" onSearch={onOpenSearch} />
      <section className="profile-hero polished-card">
        <div className="profile-avatar"><SystemIcon name="user" /></div>
        <div><h1>{currentUser.name || "未登录"}</h1><p>{currentUser.plan || "Free"} · API {entitlements.apiAccess ? "正常" : "待开通"}</p></div>
        {signedIn ? <button type="button" onClick={onLogout}>退出</button> : <button type="button" onClick={() => onNavigate("login")}>登录</button>}
      </section>
      <section className="account-quick-grid">
        <button type="button" onClick={() => onNavigate("plans")}><SystemIcon name="spark" /><strong>会员套餐</strong><span>升级配额</span></button>
        <button type="button" onClick={() => onNavigate("team")}><SystemIcon name="network" /><strong>团队管理</strong><span>邀请与佣金</span></button>
        <button type="button"><SystemIcon name="bell" /><strong>推送偏好</strong><span>渠道配置</span></button>
      </section>
      <section className="stat-grid">
        <article><span>自选币种</span><strong>{watchlistCount}</strong></article>
        <article><span>今日推送</span><strong>{entitlements.dailyPushUsed ?? currentUser.signalUsed ?? 0}/{entitlements.maxPushPerDay ?? currentUser.signalQuota ?? 0}</strong></article>
        <article><span>命中率</span><strong className="success">{hitRate}</strong></article>
      </section>
      <section className="polished-card settings-card">
        <div className="card-title"><div><h2>监控配置</h2></div><button type="button"><SystemIcon name="settings" /></button></div>
        <button type="button"><strong>扫描周期</strong><span>5 分钟</span><SystemIcon name="chevron" /></button>
        <button type="button"><strong>告警阈值</strong><span>评分 ≥ {entitlements.minAlertScore || 50}</span><SystemIcon name="chevron" /></button>
      </section>
      <section className="polished-card connection-card">
        <div className="card-title"><div><h2>连接状态</h2></div><button type="button"><SystemIcon name="database" /></button></div>
        {["市场行情源", "链上数据源", "飞书机器人"].map((item) => (
          <div className="connection-row" key={item}><i /><strong>{item}</strong><span>正常</span></div>
        ))}
      </section>
    </section>
  );
}

function SymbolDetailPage({ currentUser, entitlements, onBack, onNavigate, onOpenValueClawSignal, onToast, radarSignalContext, seedRows, signals, symbol }: { currentUser: CurrentUser; entitlements: Entitlements; onBack: () => void; onNavigate: (view: ViewName) => void; onOpenValueClawSignal: (signal: LiveSignal) => void; onToast: (message: string) => void; radarSignalContext?: LiveSignal | null; seedRows: MarketRow[]; signals: Signal[]; symbol: string }) {
  const cleanSeedSymbol = normalizeDisplaySymbol(symbol);
  const cleanSymbol = cleanSeedSymbol;
  const seed = useMemo(
    () =>
      seedRows.find((row) => normalizeDisplaySymbol(row.symbol) === cleanSeedSymbol) || {
        symbol: cleanSeedSymbol || "UNKNOWN",
        price: "--",
        change: "--",
        score: 0,
        state: "等待实时行情",
        trend: []
      },
    [cleanSeedSymbol, seedRows]
  );
  const [row, setRow] = useState<MarketRow>(seed);
  const [detailTrend, setDetailTrend] = useState<number[]>(() => seed.trend || []);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => readScanHistory(cleanSymbol));
  const [strategyDetailRecords, setStrategyDetailRecords] = useState<RadarTimelineRecord[]>([]);
  const [strategyDetailLoading, setStrategyDetailLoading] = useState(false);
  const [scanHistoryVisibleCount, setScanHistoryVisibleCount] = useState(5);
  const [alertPreviewOpen, setAlertPreviewOpen] = useState(false);
  const [ruleSettingsOpen, setRuleSettingsOpen] = useState(false);
  const [controlMenuOpen, setControlMenuOpen] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState<{ title: string; desc: string } | null>(null);
  const [ruleInterval, setRuleInterval] = useState<"5m" | "15m" | "1h" | "4h">("5m");
  const [ruleThreshold, setRuleThreshold] = useState(70);
  const [rulePushEnabled, setRulePushEnabled] = useState(true);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(readWatchlistSymbols);
  const [watchlistItems, setWatchlistItems] = useState<StrategyWatchlistItem[]>([]);
  const [watchlistLimits, setWatchlistLimits] = useState<StrategyWatchlistLimits | null>(null);
  const [watchlistSaving, setWatchlistSaving] = useState(false);
  const relatedSignal = signals.find((signal) => normalizeDisplaySymbol(signal.symbol) === cleanSymbol);
  const isWatched = useMemo(
    () => watchlistSymbols.map(normalizeDisplaySymbol).includes(cleanSymbol),
    [cleanSymbol, watchlistSymbols]
  );

  useEffect(() => {
    setRow(seed);
    setDetailTrend(seed.trend || []);
  }, [cleanSymbol, seed]);

  useEffect(() => {
    const signalRecords = signals
      .filter((signal) => normalizeDisplaySymbol(signal.symbol) === cleanSymbol)
      .map((signal) => buildSignalScanRecord(cleanSymbol, signal));
    setScanHistory(mergeScanRecords([...signalRecords, ...readScanHistory(cleanSymbol)]));
  }, [cleanSymbol, signals]);

  useEffect(() => {
    setScanHistoryVisibleCount(5);
  }, [cleanSymbol]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlistSymbols));
    } catch {
      // Ignore local persistence failures; the current detail state still updates.
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    if (!currentUser.id) {
      setWatchlistLimits(null);
      return;
    }
    let alive = true;
    apiGet<StrategyWatchlistResponse>("/api/strategy/watchlist")
      .then((response) => {
        if (!alive) return;
        setWatchlistLimits(response.limits);
        setWatchlistItems(response.watchlist || []);
        const serverSymbols = response.watchlist
          .filter((item) => item.enabled)
          .map((item) => normalizeDisplaySymbol(item.symbol))
          .filter(Boolean);
        if (serverSymbols.length) {
          setWatchlistSymbols(Array.from(new Set(serverSymbols)));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [currentUser.id]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const [tickerResult, klinesResult] = await Promise.allSettled([
        apiGet<{ symbol: string; price: string; change: string; quoteVolume?: string; source?: string }>(`/api/market/ticker?symbol=${encodeURIComponent(cleanSymbol)}`),
        apiGet<{ candles: Array<{ close: number | string }> }>(`/api/market/klines?symbol=${encodeURIComponent(cleanSymbol)}&timeframe=5m&limit=288`)
      ]);

      if (!alive) return;

      const syncedTrend =
        klinesResult.status === "fulfilled" ? klinesResult.value.candles.map((candle) => Number(candle.close)).filter(Number.isFinite) : [];

      if (syncedTrend.length) {
        setDetailTrend(syncedTrend);
      } else {
        setDetailTrend((current) => (current.length ? current : seed.trend || []));
      }

      if (tickerResult.status === "fulfilled") {
        const ticker = tickerResult.value;
        setRow((current) => ({
          ...current,
          symbol: ticker.symbol.replace(/USDT$/, ""),
          price: ticker.price,
          change: ticker.change,
          oi: ticker.quoteVolume || current.oi,
          source: ticker.source || current.source,
          trend: syncedTrend.length ? syncedTrend : current.trend?.length ? current.trend : seed.trend || []
        }));
      } else if (syncedTrend.length) {
        setRow((current) => ({ ...current, trend: syncedTrend }));
      }

      if (tickerResult.status === "rejected" && klinesResult.status === "rejected") {
        onToast("详情页已展示列表数据，后台刷新暂未完成");
      }
    }
    void refresh();
    return () => {
      alive = false;
    };
  }, [cleanSymbol, onToast, seed.trend]);

  const score = relatedSignal?.score ?? row.score ?? 68;
  const tone: Tone = score >= 75 ? "danger" : score >= 60 ? "warning" : "success";
  const displaySymbol = normalizeDisplaySymbol(row.symbol) || cleanSymbol;
  const previewTitle = `${cleanSymbol} ${relatedSignal?.title || row.state}`;
  const previewBody = `异常评分 ${score}/100，${relatedSignal?.reason || `${row.state}，24H ${row.change}，现价 ${row.price}`}。建议关注最近 K 线确认与仓位风险。`;
  const detailSummary = relatedSignal?.reason || `${displaySymbol} 当前状态为 ${row.state}，现价 ${row.price}，24H ${row.change}，成交额 ${row.oi || "-"}。`;
  const combinedScanHistory = useMemo(
    () => mergeScanRecords([...strategyDetailRecords, ...scanHistory]),
    [scanHistory, strategyDetailRecords]
  );
  const latestStrategyRecord = strategyDetailRecords[0];
  const visibleScanHistory = combinedScanHistory.slice(0, scanHistoryVisibleCount);
  const detailTrendValues = detailTrend.length ? detailTrend : row.trend || [];
  const detailTrendVariant = row.change.startsWith("-") ? "red" : "dual";
  const planAllowedTimeframes = useMemo(
    () => (watchlistLimits?.allowedTimeframes?.length ? watchlistLimits.allowedTimeframes : entitlements.allowedTimeframes?.length ? entitlements.allowedTimeframes : ["5m"]),
    [entitlements.allowedTimeframes, watchlistLimits?.allowedTimeframes]
  );
  const planMinScore = watchlistLimits?.minAlertScore ?? entitlements.minAlertScore ?? 65;
  const currentWatchlistRule = useMemo(
    () => watchlistItems.find((item) => normalizeDisplaySymbol(item.symbol) === cleanSymbol),
    [cleanSymbol, watchlistItems]
  );

  useEffect(() => {
    if (!ruleSettingsOpen) return;
    const serverTimeframe = currentWatchlistRule?.timeframes?.find((item) => planAllowedTimeframes.includes(item));
    const nextTimeframe = (serverTimeframe || planAllowedTimeframes[0] || "5m") as "5m" | "15m" | "1h" | "4h";
    if (["5m", "15m", "1h", "4h"].includes(nextTimeframe)) {
      setRuleInterval(nextTimeframe);
    }
    setRuleThreshold(Math.max(currentWatchlistRule?.minScore ?? planMinScore, planMinScore));
    setRulePushEnabled(currentWatchlistRule?.pushEnabled ?? true);
  }, [cleanSymbol, currentWatchlistRule?.minScore, currentWatchlistRule?.pushEnabled, currentWatchlistRule?.timeframes, planAllowedTimeframes, planMinScore, ruleSettingsOpen]);

  async function saveSymbolRuleSettings() {
    const nextSymbol = cleanSymbol || displaySymbol;
    if (!currentUser.id) {
      setUpgradePrompt({ title: "登录后保存监控规则", desc: "登录后可把币种加入自选并保存周期、阈值和推送规则。" });
      return;
    }
    if (!planAllowedTimeframes.includes(ruleInterval)) {
      setUpgradePrompt({ title: `升级解锁 ${ruleInterval} 周期`, desc: `当前套餐 ${watchlistLimits?.plan || entitlements.plan || "Free"} 可用周期 ${planAllowedTimeframes.join(" / ")}。升级后可监控更多周期。` });
      return;
    }
    if (!isWatched && watchlistLimits && watchlistLimits.remainingSymbolSlots <= 0) {
      setUpgradePrompt({ title: "自选额度已满", desc: `当前套餐 ${watchlistLimits.plan} 最多自选 ${watchlistLimits.maxWatchlistSymbols} 个币种。升级后可追踪更多币种。` });
      return;
    }
    const minScore = Math.max(ruleThreshold, planMinScore);
    if (minScore !== ruleThreshold) {
      setRuleThreshold(minScore);
    }
    setWatchlistSaving(true);
    try {
      const response = await apiPut<StrategyWatchlistResponse>("/api/strategy/watchlist", {
        items: [{
          symbol: nextSymbol,
          timeframes: [ruleInterval],
          enabled: true,
          minScore,
          signalScope: "all",
          pushEnabled: rulePushEnabled
        }]
      });
      setWatchlistLimits(response.limits);
      setWatchlistItems(response.watchlist || []);
      const serverSymbols = response.watchlist
        .filter((item) => item.enabled)
        .map((item) => normalizeDisplaySymbol(item.symbol))
        .filter(Boolean);
      setWatchlistSymbols(Array.from(new Set(serverSymbols)));
      setRuleSettingsOpen(false);
      onToast(`${nextSymbol} 监控规则已保存：${ruleInterval}，${minScore}+，推送${rulePushEnabled ? "开启" : "关闭"}`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "监控规则保存失败");
    } finally {
      setWatchlistSaving(false);
    }
  }

  async function toggleDetailWatchlist() {
    const nextSymbol = cleanSymbol || displaySymbol;
    if (!currentUser.id) {
      setUpgradePrompt({ title: "登录后加入自选", desc: "未登录只能浏览延迟信号。登录后可加入自选，升级后可追踪更多币种和周期。" });
      return;
    }
    if (!isWatched && watchlistLimits && watchlistLimits.remainingSymbolSlots <= 0) {
      setUpgradePrompt({ title: "自选额度已满", desc: `当前套餐 ${watchlistLimits.plan} 最多自选 ${watchlistLimits.maxWatchlistSymbols} 个币种。升级后可追踪更多币种。` });
      return;
    }
    const enabled = !isWatched;
    const allowedTimeframes = watchlistLimits?.allowedTimeframes?.length ? watchlistLimits.allowedTimeframes : entitlements.allowedTimeframes.length ? entitlements.allowedTimeframes : ["5m"];
    const minScore = Math.max(watchlistLimits?.minAlertScore ?? entitlements.minAlertScore ?? 65, 0);
    setWatchlistSaving(true);
    try {
      const response = await apiPut<StrategyWatchlistResponse>("/api/strategy/watchlist", {
        items: [{
          symbol: nextSymbol,
          timeframes: allowedTimeframes,
          enabled,
          minScore,
          signalScope: "all",
          pushEnabled: true
        }]
      });
      setWatchlistLimits(response.limits);
      setWatchlistItems(response.watchlist || []);
      const serverSymbols = response.watchlist
        .filter((item) => item.enabled)
        .map((item) => normalizeDisplaySymbol(item.symbol))
        .filter(Boolean);
      setWatchlistSymbols(Array.from(new Set(serverSymbols)));
      onToast(enabled ? `${nextSymbol} 已加入自选` : `${nextSymbol} 已移出自选`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "自选币种保存失败");
    } finally {
      setWatchlistSaving(false);
    }
  }

  useEffect(() => {
    if (!cleanSymbol || (row.price === "--" && !relatedSignal)) return;
    const record = buildScanRecord(cleanSymbol, row, relatedSignal, score, tone);
    setScanHistory((current) => {
      const next = mergeScanRecords([record, ...current]);
      writeScanHistory(cleanSymbol, next);
      return next;
    });
  }, [cleanSymbol, relatedSignal?.reason, relatedSignal?.title, row.change, row.oi, row.price, row.source, row.state, score, tone]);

  useEffect(() => {
    if (!cleanSymbol) return;
    let alive = true;
    setStrategyDetailLoading(true);
    const endpoint = currentUser.id
      ? `/api/strategy/inbox?mode=all&limit=20&page=1&symbol=${encodeURIComponent(cleanSymbol)}`
      : `/api/strategy/public-signals?limit=20&page=1&symbol=${encodeURIComponent(cleanSymbol)}`;
    apiGet<StrategySignalListResponse>(endpoint)
      .then((response) => {
        if (!alive) return;
        const records = (response.signals || [])
          .filter((item) => normalizeDisplaySymbol(item.symbol) === cleanSymbol)
          .map(strategyInboxToRecord);
        setStrategyDetailRecords(records);
      })
      .catch(() => {
        if (alive) setStrategyDetailRecords([]);
      })
      .finally(() => {
        if (alive) setStrategyDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cleanSymbol, currentUser.id]);

  return (
    <section className="view active-view polished-screen symbol-detail">
      <header className="polished-symbol-head">
        <button type="button" onClick={onBack}><SystemIcon name="chevronLeft" /></button>
        <div className="symbol-title"><strong>{displaySymbol} 详情</strong></div>
        <span className={`risk-pill ${tone}`}>{score >= 75 ? "强烈" : score >= 60 ? "活跃" : "观察"}</span>
        <div className="symbol-control-wrap">
          <button className="symbol-control-button" type="button" aria-expanded={controlMenuOpen} aria-label="打开详情控制" onClick={() => setControlMenuOpen((open) => !open)}><SystemIcon name="settings" /></button>
          {controlMenuOpen && (
            <div className="symbol-control-menu">
              <button type="button" onClick={() => { setControlMenuOpen(false); setAlertPreviewOpen(true); }}><SystemIcon name="eye" /><span>预览告警文案</span></button>
              <button type="button" onClick={() => { setControlMenuOpen(false); setRuleSettingsOpen(true); }}><SystemIcon name="settings" /><span>监控规则</span></button>
            </div>
          )}
        </div>
      </header>
      {radarSignalContext && (
        <section className="polished-card symbol-radar-context" aria-label="实时雷达信号上下文">
          <div>
            <span>来自实时雷达</span>
            <strong>{formatDirectionLabel(radarSignalContext.direction)} · {radarSignalContext.score}/100</strong>
          </div>
          <p>{radarSignalContext.trigger}</p>
          <small>信号来源：Yansir 策略引擎 · AIClaw 仅用于解释和复核，策略信号保持最高优先级</small>
          <button type="button" onClick={() => onOpenValueClawSignal(radarSignalContext)}>打开 AIClaw 复核</button>
        </section>
      )}
      <section className={`polished-card symbol-overview-card ${tone}`}>
        <div className="symbol-overview-head">
          <div className="symbol-score-block">
            <span>异常评分</span>
            <strong className={tone}>{score}<small>/100</small></strong>
            <em>{relatedSignal?.title || row.state}</em>
          </div>
          <MiniSparkline values={detailTrendValues} variant={detailTrendVariant} />
        </div>
        <div className="symbol-market-grid">
          <article><span>现价</span><strong>{row.price}</strong></article>
          <article><span>24H</span><strong className={row.change.startsWith("-") ? "negative" : "success"}>{row.change}</strong></article>
          <article><span>成交额</span><strong>{row.oi || "-"}</strong></article>
        </div>
        <p className="symbol-summary">{detailSummary}</p>
        <div className="symbol-chip-row">
          <span>{displaySymbol}</span>
          <span>5m 扫描</span>
          <span>{row.source === "binance" ? "Binance 实时" : "行情同步"}</span>
          <button
            className={`symbol-watch-toggle ${isWatched ? "active" : ""}`}
            type="button"
            aria-pressed={isWatched}
            aria-label={`${isWatched ? "移出" : "加入"}自选 ${cleanSymbol}`}
            disabled={watchlistSaving}
            onClick={toggleDetailWatchlist}
          >
            <SystemIcon name="star" />
            {watchlistSaving ? "保存中" : isWatched ? "已自选" : "加入自选"}
          </button>
        </div>
        <div className="symbol-chip-row">
          <span>套餐 {watchlistLimits?.plan || entitlements.plan || "Free"}</span>
          <span>自选 {watchlistLimits ? `${watchlistLimits.activeSymbolCount}/${watchlistLimits.maxWatchlistSymbols}` : `0/${entitlements.maxWatchlistSymbols || 0}`}</span>
          <span>周期 {(watchlistLimits?.allowedTimeframes?.length ? watchlistLimits.allowedTimeframes : entitlements.allowedTimeframes).join(" / ") || "5m"}</span>
          <span>最低分 {watchlistLimits?.minAlertScore ?? entitlements.minAlertScore}</span>
          {planLevel(watchlistLimits?.plan || entitlements.plan) < 3 && <button className="inline-upgrade-button" type="button" onClick={() => onNavigate("plans")}>升级解锁</button>}
        </div>
      </section>
      <StrategyPerformanceDetailCard entitlements={entitlements} record={latestStrategyRecord} loading={strategyDetailLoading} onUpgrade={() => onNavigate("plans")} />
      <section className="polished-card scan-history-card">
        <div className="card-title">
          <div><h2>扫描记录</h2><span>含当前币种历史策略信号与战绩回看</span></div>
        </div>
        <div className="scan-timeline">
          {visibleScanHistory.map((record) => (
            <article className={`scan-record ${record.tone}`} key={record.id}>
              <span className="scan-dot" />
              <span className="scan-record-time"><SystemIcon name="clock" />{formatScanRecordTime(record)}</span>
              <strong>{record.title}</strong>
              <p>{record.body}</p>
              {isStrategyPerformanceRecord(record) && <StrategyPerformanceStrip entitlements={entitlements} performance={record.performance} />}
              <div className="scan-tags">
                {record.tags.map((tag) => <span key={`${record.id}-${tag}`}>{tag}</span>)}
              </div>
            </article>
          ))}
        </div>
        {combinedScanHistory.length > scanHistoryVisibleCount && (
          <button className="scan-history-more" type="button" onClick={() => setScanHistoryVisibleCount((count) => Math.min(count + 5, combinedScanHistory.length))}>
            加载更多 5 条
          </button>
        )}
      </section>
      {alertPreviewOpen && (
        <div className="symbol-alert-modal">
          <button className="symbol-alert-backdrop" type="button" aria-label="关闭告警预览" onClick={() => setAlertPreviewOpen(false)} />
          <section className="polished-card symbol-alert-card" role="dialog" aria-modal="true" aria-label="告警文案预览">
            <div className="symbol-alert-head">
              <span><SystemIcon name="bell" /></span>
              <div><strong>告警文案预览</strong><em>将推送到已配置渠道</em></div>
              <button type="button" aria-label="关闭" onClick={() => setAlertPreviewOpen(false)}><SystemIcon name="x" /></button>
            </div>
            <article>
              <h3>{previewTitle}</h3>
              <p>{previewBody}</p>
              <div><span>现价 {row.price}</span><span>24H {row.change}</span><span>成交额 {row.oi || "-"}</span></div>
            </article>
            <button type="button" onClick={() => { setAlertPreviewOpen(false); onToast("告警文案已生成"); }}>确认文案</button>
          </section>
        </div>
      )}
      {upgradePrompt && <UpgradeModal title={upgradePrompt.title} desc={upgradePrompt.desc} onClose={() => setUpgradePrompt(null)} onUpgrade={() => { setUpgradePrompt(null); onNavigate(currentUser.id ? "plans" : "login"); }} actionLabel={currentUser.id ? "查看会员套餐" : "去登录"} />}
      {ruleSettingsOpen && (
        <div className="symbol-alert-modal">
          <button className="symbol-alert-backdrop" type="button" aria-label="关闭监控规则设置" onClick={() => setRuleSettingsOpen(false)} />
          <section className="polished-card symbol-alert-card symbol-rule-card" role="dialog" aria-modal="true" aria-label={`${cleanSymbol} 监控规则`}>
            <div className="symbol-alert-head">
              <span><SystemIcon name="settings" /></span>
              <div><strong>{cleanSymbol} 监控规则</strong><em>调整扫描节奏、阈值与推送</em></div>
              <button type="button" aria-label="关闭" onClick={() => setRuleSettingsOpen(false)}><SystemIcon name="x" /></button>
            </div>
            <div className="rule-control-group">
              <strong>扫描周期</strong>
              <div className="rule-segment">
                {(["5m", "15m", "1h", "4h"] as const).map((item) => {
                  const allowed = planAllowedTimeframes.includes(item);
                  return <button className={`${ruleInterval === item ? "active" : ""} ${allowed ? "" : "locked"}`} type="button" key={item} aria-disabled={!allowed || watchlistSaving} onClick={() => allowed && !watchlistSaving ? setRuleInterval(item) : setUpgradePrompt({ title: `升级解锁 ${item} 周期`, desc: `当前套餐可用周期 ${planAllowedTimeframes.join(" / ")}。升级后可监控更多周期并接收对应信号。` })}>{item}{allowed ? "" : " · 升级"}</button>;
                })}
              </div>
            </div>
            <div className="rule-control-group">
              <strong>告警阈值</strong>
              <div className="rule-segment">
                {[60, 70, 80].map((item) => {
                  const allowed = item >= planMinScore;
                  return <button className={`${ruleThreshold === item ? "active" : ""} ${allowed ? "" : "locked"}`} type="button" key={item} aria-disabled={!allowed || watchlistSaving} onClick={() => allowed && !watchlistSaving ? setRuleThreshold(item) : setUpgradePrompt({ title: "当前套餐最低分受限", desc: `${watchlistLimits?.plan || entitlements.plan || "Free"} 最低分为 ${planMinScore}+。升级后可使用更灵活的阈值配置。` })}>{item}+{allowed ? "" : " · 套餐最低"}</button>;
                })}
              </div>
            </div>
            <button className={`rule-toggle ${rulePushEnabled ? "on" : ""} ${entitlements.feishuAlerts ? "" : "locked"}`} type="button" aria-pressed={rulePushEnabled} aria-disabled={!entitlements.feishuAlerts || watchlistSaving} onClick={() => entitlements.feishuAlerts && !watchlistSaving ? setRulePushEnabled((enabled) => !enabled) : setUpgradePrompt({ title: "升级开启告警推送", desc: "当前套餐不支持实时推送。升级后可把该币种高分信号推送到飞书。" })}>
              <span>推送到告警渠道</span><i>{entitlements.feishuAlerts ? (rulePushEnabled ? "已开启" : "已关闭") : "升级解锁"}</i>
            </button>
            <small>套餐 {watchlistLimits?.plan || entitlements.plan || "Free"} · 可用周期 {planAllowedTimeframes.join(" / ")} · 最低分 {planMinScore}+ · 自选 {watchlistLimits ? `${watchlistLimits.activeSymbolCount}/${watchlistLimits.maxWatchlistSymbols}` : "-"}</small>
            {planLevel(watchlistLimits?.plan || entitlements.plan) < 3 && <div className="performance-upgrade-note"><span>更多周期、更多自选和完整战绩属于会员权益。</span><button type="button" onClick={() => onNavigate("plans")}>查看升级</button></div>}
            <button type="button" disabled={watchlistSaving} onClick={saveSymbolRuleSettings}>{watchlistSaving ? "保存中..." : "保存规则"}</button>
          </section>
        </div>
      )}
    </section>
  );
}

function PlansPage({ currentUser, onBack, onCreateOrder, onPayOrder, orders, paymentProviders, plans }: { currentUser: CurrentUser; onBack: () => void; onCreateOrder: (plan: Plan) => void; onPayOrder: (order: BillingOrder) => void; orders: BillingOrder[]; paymentProviders: PaymentProviderSummary; plans: Plan[] }) {
  const displayPlans = plans.length ? plans : fallbackPlansForDisplay();
  return (
    <section className="clean-page">
      <SubHeader title="会员等级购买" desc="前后端统一读取套餐权限：自选数量、周期、推送额度、历史战绩和接口权限都以这里为准。" onBack={onBack} />
      {!currentUser.id && <EmptyState title="请先登录" desc="登录后订单会绑定到当前会员账号。" />}
      <section className="clean-card">
        <CardTitle title="支付通道" desc="上线前可切换真实支付商。" />
        <article className="clean-row"><strong>{paymentProviders.defaultProvider}</strong><span>{paymentProviders.providers.find((item) => item.provider === paymentProviders.defaultProvider)?.message || "本地模拟支付"}</span><em>当前</em></article>
      </section>
      <div className="plan-list">
        {displayPlans.map((plan) => {
          const isCurrent = normalizePlanName(currentUser.plan) === normalizePlanName(plan.name);
          return (
            <article className={isCurrent ? "plan-card active" : "plan-card"} key={plan.id || plan.code || plan.name}>
              <div>
                <strong>{plan.name}</strong>
                <span>{plan.features?.join(" / ") || "会员权益"}</span>
              </div>
              <b>{plan.price ? `¥${plan.price}/月` : "免费"}</b>
              <div className="plan-permission-grid">
                <span>自选币种 <strong>{plan.maxWatchlistSymbols ?? "-"}</strong></span>
                <span>可用周期 <strong>{(plan.allowedTimeframes || ["5m"]).join(" / ")}</strong></span>
                <span>最低推送分 <strong>{plan.minAlertScore ?? "-"}</strong></span>
                <span>每日推送 <strong>{plan.maxPushPerDay ?? plan.signalQuota}</strong></span>
                <span>历史窗口 <strong>{plan.historyDays ?? "-"} 天</strong></span>
                <span>实时延迟 <strong>{plan.realtimeDelayHours ? `${plan.realtimeDelayHours} 小时` : "实时"}</strong></span>
                <span>战绩回看 <strong>{plan.signalOutcomes ? "完整" : "基础"}</strong></span>
                <span>API 权限 <strong>{plan.apiAccess ? "支持" : "不含"}</strong></span>
              </div>
              <button type="button" disabled={!plan.price || isCurrent} onClick={() => onCreateOrder(plan)}>{isCurrent ? "当前套餐" : plan.price ? "生成订单" : "默认试用"}</button>
            </article>
          );
        })}
      </div>
      <section className="clean-card">
        <CardTitle title="订单中心" desc="会员购买产生的订单放在这里。" />
        {orders.length === 0 && <EmptyState title="暂无订单" desc="选择 VIP 或 SVIP 后会显示在这里。" />}
        {orders.map((order) => (
          <article className="order-row" key={order.id}><div><strong>{order.planName}</strong><span>{formatDate(order.createdAt)} · {order.status}</span></div><b>{formatCurrency(order.amount)}</b>{order.status !== "paid" && <button type="button" onClick={() => onPayOrder(order)}>模拟支付</button>}</article>
        ))}
      </section>
    </section>
  );
}

function fallbackPlansForDisplay(): Plan[] {
  return [
    { id: "free", code: "free", name: "Free", price: 0, signalQuota: 10, feishu: false, apiAccess: false, maxWatchlistSymbols: 5, allowedTimeframes: ["5m"], realtimeDelayHours: 8, historyDays: 7, minAlertScore: 80, maxPushPerDay: 0, signalOutcomes: false, features: ["全市场信号延迟 8 小时", "自选 5 个币", "周期 5m", "基础战绩预览"] },
    { id: "vip", code: "vip", name: "VIP", price: 199, signalQuota: 300, feishu: true, apiAccess: false, maxWatchlistSymbols: 50, allowedTimeframes: ["5m", "15m"], realtimeDelayHours: 0, historyDays: 30, minAlertScore: 65, maxPushPerDay: 300, signalOutcomes: true, features: ["每日 300 条实时推送", "自选 50 个币", "周期 5m / 15m", "完整战绩回看"] },
    { id: "svip", code: "svip", name: "SVIP", price: 699, signalQuota: 2000, feishu: true, apiAccess: true, maxWatchlistSymbols: 200, allowedTimeframes: ["5m", "15m", "1h", "4h"], realtimeDelayHours: 0, historyDays: 180, minAlertScore: 65, maxPushPerDay: 2000, signalOutcomes: true, features: ["每日 2000 条实时推送", "自选 200 个币", "周期 5m / 15m / 1h / 4h", "API 订阅"] }
  ];
}

function normalizePlanName(plan?: string) {
  return String(plan || "").trim().toLowerCase();
}

function TeamPage({ currentUser, dashboard, onBack }: { currentUser: CurrentUser; dashboard: TeamDashboard; onBack: () => void }) {
  return (
    <section className="clean-page">
      <SubHeader title="我的团队" desc="三级分销、邀请成员、佣金统计和团队订单。" onBack={onBack} />
      {!currentUser.id && <EmptyState title="请先登录" desc="登录后才能查看邀请关系和团队佣金。" />}
      <section className="clean-grid three">
        <Metric label="团队成员" value={dashboard.summary.members} />
        <Metric label="付费订单" value={dashboard.summary.paidOrders} />
        <Metric label="预估佣金" value={formatCurrency(dashboard.summary.commission)} tone="success" />
      </section>
      <section className="clean-card">
        <CardTitle title="邀请入口" desc="成员通过邀请链接注册后，会进入三级分销关系。" />
        <article className="clean-row"><strong>{dashboard.inviteCode || "-"}</strong><span>{dashboard.inviteUrl || "暂无邀请链接"}</span><em>复制</em></article>
      </section>
      <section className="clean-card">
        <CardTitle title="团队成员" desc="来自后端团队关系接口。" />
        {dashboard.members.length === 0 && <EmptyState title="暂无团队成员" desc="邀请成员注册后会同步到这里。" />}
        {dashboard.members.slice(0, 20).map((member) => <article className="clean-row" key={member.id}><strong>{member.name}</strong><span>{levelName(member.level)} · {member.phone}</span><em>{member.plan}</em></article>)}
      </section>
    </section>
  );
}

function LoginPage({ onBack, onLogin, onRegister }: { onBack: () => void; onLogin: (phone: string, password: string) => Promise<void>; onRegister: () => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onLogin(phone.trim(), password);
    } catch {
      setError("登录失败，请检查手机号和密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="欢迎回来" desc="登录后可查看会员权益、订单、后台和团队数据。" onBack={onBack}>
      <form className="auth-form" onSubmit={submit}>
        <label><span>手机号</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" /></label>
        <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-wide" type="submit" disabled={loading}>{loading ? "登录中" : "登录"}</button>
        <button className="secondary-wide" type="button" onClick={onRegister}>注册新账号</button>
      </form>
    </AuthShell>
  );
}

function RegisterPage({ onBack, onRegister }: { onBack: () => void; onRegister: (name: string, phone: string, password: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onRegister(name.trim() || "新会员", phone.trim(), password);
    } catch {
      setError("注册失败，请检查信息是否完整。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="创建会员账号" desc="注册后自动开通 Free 试用，可在会员中心升级。" onBack={onBack}>
      <form className="auth-form" onSubmit={submit}>
        <label><span>昵称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入昵称" /></label>
        <label><span>手机号</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="请输入手机号" /></label>
        <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-wide" type="submit" disabled={loading}>{loading ? "注册中" : "注册"}</button>
      </form>
    </AuthShell>
  );
}

function GlobalSearch({ onClose, onOpenSymbol, rows }: { onClose: () => void; onOpenSymbol: (symbol: string) => void; rows: MarketRow[] }) {
  const [query, setQuery] = useState("");
  const results = rows
    .filter((row) => normalizeDisplaySymbol(row.symbol).includes(query.trim().toUpperCase()) || row.state.includes(query.trim()))
    .slice(0, 20);

  function open(symbol: string) {
    onClose();
    onOpenSymbol(symbol);
  }

  return (
    <div className="global-search-modal">
      <button className="global-search-backdrop" type="button" onClick={onClose} />
      <section className="global-search-panel">
        <div className="global-search-box"><SystemIcon name="search" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索币种、信号或机会" /><button type="button" onClick={onClose}><SystemIcon name="x" /></button></div>
        <div className="global-search-copy"><strong>搜索市场</strong><span>用于打开币种详情和信号分析</span></div>
        <div className="global-search-results">
          {results.length ? results.map((row) => <button type="button" key={row.symbol} onClick={() => open(row.symbol)}><span>{normalizeDisplaySymbol(row.symbol).slice(0, 1)}</span><strong>{normalizeDisplaySymbol(row.symbol)}</strong><em>{row.state}</em><small>{row.change}</small></button>) : <p>没有找到匹配币种</p>}
        </div>
      </section>
    </div>
  );
}

function Topbar({ eyebrow, onSearch, title }: { badge?: string; eyebrow: string; onSearch: () => void; title: string }) {
  return (
    <header className="topbar">
      <div className="brand-lockup"><strong>{title}</strong><span>{eyebrow}</span></div>
      <button className="search-button" type="button" aria-label="搜索" onClick={onSearch}><SystemIcon name="search" /></button>
    </header>
  );
}

function ClawBlockCard({ block, onOpenSymbol }: { block: ClawBlock; onOpenSymbol: (symbol: string) => void }) {
  const symbol = block.items.map(extractSymbol).find(Boolean);
  return (
    <article className={`claw-block ${block.type}`}>
      <strong>{block.title}</strong>
      {block.items.map((item) => <p key={item}>{item}</p>)}
      {symbol && <button type="button" onClick={() => onOpenSymbol(symbol)}>查看 {symbol} 详情</button>}
    </article>
  );
}

function MiniSparkline({ values, variant = "green" }: { values: number[]; variant?: "green" | "red" | "dual" }) {
  const source = values.length ? values : [1, 2, 4, 3, 6, 5, 7, 6];
  const safe = smoothMiniSeries(source.map(Number).filter(Number.isFinite));
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  const last = safe[safe.length - 1] ?? 0;
  const pointX = 4 + (safe.length - 1) * (96 / Math.max(safe.length - 1, 1));
  const pointY = 4 + (1 - (last - min) / range) * 32;
  const points = safe.map((value, index) => ({
    x: 4 + index * (96 / Math.max(safe.length - 1, 1)),
    y: 4 + (1 - (value - min) / range) * 32
  }));
  const path = smoothChartPath(points, 0.22);
  return (
    <svg className={`sparkline mini-sparkline ${variant}`} viewBox="0 0 100 44" aria-hidden="true">
      <path className="area" d={`${path} L 96 40 L 4 40 Z`} />
      <path className="line" d={path} />
      <circle cx={pointX} cy={pointY} r="3.3" />
    </svg>
  );
}

function FlowChart({ mode = "exchange", values }: { mode?: "exchange" | "capital"; values: number[] }) {
  const safe = values.map(Number).filter(Number.isFinite);
  const source = safe.length > 1 ? safe : [1, 2, 4, 3, 6, 7, 5, 6, 8];
  const chartValues = sampleSeries(source, 44);
  const min = Math.min(...chartValues);
  const max = Math.max(...chartValues);
  const range = max - min || 1;
  const points = chartValues.map((value, index) => {
    const x = 18 + (index * 324) / Math.max(chartValues.length - 1, 1);
    const height = 18 + ((value - min) / range) * 68;
    const y = 112 - height;
    return { x, y };
  });
  const path = smoothChartPath(points);
  const endPoint = points[points.length - 1] || { x: 342, y: 68 };
  const midPoint = points[Math.max(0, Math.floor(points.length * 0.64))] || endPoint;
  return (
    <svg className={`sparkline flow-svg ${mode}`} viewBox="0 0 360 138" preserveAspectRatio="none" aria-hidden="true">
      {points.map((point, index) => {
        const height = 112 - point.y;
        return <rect key={`${index}-${chartValues[index]}`} x={point.x - 2.2} y={point.y} width="4.4" height={height} rx="2.2" />;
      })}
      <path className="area" d={`${path} L 342 126 L 18 126 Z`} />
      <path className="line" d={path} />
      <circle cx={midPoint.x} cy={midPoint.y} r="5" />
      <circle cx={endPoint.x} cy={endPoint.y} r="4.5" />
    </svg>
  );
}

function sampleSeries(values: number[], targetLength: number) {
  if (values.length <= targetLength) {
    return values;
  }

  return Array.from({ length: targetLength }, (_, index) => {
    const sourceIndex = Math.round((index * (values.length - 1)) / Math.max(targetLength - 1, 1));
    return values[sourceIndex];
  });
}

function smoothMiniSeries(values: number[]) {
  if (values.length <= 8) {
    return values;
  }

  const windowSize = values.length > 120 ? 9 : 5;
  const radius = Math.floor(windowSize / 2);
  const averaged = values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    const slice = values.slice(start, end);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });

  return sampleSeries(averaged, Math.min(52, averaged.length));
}

function smoothChartPath(points: Array<{ x: number; y: number }>, smoothing = 0.14) {
  if (!points.length) return "";
  if (points.length < 3) {
    return points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  }

  const segments = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] || next;
    const cp1 = {
      x: current.x + (next.x - previous.x) * smoothing,
      y: current.y + (next.y - previous.y) * smoothing
    };
    const cp2 = {
      x: next.x - (afterNext.x - current.x) * smoothing,
      y: next.y - (afterNext.y - current.y) * smoothing
    };

    segments.push(`C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`);
  }

  return segments.join(" ");
}

function CoinIcon({ symbol }: { symbol: string }) {
  const clean = normalizeDisplaySymbol(symbol);
  const cls = clean === "BTC" ? "btc" : clean === "ETH" ? "eth" : clean === "XRP" ? "xrp" : clean === "UB" ? "smile" : "coin";
  return <span className={`coin-icon ${cls}`}>{clean === "UB" ? "⌁" : clean.slice(0, 1)}</span>;
}

function SystemIcon({ name }: { name: string }) {
  const common = { className: "system-icon", viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (name === "check") return <svg {...common}><path d="m6 12 4 4 8-8" /></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
  if (name === "target") return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "send") return <svg {...common}><path d="m21 3-8 18-3-8-8-3Z" /><path d="m21 3-11 10" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
  if (name === "message") return <svg {...common}><path d="M5 6h14v9H8l-3 3Z" /><path d="M8 9h8M8 12h5" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M7 10a5 5 0 0 1 10 0v4l2 3H5l2-3Z" /><path d="M10 20h4" /></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16l-6 7v4l-4 2v-6Z" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5c0 4.5-2.8 7.6-7 10-4.2-2.4-7-5.5-7-10V6Z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (name === "network") return <svg {...common}><circle cx="12" cy="5" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M11 7 7 16M13 7l4 9M8 18h8" /></svg>;
  if (name === "user") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c2-5 12-5 14 0" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5Z" /></svg>;
  if (name === "star") return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.2 6.1-.9Z" /></svg>;
  if (name === "eye") return <svg {...common}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (name === "x") return <svg {...common}><path d="M7 7l10 10M17 7 7 17" /></svg>;
  if (name === "chevronLeft") return <svg {...common}><path d="m15 6-6 6 6 6" /></svg>;
  return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
}

function CardTitle({ desc, title }: { desc: string; title: string }) {
  return <div className="card-title"><div><h2>{title}</h2><span>{desc}</span></div></div>;
}

function Metric({ label, tone, value }: { label: string; tone?: string; value: ReactNode }) {
  return <article className="metric-card"><span>{label}</span><strong className={tone || ""}>{value}</strong></article>;
}

function EmptyState({ desc, title }: { desc: string; title: string }) {
  return <div className="inline-empty-state"><strong>{title}</strong><p>{desc}</p></div>;
}

function SubHeader({ desc, onBack, title }: { desc: string; onBack: () => void; title: string }) {
  return <header className="sub-header"><button type="button" aria-label="返回" onClick={onBack}><SystemIcon name="chevronLeft" /></button><div><h1>{title}</h1><span>{desc}</span></div></header>;
}

function AuthShell({ children, desc, onBack, title }: { children: ReactNode; desc: string; onBack: () => void; title: string }) {
  return <section className="auth-standalone"><button className="auth-back" type="button" onClick={onBack}>‹</button><div className="auth-brand-stage"><span>AI Signal Radar</span><h1>{title}</h1><p>{desc}</p></div><section className="auth-card">{children}</section></section>;
}

function sparklinePath(values: number[], width: number, height: number) {
  const safe = values.map((value) => Number(value)).filter(Number.isFinite);
  const source = safe.length > 1 ? safe : [1, 2, 3, 2, 4];
  const min = Math.min(...source);
  const max = Math.max(...source);
  const range = max - min || 1;
  const step = width / Math.max(source.length - 1, 1);
  return source
    .map((value, index) => {
      const x = 4 + index * step;
      const y = 4 + (1 - (value - min) / range) * (height - 8);
      return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function appBasePath() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function replaceAppUrl(view: ViewName, symbol = "") {
  const params = new URLSearchParams();
  params.set("view", view);
  if (symbol) params.set("symbol", normalizeDisplaySymbol(symbol));
  window.history.replaceState(null, "", `${appBasePath()}?${params.toString()}`);
}

function readView(): ViewName {
  const value = new URLSearchParams(window.location.search).get("view");
  return normalizeViewParam(value);
}

function readSymbolParam() {
  return normalizeDisplaySymbol(new URLSearchParams(window.location.search).get("symbol") || "");
}

function readWatchlistSymbols() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) || "[]");
    return Array.isArray(stored) && stored.length ? stored.map(normalizeDisplaySymbol).filter(Boolean) : defaultWatchlistSymbols;
  } catch {
    return defaultWatchlistSymbols;
  }
}

function readStrategyTrackRecords(): RadarTimelineRecord[] {
  return [];
}

function writeStrategyTrackRecords(records: RadarTimelineRecord[]) {
  try {
    window.localStorage.setItem(STRATEGY_TRACK_STORAGE_KEY, JSON.stringify(records.slice(0, STRATEGY_TRACK_HISTORY_LIMIT)));
  } catch {
    // Ignore local storage errors.
  }
}

function scanHistoryKey(symbol: string) {
  return `${SCAN_HISTORY_STORAGE_KEY}.${normalizeDisplaySymbol(symbol) || "UNKNOWN"}`;
}

function readScanHistory(symbol: string): ScanRecord[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(scanHistoryKey(symbol)) || "[]");
    return Array.isArray(stored) ? mergeScanRecords(stored).slice(0, SCAN_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeScanHistory(symbol: string, records: ScanRecord[]) {
  try {
    window.localStorage.setItem(scanHistoryKey(symbol), JSON.stringify(records.slice(0, SCAN_HISTORY_LIMIT)));
  } catch {
    // Ignore local persistence failures; the current session still renders the record.
  }
}

function mergeScanRecords(records: ScanRecord[]) {
  const seen = new Set<string>();
  const merged: ScanRecord[] = [];
  for (const record of records) {
    const normalized = normalizeScanRecord(record);
    const key = normalized.signature || normalized.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= SCAN_HISTORY_LIMIT) break;
  }
  return merged;
}

function normalizeScanRecord(record: ScanRecord): ScanRecord {
  const timestamp = record.timestamp ?? timestampFromScanTime(record.time);
  return {
    ...record,
    timestamp,
    signature: record.signature || createScanSignature(record.title, record.tone, record.tags)
  };
}

function createScanSignature(title: string, tone: Tone, tags: string[]) {
  return [
    tone,
    title.replace(/\s+/g, " ").trim(),
    tags.join("|")
  ].join("::");
}

function timestampFromScanTime(time?: string) {
  const match = String(time || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.getTime();
}

function formatScanRecordTime(record: ScanRecord) {
  if (!record.timestamp) return record.time;
  const date = new Date(record.timestamp);
  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? time : `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${time}`;
}

function currentScanSlot(now = Date.now()) {
  const intervalMs = 5 * 60 * 1000;
  return Math.floor(now / intervalMs) * intervalMs;
}

function toneForScore(score: number): Tone {
  return score >= 75 ? "danger" : score >= 60 ? "warning" : "success";
}

function radarMonitorCategory(signal: Signal): { key: "surge" | "opportunity" | "risk"; label: string; tag: string; tone: Tone } {
  const text = `${signal.title} ${signal.reason}`;
  const gain = signalChangePercent(signal);
  const positiveMove = signal.direction === "long" || gain > 0;
  const riskLike = signal.direction === "short" || gain < 0 || signal.score < 60 || /跌|回撤|风险|保护|止盈|减弱|破位|急跌|看跌/.test(text);
  if (riskLike) return { key: "risk", label: "风险看跌监控", tag: "保护本金", tone: "danger" };
  const surgeLike = positiveMove && (gain >= 20 || /异动|活跃|Alpha|首次|急拉|暴增|爆发|拉升|大涨/.test(text));
  if (surgeLike) return { key: "surge", label: "异动看涨监控", tag: "Alpha 首次", tone: "success" };
  const opportunityLike = positiveMove || signal.score >= 70 || /机会|利多|强势|走强|趋势买入|突破|放量|资金流入/.test(text);
  if (opportunityLike) return { key: "opportunity", label: "机会看涨监控", tag: "利多", tone: "warning" };
  return { key: "surge", label: "异动看涨监控", tag: "关注", tone: "success" };
}

function signalChangePercent(signal: Signal) {
  const direct = parseNumber(signal.gain);
  if (direct) return direct;
  const text = `${signal.title || ""} ${signal.reason || ""}`;
  const changeMatch = text.match(/(?:24H|4H)[^\d+\-−]*([+\-−]?\d+(?:\.\d+)?)%/i) || text.match(/([+\-−]\d+(?:\.\d+)?)%/);
  return changeMatch ? parseNumber(changeMatch[1]) : 0;
}

function buildRadarRecordBody(signal: Signal, row?: MarketRow) {
  if (signal.reason) return signal.reason;
  const symbol = normalizeDisplaySymbol(signal.symbol);
  const price = row?.price || signal.price || "-";
  const change = row?.change || signal.gain || "--";
  return `${symbol} 当前价格 ${price}，24H ${change}，建议结合成交额、资金流和下一轮扫描确认。`;
}

function buildSignalScanRecord(symbol: string, signal: Signal): ScanRecord {
  const tone = toneForScore(signal.score);
  const actionTag = tone === "danger" ? "保护本金" : tone === "warning" ? "继续观察" : "机会";
  const title = `${symbol} ${signal.title}`;
  return {
    id: signal.id || `${symbol}-${signal.time || "latest"}-${signal.score}-${signal.title}`,
    time: signal.time || formatClockTime(currentScanSlot()),
    timestamp: timestampFromScanTime(signal.time),
    title,
    body: signal.reason || `${symbol} 评分 ${signal.score}/100，建议继续观察价格、成交额和风险偏离。`,
    tags: [symbol, actionTag, "合约"],
    signature: createScanSignature(title, tone, [symbol, actionTag, "合约"]),
    tone
  };
}

function buildAllMarketRadarRecords(rows: MarketRow[], records: RadarTimelineRecord[], options: { mode: "strategy" | "market"; scanBaseTime: number }) {
  const rowSymbols = new Set(rows.map((row) => normalizeDisplaySymbol(row.symbol)));
  const recordBySymbol = new Map<string, RadarTimelineRecord>();

  [...records]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || (b.score || 0) - (a.score || 0))
    .forEach((record) => {
      const symbol = normalizeDisplaySymbol(record.symbol);
      if (!symbol || recordBySymbol.has(symbol)) return;
      recordBySymbol.set(symbol, { ...record, symbol });
    });

  const marketBackfilled = rows.map((row, index) => {
    const symbol = normalizeDisplaySymbol(row.symbol);
    return recordBySymbol.get(symbol) || buildMarketBackfillRecord(row, index, options);
  });
  const unmatchedRecords = records.filter((record) => !rowSymbols.has(normalizeDisplaySymbol(record.symbol)));

  return [...marketBackfilled, ...unmatchedRecords];
}

function buildMarketBackfillRecord(row: MarketRow, index: number, options: { mode: "strategy" | "market"; scanBaseTime: number }): RadarTimelineRecord {
  const symbol = normalizeDisplaySymbol(row.symbol);
  const change = parseNumber(row.change);
  const score = normalizeRadarScore(row.score);
  const isRisk = change < 0 && score < 60;
  const group: RadarGroup = isRisk ? "risk" : score >= 70 ? "surge" : "opportunity";
  const category = options.mode === "strategy"
    ? "等待策略信号"
    : isRisk
      ? "风险观察"
      : score >= 70
        ? "市场异动"
        : "市场观察";
  const timestamp = options.scanBaseTime - (1000 + index) * 60 * 1000;
  const trigger = options.mode === "strategy"
    ? `${symbol} 已纳入全市场策略扫描，当前暂未触发 Yansir 策略信号。`
    : `${symbol} 当前价格 ${row.price || "-"}，24H ${row.change || "--"}，继续观察成交量、资金费率和下一轮雷达信号。`;
  const tone: Tone = isRisk ? "danger" : score >= 70 ? "warning" : "success";
  const direction: Direction = isRisk ? "short" : "flat";

  return {
    id: `${options.mode}-market-${symbol || index}`,
    symbol,
    group,
    category,
    title: `${symbol} ${category}`,
    body: trigger,
    signature: createScanSignature(`${symbol} ${category}`, tone, [symbol, category]),
    tags: [symbol, category, options.mode === "strategy" ? "策略扫描池" : "全市场"],
    time: formatClockTime(timestamp),
    timestamp,
    tone,
    score,
    direction,
    strategyName: options.mode === "strategy" ? "Yansir 策略引擎" : "市场观察池",
    trigger,
    risk: isRisk ? category : undefined
  };
}

function normalizeRadarScore(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function strategyInboxToRecord(signal: StrategyInboxSignal): RadarTimelineRecord {
  const category = strategyCategory(signal.direction, signal.score);
  const directionLabel = signal.direction === "short" ? "看跌/开空" : "看涨/做多";
  const tags = [signal.symbol, signal.timeframe, signal.engine || signal.signalType || "Pine V6", signal.direction === "short" ? "看跌" : "看涨"];
  const timestamp = new Date(signal.receivedAt || signal.time || Date.now()).getTime();
  return {
    id: signal.id || `${signal.signalEventId}_${timestamp}`,
    symbol: signal.symbol,
    group: category.key,
    category: category.label,
    title: signal.title,
    body: `${directionLabel}在 ${signal.timeframe} 周期触发，现价 ${formatStrategyPrice(signal.price)}。${signal.reason}`,
    signature: `${signal.score}分`,
    tags,
    performance: signal.performance,
    time: formatStrategyScanTime(signal.time || signal.receivedAt),
    timestamp,
    tone: signal.direction === "short" ? "danger" : "success",
    score: signal.score,
    direction: signal.direction,
    action: signal.action ?? signal.payload?.action ?? null,
    payload: signal.payload,
    strategyName: signal.engine || signal.signalType || "Pine V6",
    trigger: signal.reason,
    risk: signal.direction === "short" ? category.label : undefined
  };
}

function strategyScanToRecords(response: { scan: StrategyScanAlertResponse["scan"] }): RadarTimelineRecord[] {
  const finishedAt = new Date(response.scan.finishedAt).getTime() || Date.now();
  return response.scan.results.flatMap((item, resultIndex) => {
    if (!item.ok || !item.result?.signals.length) return [];
    const symbol = normalizeDisplaySymbol(item.result.symbol || item.symbol);
    return item.result.signals.map((signal, signalIndex) => {
      const score = scoreFromStrategyImpact(signal.score_impact);
      const category = strategyCategory(signal.side, score);
      const tone: Tone = signal.side === "short" ? "danger" : score >= 75 ? "success" : "warning";
      const title = `${symbol} ${signal.title}`;
      const tags = [symbol, item.result?.timeframe || "strategy", signal.engine, signal.side === "short" ? "看跌" : "看涨"];

      const directionLabel = signal.side === "short" ? "K线看跌反转" : "K线看涨反转";
      const body = `${directionLabel}在 ${item.result?.timeframe} 周期触发，现价 ${formatStrategyPrice(signal.price)}，${strategyReversalBody(signal.side, item.result?.market_state)}。`;

      return {
        id: `${symbol}-${item.result?.timeframe}-${item.result?.bar_time || finishedAt}-${signal.type}-${signal.side}-${resultIndex}-${signalIndex}`,
        symbol,
        group: category.key,
        category: category.label,
        time: formatStrategyScanTime(item.result?.bar_time || finishedAt),
        timestamp: item.result?.bar_time || finishedAt,
        title,
        body,
        tags,
        signature: createScanSignature(title, tone, tags),
        tone,
        score,
        direction: signal.side,
        action: signal.action ?? null,
        payload: {
          action: signal.action ?? null,
          reducePct: signal.reducePct ?? signal.reduce_pct ?? null,
          reduce_pct: signal.reduce_pct ?? signal.reducePct ?? null
        },
        strategyName: signal.engine,
        trigger: body,
        risk: signal.side === "short" ? category.label : undefined
      };
    });
  });
}

function strategyCategory(direction: Direction, score: number): { key: RadarGroup; label: string } {
  if (direction === "short") return { key: "risk", label: "多转空反转" };
  if (score >= 75) return { key: "surge", label: "空转多反转" };
  return { key: "opportunity", label: "策略反转" };
}

function strategyReversalBody(direction: Direction, state?: string) {
  if (state === "short_to_long_reversal" || direction === "long") {
    return "连续两根K线有效站上 EMD 趋势带，实体和收盘位置确认空转多";
  }
  if (state === "long_to_short_reversal" || direction === "short") {
    return "连续两根K线有效跌破 EMD 趋势带，实体和收盘位置确认多转空";
  }
  return "当前没有新的多空切换，仅作为趋势状态观察";
}

function scoreFromStrategyImpact(scoreImpact: number) {
  return Math.max(0, Math.min(100, 50 + (Number(scoreImpact) || 0)));
}

function mergeStrategyRecords(records: RadarTimelineRecord[]) {
  const seen = new Set<string>();
  const merged: RadarTimelineRecord[] = [];
  for (const record of records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))) {
    const key = record.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}

function strategyStatusText(status: "idle" | "scanning" | "ready" | "no-signal" | "error", watchlistCount: number, lastScan: string) {
  if (!watchlistCount) return "先在我的关注里添加币种，系统会实时监听 5m / 15m / 1h / 4h K线收盘信号。";
  if (status === "scanning") return `正在检查 ${watchlistCount} 个追踪币种的实时K线信号`;
  if (status === "ready") return `实时多空信号已更新${lastScan ? `，最近信号 ${lastScan}` : ""}`;
  if (status === "no-signal") return `当前暂无新的 Pine V6 标准信号${lastScan ? `，最近信号 ${lastScan}` : ""}`;
  if (status === "error") return "策略信号实时监听异常，请稍后重试。";
  return `实时监听中，覆盖 ${watchlistCount} 个币种的 5m / 15m / 1h / 4h。`;
}

function strategyScanSummaryText(response: { scan: StrategyScanAlertResponse["scan"] }) {
  const summary = response.scan.summary;
  const timeframes = response.scan.timeframes?.length ? response.scan.timeframes.join(" / ") : STRATEGY_TRACK_TIMEFRAMES.join(" / ");
  return `实时K线事件：${response.scan.symbols.join(" / ")} ${timeframes}，本次触发信号 ${summary.signals} 条。`;
}

function strategyHistorySummaryText(scans: StrategyScanAlertResponse["scan"][]) {
  const signalCount = scans.reduce((sum, scan) => sum + scan.summary.signals, 0);
  const latest = scans[0];
  const timeframes = latest.timeframes?.length ? latest.timeframes.join(" / ") : STRATEGY_TRACK_TIMEFRAMES.join(" / ");
  return `实时K线事件按时间累积显示：${latest.symbols.join(" / ")} ${timeframes}，当前保留 ${signalCount} 条信号。`;
}

function strategyEmptyText(status: "idle" | "scanning" | "ready" | "no-signal" | "error", summary: string) {
  if (status === "scanning") return "策略信号正在检查实时K线事件。";
  if (status === "error") return summary || "策略信号实时监听异常，请检查策略服务是否运行。";
  if (status === "no-signal") return summary || "当前暂无新的 Pine V6 标准多空信号。";
  return summary || "实时监听中，有新的多空信号才会显示。";
}

function formatStrategyScanTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatStrategyPrice(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function buildScanRecord(symbol: string, row: MarketRow, signal: Signal | undefined, score: number, tone: Tone): ScanRecord {
  const slot = currentScanSlot();
  const stateTitle = tone === "danger" ? "回撤加深，风险信号观察中" : tone === "warning" ? "趋势信号观察中" : "机会信号跟踪中";
  const actionTag = tone === "danger" ? "保护本金" : tone === "warning" ? "继续观察" : "机会";
  const body = signal?.reason || `${symbol} 现报 ${row.price || "-"}，24H ${row.change || "--"}，成交额 ${row.oi || "-"}，${tone === "danger" ? "注意止盈及保护本金" : "等待下一轮扫描确认"}。`;
  const title = `${symbol} ${signal?.title || stateTitle}`;
  const tags = [symbol, actionTag, row.source === "binance" ? "合约" : "行情同步"];

  return {
    id: `${symbol}-${slot}`,
    time: formatClockTime(slot),
    timestamp: slot,
    title,
    body,
    tags,
    signature: createScanSignature(title, tone, tags),
    tone
  };
}

function isViewName(value: string): value is ViewName {
  return ["data", "claw", "radar", "signal", "account", "login", "register", "admin", "plans", "team", "kline-lab"].includes(value);
}

function normalizeDisplaySymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase().replace(/USDT$/, "");
}

function parseNumber(value?: string) {
  return Number(String(value || "0").replace(/[%+,]/g, "")) || 0;
}

function isNegativeChange(value?: string) {
  const raw = String(value || "").trim();
  return raw.startsWith("-") || raw.startsWith("−") || parseNumber(raw) < 0;
}

function flowWindowPointCount(window: "1H" | "4H" | "8H" | "24H") {
  return window === "1H" ? 12 : window === "4H" ? 48 : window === "8H" ? 96 : 288;
}

function selectFlowWindow(values: number[], window: "1H" | "4H" | "8H" | "24H") {
  const safe = values.map(Number).filter(Number.isFinite);
  const count = flowWindowPointCount(window);
  return safe.length > count ? safe.slice(-count) : safe;
}

function sumWindowQuoteVolume(volumes: number[], prices: number[]) {
  const count = Math.min(volumes.length, prices.length);
  if (!count) return 0;
  const volumeStart = volumes.length - count;
  const priceStart = prices.length - count;
  return Array.from({ length: count }, (_, index) => Math.max(0, volumes[volumeStart + index] || 0) * Math.max(0, prices[priceStart + index] || 0)).reduce((sum, value) => sum + value, 0);
}

function countPositiveMoves(values: number[]) {
  return values.slice(1).filter((value, index) => value >= values[index]).length;
}

function formatCompactMarketValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 100000000) return `${trimFixed(value / 100000000, value >= 10000000000 ? 1 : 2)}亿`;
  if (value >= 10000) return `${trimFixed(value / 10000, value >= 1000000 ? 1 : 2)}万`;
  return trimFixed(value, value >= 100 ? 0 : 2);
}

function trimFixed(value: number, digits: number) {
  return value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function getNextScanSchedule(updatedAt: string | undefined, nowMs: number) {
  const intervalMs = 5 * 60 * 1000;
  const parsed = updatedAt ? Date.parse(updatedAt) : NaN;
  let nextMs = Number.isFinite(parsed) ? parsed + intervalMs : Math.ceil(nowMs / intervalMs) * intervalMs;

  while (nextMs <= nowMs) {
    nextMs += intervalMs;
  }

  const remainingSeconds = Math.max(0, Math.ceil((nextMs - nowMs) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return {
    time: formatClockTime(nextMs),
    remaining: remainingSeconds <= 1 ? "即将扫描" : `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒后`
  };
}

function formatClockTime(value: number) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function scoreLabel(score: number) {
  if (score >= 75) return "机会";
  if (score >= 60) return "风险";
  return "观察";
}

function extractSymbol(text?: string) {
  const match = String(text || "").toUpperCase().match(/\b(BTC|ETH|SOL|BNB|XRP|BCH|DOGE|UB|WLD|ATOM|PYTH|JTO)\b/);
  return match?.[1] || "";
}

function fallbackClawBlocks(target: string, rows: MarketRow[], signals: Signal[]): ClawBlock[] {
  const clean = normalizeDisplaySymbol(target);
  const row = rows.find((item) => normalizeDisplaySymbol(item.symbol) === clean) || rows[0];
  const signal = signals.find((item) => normalizeDisplaySymbol(item.symbol) === clean);
  return [
    { type: "summary", title: `AIClaw 正在分析 ${clean || "当前市场"} 的机会`, items: [`当前价格 ${row?.price || "-"}，24H ${row?.change || "-"}，状态为 ${row?.state || "待观察"}。`, "已结合交易活跃度、主力资金、合约 OI、短周期趋势和风险偏离做综合筛选。"] },
    { type: "group", title: `${clean || "市场"} 机会观察`, items: [signal?.title || "机会需要同时满足价格趋势改善、成交额放大、策略扫描出现有效触发。", "如果评分升至 65 以上，再结合风险提示生成告警并推送给团队。"] },
    { type: "risk", title: "风险提示", items: ["如果只有价格上涨但成交额、资金流和策略信号没有共振，容易是假突破。", "以上分析用于辅助决策，不构成投资建议；高波动行情需要设置止损和仓位上限。"] },
    { type: "action", title: "建议下一步", items: [`进入 ${clean || row?.symbol || "BTC"} 详情页确认扫描分数、最近 K 线和触发证据。`] }
  ];
}

function formatCurrency(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : "-";
}

function levelName(level: TeamLevel) {
  return level === 1 ? "一级团队" : level === 2 ? "二级团队" : "三级团队";
}

function withClientTimeout<T>(promise: Promise<T>, label: string, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
    promise.then(resolve).catch(reject).finally(() => window.clearTimeout(timer));
  });
}
