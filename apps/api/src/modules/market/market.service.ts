import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { fixtureCandlesForSymbol } from "./market.fixtures";
import { Candle, MarketKlinesResult, MarketTicker } from "./market.types";

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type BinanceExchangeInfo = {
  symbols: Array<{
    symbol: string;
    status: string;
    quoteAsset?: string;
    contractType?: string;
  }>;
};

type TickerSnapshot = BinanceTicker & { source: "binance" | "fixture" };

const FALLBACK_OVERVIEW_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TRXUSDT",
  "DOTUSDT",
  "BCHUSDT",
  "LTCUSDT",
  "UNIUSDT",
  "AAVEUSDT",
  "ETCUSDT",
  "FILUSDT",
  "NEARUSDT",
  "ATOMUSDT",
  "INJUSDT",
  "OPUSDT",
  "ARBUSDT",
  "SUIUSDT",
  "SEIUSDT",
  "TIAUSDT",
  "WLDUSDT",
  "PYTHUSDT",
  "JTOUSDT",
  "JUPUSDT",
  "ONDOUSDT",
  "PENDLEUSDT",
  "ENAUSDT",
  "STRKUSDT",
  "APTUSDT",
  "MANTAUSDT",
  "ORDIUSDT",
  "1000SATSUSDT",
  "WIFUSDT",
  "PEPEUSDT",
  "1000SHIBUSDT",
  "BONKUSDT",
  "FLOKIUSDT",
  "MEMEUSDT",
  "GALAUSDT",
  "SANDUSDT",
  "MANAUSDT",
  "AXSUSDT",
  "APEUSDT",
  "GMTUSDT",
  "DYDXUSDT",
  "RUNEUSDT",
  "FTMUSDT",
  "IMXUSDT",
  "LDOUSDT",
  "MKRUSDT",
  "SNXUSDT",
  "CRVUSDT",
  "COMPUSDT",
  "GMXUSDT",
  "RNDRUSDT",
  "FETUSDT",
  "AGIXUSDT",
  "AIUSDT",
  "ARKMUSDT",
  "NFPUSDT",
  "WUSDT",
  "ZKUSDT",
  "ZROUSDT",
  "BLURUSDT",
  "BLZUSDT",
  "CFXUSDT",
  "STXUSDT",
  "MINAUSDT",
  "KASUSDT",
  "ICPUSDT",
  "HBARUSDT",
  "ALGOUSDT",
  "VETUSDT",
  "XLMUSDT",
  "EOSUSDT",
  "ZECUSDT",
  "DASHUSDT",
  "KAVAUSDT",
  "ROSEUSDT",
  "CELOUSDT",
  "CHZUSDT",
  "MASKUSDT",
  "MAGICUSDT",
  "SSVUSDT",
  "LQTYUSDT",
  "IDUSDT",
  "ACHUSDT",
  "HIGHUSDT",
  "HOOKUSDT",
  "CYBERUSDT",
  "YGGUSDT",
  "BIGTIMEUSDT",
  "TURBOUSDT",
  "NOTUSDT",
  "PIXELUSDT",
  "PORTALUSDT",
  "DYMUSDT"
];
const OVERVIEW_TREND_LIMIT = 10;
const OVERVIEW_CACHE_TTL_MS = 120000;

@Injectable()
export class MarketService {
  private readonly baseUrl = process.env.BINANCE_FUTURES_BASE_URL || "https://fapi.binance.com";
  private readonly spotBaseUrl = process.env.BINANCE_SPOT_BASE_URL || "https://api.binance.com";
  private overviewCache: { expiresAt: number; value: Awaited<ReturnType<MarketService["buildOverview"]>> } | null = null;
  private overviewPromise: Promise<Awaited<ReturnType<MarketService["buildOverview"]>>> | null = null;
  private tradableUsdtSymbolsCache: { expiresAt: number; value: string[]; fallback: boolean } | null = null;

  async getOverview() {
    if (this.overviewCache && this.overviewCache.expiresAt > Date.now()) {
      return this.overviewCache.value;
    }

    if (this.overviewPromise) {
      return this.overviewPromise;
    }

    this.overviewPromise = this.buildOverview()
      .then((value) => {
        this.overviewCache = {
          expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
          value
        };
        return value;
      })
      .finally(() => {
        this.overviewPromise = null;
      });

    return this.overviewPromise;
  }

