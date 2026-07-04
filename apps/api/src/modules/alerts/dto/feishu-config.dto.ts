export interface FeishuConfigDto {
  webhookUrl?: string;
  enabled?: boolean;
  minScore?: number;
  cooldownMinutes?: number;
}
