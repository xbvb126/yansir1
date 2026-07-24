export type AIClawQuickActionId = "market" | "flow" | "signal" | "hot" | "whale" | "sentiment";

export type AIClawSignalContext = {
  symbol: string;
  direction: "long" | "short" | "flat";
  score: number;
};

export type AIClawQuickAction = {
  id: AIClawQuickActionId;
  label: string;
  icon: "chart" | "trend" | "target" | "spark" | "network" | "pulse";
};

export const AI_CLAW_QUICK_ACTIONS = [
  { id: "market", label: "市场概览", icon: "chart" },
  { id: "flow", label: "资金流向", icon: "trend" },
  { id: "signal", label: "策略信号", icon: "target" },
  { id: "hot", label: "热门代币", icon: "spark" },
  { id: "whale", label: "巨鲸动态", icon: "network" },
  { id: "sentiment", label: "市场情绪", icon: "pulse" },
] as const satisfies readonly AIClawQuickAction[];

const DEFAULT_PROMPTS: Record<AIClawQuickActionId, string> = {
  market: "分析当前加密市场概览",
  flow: "分析当前加密市场资金流向",
  signal: "解读最近的 Yansir 策略信号",
  hot: "分析当前热门代币",
  whale: "分析当前巨鲸动态",
  sentiment: "分析当前市场情绪",
};

const SIGNAL_DIRECTION_LABELS: Record<AIClawSignalContext["direction"], string> = {
  long: "看多",
  short: "看空",
  flat: "中性",
};

export function buildAIClawPrompt(
  actionId: AIClawQuickActionId,
  signal?: AIClawSignalContext,
): string {
  if (actionId !== "signal" || !signal) {
    return DEFAULT_PROMPTS[actionId];
  }

  return `解读 ${signal.symbol} 的 Yansir 策略信号，方向${SIGNAL_DIRECTION_LABELS[signal.direction]}，评分 ${signal.score}`;
}
