export type UserRecord = {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "member";
  plan: string;
  status: "active" | "trial" | "disabled";
  expiresAt: string;
  signalUsed: number;
  signalQuota: number;
  feishuEnabled: boolean;
  teamSeats: string;
};

export type PlanRecord = {
  id: string;
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

export type BillingOrderRecord = {
  id: string;
  userId: string;
  planCode: string;
  planName: string;
  provider: "mock" | "manual" | "stripe" | "wechat" | "alipay";
  amount: number;
  status: "pending" | "paid" | "closed";
  checkoutUrl: string;
  createdAt: string;
  paidAt?: string;
};

export type TeamMemberRecord = {
  ownerUserId: string;
  memberUserId: string;
  parentUserId?: string;
  level: 1 | 2 | 3;
  status: "active" | "disabled";
  joinedAt: string;
};

export type SignalRecord = {
  id: string;
  symbol: string;
  badge?: string;
  icon: string;
  price: string;
  gain?: string;
  time: string;
  score: number;
  direction: "long" | "short" | "flat";
  title: string;
  reason: string;
  oiChange: string;
  funding: string;
  tags: string[];
};

export const mockUsers: UserRecord[] = [
  {
    id: "u_1001",
    name: "YanSir",
    phone: "13800008821",
    role: "admin",
    plan: "SVIP",
    status: "active",
    expiresAt: "2026-07-07",
    signalUsed: 384,
    signalQuota: 2000,
    feishuEnabled: true,
    teamSeats: "3/5"
  },
  {
    id: "u_1002",
    name: "合约研究员",
    phone: "18600002450",
    role: "member",
    plan: "VIP",
    status: "active",
    expiresAt: "2026-06-28",
    signalUsed: 146,
    signalQuota: 300,
    feishuEnabled: true,
    teamSeats: "1/1"
  },
  {
    id: "u_1003",
    name: "试用用户",
    phone: "17700000198",
    role: "member",
    plan: "Free",
    status: "trial",
    expiresAt: "2026-06-10",
    signalUsed: 8,
    signalQuota: 10,
    feishuEnabled: false,
    teamSeats: "0/0"
  }
];

export const mockPlans: PlanRecord[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    signalQuota: 10,
    feishu: false,
    apiAccess: false,
    maxWatchlistSymbols: 5,
    allowedTimeframes: ["5m"],
    realtimeDelayHours: 8,
    historyDays: 7,
    minAlertScore: 80,
    maxPushPerDay: 0,
    signalOutcomes: false,
    teamSeats: 0,
    features: ["延迟信号", "基础异常筛选", "自选 5 个币"]
  },
  {
    id: "vip",
    name: "VIP",
    price: 199,
    signalQuota: 300,
    feishu: true,
    apiAccess: false,
    maxWatchlistSymbols: 50,
    allowedTimeframes: ["5m", "15m"],
    realtimeDelayHours: 0,
    historyDays: 30,
    minAlertScore: 65,
    maxPushPerDay: 300,
    signalOutcomes: true,
    teamSeats: 1,
    features: ["实时信号", "飞书告警", "自选 50 个币", "推送后涨跌追踪"]
  },
  {
    id: "svip",
    name: "SVIP",
    price: 699,
    signalQuota: 2000,
    feishu: true,
    apiAccess: true,
    maxWatchlistSymbols: 200,
    allowedTimeframes: ["5m", "15m", "30m", "1h", "4h"],
    realtimeDelayHours: 0,
    historyDays: 180,
    minAlertScore: 65,
    maxPushPerDay: 2000,
    signalOutcomes: true,
    teamSeats: 5,
    features: ["全市场扫描", "团队子账号", "API 订阅", "高级资金/OI 风险模型"]
  }
];

export const mockBillingOrders: BillingOrderRecord[] = [];

export const mockTeamMembers: TeamMemberRecord[] = [
  {
    ownerUserId: "u_1001",
    memberUserId: "u_1002",
    level: 1,
    status: "active",
    joinedAt: "2026-06-01T10:00:00.000Z"
  },
  {
    ownerUserId: "u_1001",
    memberUserId: "u_1003",
    parentUserId: "u_1002",
    level: 2,
    status: "active",
    joinedAt: "2026-06-03T15:30:00.000Z"
  },
  {
    ownerUserId: "u_1002",
    memberUserId: "u_1003",
    level: 1,
    status: "active",
    joinedAt: "2026-06-03T15:30:00.000Z"
  }
];

export const mockSignals: SignalRecord[] = [
  {
    id: "sig_ub_001",
    symbol: "UB",
    badge: "Alpha",
    icon: "smile",
    price: "0.1543",
    gain: "28.78%",
    time: "22:05",
    score: 91,
    direction: "long",
    title: "交易活跃，首次符合 FOMO 特征",
    reason: "合约交易量激增，OI 同步放大，可能是利多信号，但需要注意回撤风险。",
    oiChange: "+34.2%",
    funding: "0.018%",
    tags: ["UB", "首次FOMO", "异常活跃", "利多", "合约"]
  },
  {
    id: "sig_xrp_001",
    symbol: "XRP",
    icon: "xrp",
    price: "1.36",
    gain: "0.01%",
    time: "22:00",
    score: 43,
    direction: "flat",
    title: "价格横盘，量能观察中",
    reason: "价格波动较低，OI 未出现明显扩张，暂未形成强信号。",
    oiChange: "+2.1%",
    funding: "0.006%",
    tags: ["XRP", "观察"]
  },
  {
    id: "sig_btc_001",
    symbol: "BTC",
    badge: "Alpha",
    icon: "btc",
    price: "76984.71",
    gain: "1.20%",
    time: "21:55",
    score: 72,
    direction: "short",
    title: "利空趋势延续中",
    reason: "资金费率偏高，价格突破失败，短线存在多头拥挤风险。",
    oiChange: "+12.8%",
    funding: "0.041%",
    tags: ["BTC", "风险", "利空", "合约"]
  },
  {
    id: "sig_eth_001",
    symbol: "ETH",
    icon: "eth",
    price: "3606.80",
    gain: "3.86%",
    time: "21:50",
    score: 78,
    direction: "long",
    title: "资金活跃，趋势信号增强",
    reason: "ADX 上行且 ATR 放大，多周期趋势开始同步。",
    oiChange: "+18.6%",
    funding: "0.014%",
    tags: ["ETH", "趋势", "利多"]
  }
];
