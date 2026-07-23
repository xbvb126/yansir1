import { Injectable } from "@nestjs/common";
import { MarketService } from "../market/market.service";
import { SignalRecord } from "../shared/mocks";
import { SignalsRepository, StrategySignalToPersist } from "./signals.repository";

@Injectable()
export class SignalsService {
  constructor(
    private readonly signalsRepository: SignalsRepository,
    private readonly marketService: MarketService
  ) {}

  async listSignals() {
    const persisted = await this.signalsRepository.findLatest();
    return { signals: persisted, source: "public_delayed_formal_ledger" };
  }

  async saveStrategySignals(signals: StrategySignalToPersist[], options: { strict?: boolean } = {}) {
    if (options.strict) {
      return this.signalsRepository.saveStrategySignalsStrict(signals);
    }
    return this.signalsRepository.saveStrategySignals(signals);
  }

  private async deriveSignalsFromMarket(): Promise<SignalRecord[]> {
    const overview = await this.marketService.getOverview();
    const rows = overview.rows
      .filter((row) => Number.isFinite(percentValue(row.change)))
      .sort((left, right) => right.score - left.score)
      .slice(0, 20);

    return rows.map((row, index) => {
      const change = percentValue(row.change);
      const direction: SignalRecord["direction"] = change >= 1 ? "long" : change <= -1 ? "short" : "flat";
      const score = Math.max(30, Math.min(96, Number(row.score) || scoreFromChange(change, index)));

      return {
        id: `live_${row.symbol}_${index}`,
        symbol: row.symbol,
        badge: score >= 75 ? "Alpha" : undefined,
        icon: iconFor(row.symbol),
        price: row.price,
        gain: row.change,
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        score,
        direction,
        title: titleFor(row.symbol, direction, change),
        reason: `来自 Binance Futures 实时 24H ticker：价格 ${row.price}，24H ${row.change}，成交额 ${row.oi || "-"}，状态 ${row.state}。`,
        oiChange: row.oi || "-",
        funding: row.funding || "Binance Futures",
        tags: [row.symbol, row.source === "binance" ? "实时行情" : "行情降级", directionLabel(direction)]
      };
    });
  }
}

function percentValue(value?: string) {
  return Number(String(value || "0").replace(/[%+,]/g, "")) || 0;
}

function scoreFromChange(change: number, index: number) {
  return Math.round(45 + Math.min(35, Math.abs(change) * 7) + Math.max(0, 10 - index));
}

function iconFor(symbol: string) {
  const normalized = symbol.toLowerCase();
  return ["btc", "eth", "xrp"].includes(normalized) ? normalized : "coin";
}

function directionLabel(direction: SignalRecord["direction"]) {
  if (direction === "long") return "看涨";
  if (direction === "short") return "看跌";
  return "观察";
}

function titleFor(symbol: string, direction: SignalRecord["direction"], change: number) {
  if (direction === "long") {
    return `${symbol} 放量走强，机会信号观察中`;
  }

  if (direction === "short") {
    return `${symbol} 回撤加深，风险信号观察中`;
  }

  return `${symbol} 波动收敛，等待确认信号`;
}
