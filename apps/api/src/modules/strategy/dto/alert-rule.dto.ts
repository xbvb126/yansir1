export type AlertDirection = "long" | "short" | "flat";

export interface AlertRuleDto {
  symbols?: string[];
  timeframe?: string;
  minScore?: number;
  directions?: AlertDirection[];
  cooldownMinutes?: number;
  intervalSeconds?: number;
}
