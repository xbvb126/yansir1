import { Injectable } from "@nestjs/common";

export type StrategyRunPayload = {
  symbol: string;
  timeframe?: string;
  mtf_timeframe?: string;
  htf_timeframe?: string;
  candles?: unknown[];
  mtf_candles?: unknown[];
  htf_candles?: unknown[];
  config?: Record<string, unknown>;
  limit?: number;
  market_data_source?: "request" | "binance" | "fixture";
};

export type StrategyScanPayload = {
  symbols?: string[];
  timeframe?: string;
  timeframes?: string[];
  limit?: number;
};

export type StrategySchedulePayload = StrategyScanPayload & {
  intervalSeconds?: number;
  minScore?: number;
  directions?: Array<"long" | "short" | "flat">;
  cooldownMinutes?: number;
  dryRun?: boolean;
  runImmediately?: boolean;
  userId?: string;
};

export type StrategyRealtimePayload = StrategyScanPayload & {
  minScore?: number;
  directions?: Array<"long" | "short" | "flat">;
  cooldownMinutes?: number;
  userId?: string;
};

export type StrategyRunResult = {
  symbol: string;
  timeframe: string;
  bar_time: number | null;
  market_state: string;
  signals: Array<{
    type: string;
    title: string;
    engine: string;
    side: "long" | "short" | "flat";
    action?: string | null;
    price: number;
    reduce_pct?: number | null;
    stop_price?: number | null;
    take_profit_price?: number | null;
    score_impact: number;
  }>;
  diagnostics?: {
    market_state_text?: string;
    risk_status?: string;
    active_engine?: string;
    current_position?: string;
    current_r?: number | null;
    remaining_position_pct?: number | null;
    bands?: Array<{
      open_time: number;
      avg?: number | null;
      upper?: number | null;
      lower?: number | null;
      direction?: number;
    }>;
    support?: {
      top?: number | null;
      bottom?: number | null;
      strength?: number;
      touched?: boolean;
    };
    resistance?: {
      top?: number | null;
      bottom?: number | null;
      strength?: number;
      touched?: boolean;
    };
  };
  metrics: Record<string, number | null>;
};

@Injectable()
export class StrategyClient {
  private readonly baseUrl = process.env.STRATEGY_SERVICE_URL || "http://127.0.0.1:8000";

  async runStrategy(payload: StrategyRunPayload): Promise<StrategyRunResult> {
    const response = await fetch(`${this.baseUrl}/strategy/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Strategy service returned ${response.status}`);
    }

    return response.json();
  }
}
