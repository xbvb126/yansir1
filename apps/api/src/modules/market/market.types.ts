export type Candle = {
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time?: number;
};

export type MarketKlinesResult = {
  symbol: string;
  timeframe: string;
  source: "binance" | "fixture";
  candles: Candle[];
};

export type MarketTicker = {
  symbol: string;
  price: string;
  change: string;
  quoteVolume: string;
  source?: "binance" | "fixture";
};
