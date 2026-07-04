export interface FeishuAlertDto {
  signalEventId?: string;
  symbol: string;
  timeframe?: string;
  price: string;
  score: number;
  direction: "long" | "short" | "flat";
  signalType?: string;
  title?: string;
  reason: string;
  oiChange?: string;
  funding?: string;
  time?: string;
}
