export const PUBLIC_FORMAL_SIGNAL_DELAY_HOURS = 8;
export const PUBLIC_FORMAL_SIGNAL_HISTORY_DAYS = 7;
export const PUBLIC_FORMAL_SIGNAL_TIMEFRAMES = ["5m"] as const;
export const FORMAL_STRATEGY_VERSION =
  process.env.FORMAL_STRATEGY_VERSION?.trim() || "pine-v6-v1";
