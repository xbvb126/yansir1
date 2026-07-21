import type { RadarSource } from "./RadarWorkspaceChrome";
import type { StrategyListeningStatus } from "./liveSignalModel";

type StrategyStatus = "idle" | "scanning" | "ready" | "no-signal" | "error";

type SignalFacts = {
  timeframe?: string;
  triggerPrice?: number | string;
};

type RadarSourcePresentationInput = {
  source: RadarSource;
  strategyStatus: StrategyStatus;
  strategyLastScan: string;
  marketLastUpdate: string;
  scopeLabel: string;
  filterLabel: string;
  watchlistCount: number;
};

export type RadarSourcePresentation = {
  listeningStatus: StrategyListeningStatus;
  listenerLabel: string;
  latestPrefix: string;
  latestLabel: string;
  emptyState: {
    title: string;
    description: string;
    meta: string[];
    primaryActionLabel: string;
    secondaryActionLabel: string;
  };
};

export function strategyInboxSignalFacts(signal: {
  timeframe?: string;
  price?: number | string;
}): SignalFacts {
  return { timeframe: signal.timeframe, triggerPrice: signal.price };
}

export function strategyScanSignalFacts(
  result: { timeframe?: string },
  signal: { price?: number | string },
): SignalFacts {
  return { timeframe: result.timeframe, triggerPrice: signal.price };
}

export function buildRadarSourcePresentation(input: RadarSourcePresentationInput): RadarSourcePresentation {
  if (input.source === "strategy") {
    const listenerLabel = input.strategyStatus === "error"
      ? "监听异常"
      : input.strategyStatus === "scanning"
        ? "扫描中"
        : input.strategyStatus === "ready"
          ? "数据已更新"
          : input.strategyStatus === "no-signal"
            ? "本轮无信号"
            : "等待监听";
    const listeningStatus: StrategyListeningStatus = input.strategyStatus === "error"
      ? "degraded"
      : input.strategyStatus === "idle" || input.strategyStatus === "no-signal"
        ? "paused"
        : "live";
    const error = input.strategyStatus === "error";
    return {
      listeningStatus,
      listenerLabel,
      latestPrefix: "最后扫描",
      latestLabel: input.strategyLastScan,
      emptyState: {
        title: error ? "策略信号暂时延迟" : "暂无符合条件的策略信号",
        description: error
          ? "正在使用最近一次策略数据，新的信号恢复后会自动更新。"
          : "策略引擎没有发现满足当前筛选条件的信号，这不是 AI 判断缺席。",
        meta: [
          "信号来源：Yansir 策略引擎",
          `最近扫描：${input.strategyLastScan}`,
          `当前范围：${input.scopeLabel}`,
          `当前筛选：${input.filterLabel}`,
        ],
        primaryActionLabel: "放宽筛选",
        secondaryActionLabel: "查看扫描记录",
      },
    };
  }

  if (input.source === "mine") {
    return {
      listeningStatus: input.watchlistCount > 0 ? "live" : "paused",
      listenerLabel: input.watchlistCount > 0 ? "关注监听中" : "等待添加关注",
      latestPrefix: "自选更新",
      latestLabel: input.marketLastUpdate,
      emptyState: {
        title: "我的关注暂无符合条件的异动",
        description: input.watchlistCount > 0
          ? "关注列表中的币种暂未出现满足当前筛选条件的市场异动。"
          : "关注列表还是空的，添加币种后即可在这里查看对应的市场异动。",
        meta: [
          "信号来源：我的关注列表与市场行情",
          `自选更新：${input.marketLastUpdate}`,
          `当前范围：${input.scopeLabel}`,
          `当前筛选：${input.filterLabel}`,
        ],
        primaryActionLabel: "放宽筛选",
        secondaryActionLabel: "管理关注",
      },
    };
  }

  return {
    listeningStatus: "live",
    listenerLabel: "市场监听中",
    latestPrefix: "行情更新",
    latestLabel: input.marketLastUpdate,
    emptyState: {
      title: "暂无符合条件的市场异动",
      description: "当前行情未发现满足筛选条件的异动，可放宽筛选或等待下一次行情更新。",
      meta: [
        "信号来源：市场行情与雷达规则",
        `行情更新：${input.marketLastUpdate}`,
        `当前范围：${input.scopeLabel}`,
        `当前筛选：${input.filterLabel}`,
      ],
      primaryActionLabel: "放宽筛选",
      secondaryActionLabel: "查看我的关注",
    },
  };
}