  private async buildOverview() {
    const snapshots = await this.getOverviewTickerSnapshots();
    const baseRows = snapshots
      .map((ticker, index) => ({
        fullSymbol: ticker.symbol,
        symbol: ticker.symbol.replace(/USDT$/, ""),
        price: formatPrice(ticker.lastPrice),
        change: formatPercent(ticker.priceChangePercent),
        oi: compactNumber(ticker.quoteVolume),
        funding: ticker.source === "binance" ? "Binance" : "Fixture",
        score: scoreTicker(ticker, index),
        state: stateForTicker(ticker),
        source: ticker.source
      }))
      .sort((left, right) => right.score - left.score);
    const trendSymbols = baseRows.slice(0, OVERVIEW_TREND_LIMIT).map((row) => row.fullSymbol);
    const trendResults = await Promise.all(trendSymbols.map((symbol) => this.getKlines(symbol, "5m", 288)));
    const trendsBySymbol = new Map(
      trendResults.map((result) => [
        result.symbol,
        {
          source: result.source,
          trend: result.candles.map((candle) => candle.close),
          volumeTrend: result.candles.map((candle) => candle.volume)
        }
      ])
    );
    const rows = baseRows.map(({ fullSymbol, ...row }) => {
      const trend = trendsBySymbol.get(fullSymbol);
      return {
        ...row,
        trend: trend?.trend ?? [],
        volumeTrend: trend?.volumeTrend ?? [],
        trendSource: trend?.source ?? row.source
      };
    });

    const liveCount = snapshots.filter((ticker) => ticker.source === "binance").length;
    const positiveCount = snapshots.filter((ticker) => Number(ticker.priceChangePercent) > 0).length;
    const totalQuoteVolume = snapshots.reduce((sum, ticker) => sum + Number(ticker.quoteVolume || 0), 0);
    const maxMove = snapshots.reduce((winner, ticker) => {
      return Math.abs(Number(ticker.priceChangePercent)) > Math.abs(Number(winner.priceChangePercent)) ? ticker : winner;
    }, snapshots[0]);

    return {
      stats: {
        monitoredSymbols: snapshots.length,
        crowdedRisks: rows.filter((row) => row.score >= 70).length,
        liveSources: liveCount,
        updatedAt: new Date().toISOString()
      },
      rows,
      factors: [
        {
          name: "24H 成交额",
          value: compactNumber(String(totalQuoteVolume)),
          desc: `${liveCount}/${snapshots.length} 个交易对来自 Binance Futures`,
          level: liveCount === snapshots.length ? "normal" : "risk"
        },
        {
          name: "上涨数量",
          value: `${positiveCount}/${snapshots.length}`,
          desc: "基于 24H ticker 涨跌幅实时计算",
          level: positiveCount >= Math.ceil(snapshots.length / 2) ? "high" : "normal"
        },
        {
          name: "最大波动",
          value: `${maxMove.symbol.replace(/USDT$/, "")} ${formatPercent(maxMove.priceChangePercent)}`,
          desc: "按绝对涨跌幅排序识别短线波动",
          level: Math.abs(Number(maxMove.priceChangePercent)) >= 5 ? "risk" : "normal"
        },
        {
          name: "数据源",
          value: liveCount === snapshots.length ? "实时" : "降级",
          desc: liveCount === snapshots.length ? "正式行情接口已接入" : "部分行情请求失败，已使用本地 fixture 兜底",
          level: liveCount === snapshots.length ? "normal" : "risk"
        }
      ]
    };
  }

  async getTicker(symbol = "BTCUSDT"): Promise<MarketTicker> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const data = await this.getTickerSnapshot(normalizedSymbol);

    return {
      symbol: normalizedSymbol,
      price: formatPrice(data.lastPrice),
      change: formatPercent(data.priceChangePercent),
      quoteVolume: compactNumber(data.quoteVolume),
      source: data.source
    };
  }

  async getKlines(symbol = "BTCUSDT", timeframe = "5m", limit = 120): Promise<MarketKlinesResult> {
    return this.getKlinesWithParams(symbol, timeframe, {
      limit: Math.max(1, Math.min(Number(limit) || 120, 500))
    });
  }

  async getKlinesBetween(symbol: string, timeframe: string, startTime: number, endTime: number, limit = 500): Promise<MarketKlinesResult> {
    return this.getKlinesWithParams(symbol, timeframe, {
      startTime,
      endTime,
      limit: Math.max(1, Math.min(Number(limit) || 500, 1000))
    });
  }

  private async getKlinesWithParams(symbol: string, timeframe: string, params: { limit: number; startTime?: number; endTime?: number }): Promise<MarketKlinesResult> {
    const normalizedSymbol = normalizeSymbol(symbol);

    try {
      const url = new URL("/fapi/v1/klines", this.baseUrl);
      url.searchParams.set("symbol", normalizedSymbol);
      url.searchParams.set("interval", timeframe);
      url.searchParams.set("limit", String(params.limit));
      if (params.startTime !== undefined) url.searchParams.set("startTime", String(params.startTime));
      if (params.endTime !== undefined) url.searchParams.set("endTime", String(params.endTime));
      const data = await fetchJson<BinanceKline[]>(url);

      return {
        symbol: normalizedSymbol,
        timeframe,
        source: "binance",
        candles: data.map(mapBinanceKline)
      };
    } catch {
      try {
        const url = new URL("/api/v3/klines", this.spotBaseUrl);
        url.searchParams.set("symbol", normalizedSymbol);
        url.searchParams.set("interval", timeframe);
        url.searchParams.set("limit", String(params.limit));
        if (params.startTime !== undefined) url.searchParams.set("startTime", String(params.startTime));
        if (params.endTime !== undefined) url.searchParams.set("endTime", String(params.endTime));
        const data = await fetchJson<BinanceKline[]>(url);

        return {
          symbol: normalizedSymbol,
          timeframe,
          source: "binance",
          candles: data.map(mapBinanceKline)
        };
      } catch {
        return {
          symbol: normalizedSymbol,
          timeframe,
          source: "fixture",
          candles: fixtureCandlesForSymbol(normalizedSymbol, params.limit)
        };
      }
    }
  }

  async getRealtimeKlineTriggerSymbols(): Promise<string[]> {
    if (this.tradableUsdtSymbolsCache && this.tradableUsdtSymbolsCache.expiresAt > Date.now()) {
      return this.tradableUsdtSymbolsCache.value;
    }

    const symbols = await this.discoverRealtimeKlineTriggerSymbols();
    const fallback = !symbols.length;
    const value = fallback ? FALLBACK_OVERVIEW_SYMBOLS : symbols;
    this.tradableUsdtSymbolsCache = { expiresAt: Date.now() + (fallback ? 2 : 10) * 60 * 1000, value, fallback };
    return value;
  }

  async getStrictRealtimeKlineTriggerSymbols(): Promise<string[]> {
    if (this.tradableUsdtSymbolsCache && !this.tradableUsdtSymbolsCache.fallback && this.tradableUsdtSymbolsCache.expiresAt > Date.now()) {
      return this.tradableUsdtSymbolsCache.value;
    }

    const symbols = await this.discoverRealtimeKlineTriggerSymbols();
    if (symbols.length) {
      this.tradableUsdtSymbolsCache = { expiresAt: Date.now() + 10 * 60 * 1000, value: symbols, fallback: false };
    }
    return symbols;
  }

  private async discoverRealtimeKlineTriggerSymbols(): Promise<string[]> {
    const [spotResult, futuresResult] = await Promise.allSettled([
      this.fetchSpotUsdtSymbols(),
      this.fetchFuturesUsdtSymbols()
    ]);
    const spotSymbols = spotResult.status === "fulfilled" ? spotResult.value : [];
    const futuresSymbols = futuresResult.status === "fulfilled" ? futuresResult.value : [];
    const futuresSet = new Set(futuresSymbols);
    const symbols = spotSymbols.length && futuresSymbols.length ? spotSymbols.filter((symbol) => futuresSet.has(symbol)) : [];
    return symbols.length ? symbols : futuresSymbols.length ? futuresSymbols : spotSymbols;
  }

  private async getTickerSnapshot(symbol: string): Promise<TickerSnapshot> {
    const normalizedSymbol = normalizeSymbol(symbol);

    try {
      const data = await this.fetchTickerData(normalizedSymbol);
      return { ...data, source: "binance" };
    } catch {
      return fixtureTickerSnapshot(normalizedSymbol);
    }
  }

  private async fetchTickerData(normalizedSymbol: string) {
    const url = new URL("/fapi/v1/ticker/24hr", this.baseUrl);
    url.searchParams.set("symbol", normalizedSymbol);
    return fetchJson<BinanceTicker>(url);
  }

  private async getOverviewTickerSnapshots(): Promise<TickerSnapshot[]> {
    try {
      const tickers = await this.fetchOverviewTickerData();
      const snapshots = tickers
        .filter(isOverviewTicker)
        .sort((left, right) => Number(right.quoteVolume || 0) - Number(left.quoteVolume || 0))
        .slice(0, overviewLimit(tickers.length))
        .map((ticker) => ({ ...ticker, source: "binance" as const }));

      if (snapshots.length) {
        return snapshots;
      }
    } catch {
      // Fall back to a broad market sample when the full futures ticker feed is unavailable.
    }

    return FALLBACK_OVERVIEW_SYMBOLS.map(fixtureTickerSnapshot);
  }

  private async fetchOverviewTickerData() {
    const url = new URL("/fapi/v1/ticker/24hr", this.baseUrl);
    return fetchJson<BinanceTicker[]>(url);
  }

  private async fetchFuturesUsdtSymbols() {
    const url = new URL("/fapi/v1/exchangeInfo", this.baseUrl);
    const info = await fetchJson<BinanceExchangeInfo>(url);
    return info.symbols
      .filter((item) => item.status === "TRADING")
      .filter((item) => item.contractType === "PERPETUAL")
      .filter((item) => item.quoteAsset === "USDT" || item.symbol.endsWith("USDT"))
      .map((item) => item.symbol)
      .filter((symbol) => symbol.endsWith("USDT") && !symbol.includes("_"))
      .sort();
  }

  private async fetchSpotUsdtSymbols() {
    const url = new URL("/api/v3/exchangeInfo", this.spotBaseUrl);
    const info = await fetchJson<BinanceExchangeInfo>(url);
    return info.symbols
      .filter((item) => item.status === "TRADING")
      .filter((item) => item.quoteAsset === "USDT" || item.symbol.endsWith("USDT"))
      .map((item) => item.symbol)
      .filter((symbol) => symbol.endsWith("USDT") && !symbol.includes("_"))
      .sort();
  }
}

function normalizeSymbol(symbol: string) {
  const value = symbol.trim().toUpperCase();
  return value.endsWith("USDT") ? value : `${value}USDT`;
}

function overviewLimit(total: number) {
  const configured = Number(process.env.MARKET_OVERVIEW_LIMIT || 0);
  if (!Number.isFinite(configured) || configured <= 0) {
    return total;
  }

  return Math.max(20, Math.min(Math.round(configured), total));
}

function isOverviewTicker(ticker: BinanceTicker) {
  return (
    ticker.symbol.endsWith("USDT") &&
    !ticker.symbol.includes("_") &&
    Number(ticker.lastPrice) > 0 &&
    Number(ticker.quoteVolume) > 0
  );
}

function fixtureTickerSnapshot(symbol: string): TickerSnapshot {
  const normalizedSymbol = normalizeSymbol(symbol);
  const candles = fixtureCandlesForSymbol(normalizedSymbol, 120);
  const latest = candles[candles.length - 1];
  const first = candles[0];
  const change = ((latest.close - first.open) / first.open) * 100;
  const quoteVolume = candles.reduce((sum, candle) => sum + candle.volume * candle.close, 0);

  return {
    symbol: normalizedSymbol,
    lastPrice: String(latest.close),
    priceChangePercent: String(change),
    quoteVolume: String(quoteVolume),
    source: "fixture"
  };
}

async function fetchJson<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Market data request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (process.platform === "win32") {
      return fetchJsonWithPowerShell<T>(url);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchJsonWithPowerShell<T>(url: URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const safeUrl = url.toString().replace(/'/g, "''");
    const command = [
      "$ProgressPreference = 'SilentlyContinue'",
      `Invoke-RestMethod -Uri '${safeUrl}' -TimeoutSec 8 | ConvertTo-Json -Compress -Depth 16`
    ].join("; ");

    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      { maxBuffer: 8 * 1024 * 1024, timeout: 10000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as unknown;
          if (isPowerShellArrayWrapper(parsed)) {
            resolve(parsed.value as T);
            return;
          }

          resolve(parsed as T);
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

function isPowerShellArrayWrapper(value: unknown): value is { value: unknown[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { value?: unknown }).value));
}

function mapBinanceKline(row: BinanceKline): Candle {
  return {
    open_time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    close_time: row[6]
  };
}

function compactNumber(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value;
  }

  if (numberValue >= 100000000) {
    return `${(numberValue / 100000000).toFixed(2)}亿`;
  }

  if (numberValue >= 10000) {
    return `${(numberValue / 10000).toFixed(2)}万`;
  }

  if (numberValue >= 1000) {
    return numberValue.toFixed(2);
  }

  if (numberValue >= 1) {
    return numberValue.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  return numberValue.toPrecision(4);
}

function formatPrice(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value;
  }

  if (numberValue >= 1) {
    return numberValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  return numberValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
}

function formatPercent(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value;
  }

  return `${numberValue >= 0 ? "+" : ""}${numberValue.toFixed(2)}%`;
}

function scoreTicker(ticker: BinanceTicker, index: number) {
  const change = Math.abs(Number(ticker.priceChangePercent) || 0);
  const quoteVolume = Math.max(Number(ticker.quoteVolume) || 1, 1);
  const moveScore = Math.min(38, change * 7.5);
  const volumeScore = Math.min(36, Math.max(0, Math.log10(quoteVolume) - 7) * 11);
  const rankBias = Math.max(0, 10 - index);
  return Math.max(28, Math.min(96, Math.round(30 + moveScore + volumeScore + rankBias)));
}

function stateForTicker(ticker: BinanceTicker) {
  const change = Number(ticker.priceChangePercent) || 0;
  const quoteVolume = Number(ticker.quoteVolume) || 0;

  if (change >= 5) return "强势放量";
  if (change >= 1) return "资金流入";
  if (change <= -5) return "急跌风险";
  if (change <= -1) return "回撤观察";
  if (quoteVolume >= 10000000000) return "高流动性";
  return "横盘观察";
}
