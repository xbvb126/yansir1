import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewName } from "../../components/BottomNav";
import { apiGet, apiPost, apiUrl } from "../../lib/api";
import {
  classifyKlineSignal,
  normalizeLabSymbol,
  normalizeLabTimeframe
} from "./klineConfirmation";
import {
  buildBinanceKlineStreamUrl,
  mergeKlineCandles,
  mergeLivePriceIntoCandles,
  parseBinanceKlineStreamEvent,
  parseYansirKlineStreamEvent,
  parseMarketPrice
} from "./klineRealtime";
import type {
  KlineBandPoint,
  KlineCandle,
  KlineConfirmationResult,
  KlineDirection
} from "./klineConfirmation";

type LabTimeframe = KlineConfirmationResult["timeframe"];
type LoadState = "idle" | "loading" | "ready" | "error";

type CurrentUserLike = {
  id?: string | null;
  role?: string;
};

type MarketRowLike = {
  symbol: string;
};

type StrategyInboxSignal = {
  id: string;
  signalEventId?: string;
  symbol: string;
  timeframe: string;
  direction: KlineDirection;
  signalType?: string;
  engine?: string;
  price: number;
  score: number;
  title: string;
  reason: string;
  time: string;
  receivedAt: string;
};

type SelectedSignal = {
  id?: string;
  symbol: string;
  timeframe: string;
  direction?: KlineDirection;
  price: number | null;
  score?: number;
  title: string;
  reason: string;
  time?: string | number;
  receivedAt?: string | number;
  engine?: string;
};

type KlineLabViewProps = {
  currentUser: CurrentUserLike;
  rows: MarketRowLike[];
  navigate: (nextView: ViewName) => void;
  showToast: (message: string) => void;
};

type MarketKlinesResponse = {
  source?: string;
  candles?: Array<Partial<KlineCandle>>;
};

type MarketTickerResponse = {
  price?: string | number | null;
  source?: string;
};

type StrategySignalListResponse = {
  signals?: StrategyInboxSignal[];
};

type StrategyDiagnosticBand = {
  open_time: number;
  avg?: number | null;
  upper?: number | null;
  lower?: number | null;
  direction?: number;
};

type StrategyDiagnostics = {
  market_state_text?: string;
  risk_status?: string;
  active_engine?: string;
  current_position?: string;
  current_r?: number | null;
  remaining_position_pct?: number | null;
  bands?: StrategyDiagnosticBand[];
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

type StrategyRunSignal = {
  type?: string;
  title?: string;
  engine?: string;
  side: KlineDirection;
  action?: string | null;
  price: number;
  reduce_pct?: number | null;
  reducePct?: number | null;
  stop_price?: number | null;
  take_profit_price?: number | null;
  score_impact: number;
};

type StrategyRunResult = {
  symbol: string;
  timeframe: string;
  bar_time: number | null;
  market_state: string;
  signals: StrategyRunSignal[];
  diagnostics?: StrategyDiagnostics;
  metrics?: Record<string, number | null>;
};

type StrategyRunResponse = {
  result?: StrategyRunResult;
  marketData?: {
    source?: string;
    candles?: number;
  };
  persistence?: {
    persisted?: boolean;
    count?: number;
  };
};

type KlineCacheEntry = {
  candles: KlineCandle[];
  source: string;
  fetchedAt: number;
};

type ChartScale = {
  min: number;
  max: number;
  innerWidth: number;
  xAt: (index: number) => number;
  yAt: (value: number) => number;
};

const TIMEFRAMES: LabTimeframe[] = ["5m", "15m", "1h", "4h"];
const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL"];
const KLINE_LIMIT = 180;
const MIN_STRATEGY_RUN_CANDLES = 35;
const LIVE_TICKER_REFRESH_MS = 5000;
const KLINE_BACKGROUND_REFRESH_MS = 30000;
const KLINE_STREAM_BASE_URL = import.meta.env.VITE_BINANCE_KLINE_STREAM_URL || undefined;
const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const CHART_PAD = { top: 18, right: 24, bottom: 26, left: 54 };

export function KlineLabView({ currentUser, rows, navigate, showToast }: KlineLabViewProps) {
  const [symbol, setSymbol] = useState(() => readInitialSymbol());
  const [timeframe, setTimeframe] = useState<LabTimeframe>(() => readInitialTimeframe());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [candles, setCandles] = useState<KlineCandle[]>([]);
  const [candleDatasetKey, setCandleDatasetKey] = useState("");
  const [marketSource, setMarketSource] = useState("");
  const [candleState, setCandleState] = useState<LoadState>("idle");
  const [candleError, setCandleError] = useState("");
  const [inboxSignals, setInboxSignals] = useState<StrategyInboxSignal[]>([]);
  const [signalState, setSignalState] = useState<LoadState>("idle");
  const [signalError, setSignalError] = useState("");
  const [strategyDiagnostics, setStrategyDiagnostics] = useState<StrategyDiagnostics | null>(null);
  const [strategyRunSignals, setStrategyRunSignals] = useState<StrategyRunSignal[]>([]);
  const [strategyRunState, setStrategyRunState] = useState<LoadState>("idle");
  const [strategyRunError, setStrategyRunError] = useState("");
  const [tickerPrice, setTickerPrice] = useState<number | null>(null);
  const [tickerSource, setTickerSource] = useState("");
  const [tickerState, setTickerState] = useState<LoadState>("idle");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "live" | "fallback">("idle");
  const [lastMarketRefreshAt, setLastMarketRefreshAt] = useState<number | null>(null);
  const klineCacheRef = useRef(new Map<string, KlineCacheEntry>());
  const klineRequestRef = useRef(0);
  const strategyRunRequestRef = useRef(0);
  const tickerSymbolRef = useRef(symbol);
  const canRequestInbox = Boolean(currentUser.id && currentUser.role === "admin");
  const activeKlineKey = klineCacheKey(symbol, timeframe);
  const latestStrategyCandle = candles[candles.length - 1];
  const strategyRunTriggerKey = useMemo(() => {
    if (!latestStrategyCandle) return "empty";
    return [
      candleDatasetKey,
      candles.length,
      latestStrategyCandle.open_time,
      latestStrategyCandle.close_time ?? ""
    ].join(":");
  }, [candleDatasetKey, candles.length, latestStrategyCandle?.open_time, latestStrategyCandle?.close_time]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "kline-lab");
    params.set("symbol", symbol);
    params.set("tf", timeframe);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [symbol, timeframe]);

  useEffect(() => {
    let alive = true;
    let intervalId: number | undefined;
    const key = activeKlineKey;
    const cached = klineCacheRef.current.get(key);

    if (cached) {
      setCandles(cached.candles);
      setCandleDatasetKey(key);
      setMarketSource(cached.source);
      setCandleState("ready");
      setLastMarketRefreshAt(cached.fetchedAt);
    } else {
      setCandles([]);
      setCandleDatasetKey("");
      setMarketSource("");
      setCandleState("loading");
    }

    setCandleError("");

    async function loadCandles(showLoading: boolean) {
      const requestId = ++klineRequestRef.current;
      if (showLoading && !klineCacheRef.current.has(key)) {
        setCandleState("loading");
      }

      try {
        const response = await apiGet<MarketKlinesResponse>(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${KLINE_LIMIT}`);
        if (!alive || requestId !== klineRequestRef.current) return;

        const source = response.source || "";
        const normalized = normalizeCandles(response.candles || []);
        const existing = klineCacheRef.current.get(key)?.candles || [];
        const nextCandles = mergeKlineCandles(existing, normalized, KLINE_LIMIT);
        const fetchedAt = Date.now();

        klineCacheRef.current.set(key, { candles: nextCandles, source, fetchedAt });
        setCandles(nextCandles);
        setCandleDatasetKey(key);
        setMarketSource(source);
        setLastMarketRefreshAt(fetchedAt);
        setCandleState("ready");
      } catch (error) {
        if (!alive) return;
        const fallback = klineCacheRef.current.get(key);
        if (fallback) {
          setCandles(fallback.candles);
          setCandleDatasetKey(key);
          setMarketSource(fallback.source);
          setLastMarketRefreshAt(fallback.fetchedAt);
          setCandleState("ready");
        } else {
          setCandles([]);
          setCandleDatasetKey("");
          setMarketSource("");
          setCandleState("error");
        }
        setCandleError(error instanceof Error ? error.message : "K线读取失败");
      }
    }

    void loadCandles(!cached);
    intervalId = window.setInterval(() => {
      void loadCandles(false);
    }, KLINE_BACKGROUND_REFRESH_MS);

    return () => {
      alive = false;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeKlineKey, symbol, timeframe, refreshNonce]);

  useEffect(() => {
    let alive = true;
    let intervalId: number | undefined;
    const key = activeKlineKey;

    if (tickerSymbolRef.current !== symbol) {
      tickerSymbolRef.current = symbol;
      setTickerPrice(null);
      setTickerSource("");
      setTickerState("loading");
    } else {
      setTickerState((current) => current === "idle" ? "loading" : current);
    }

    async function loadTicker() {
      try {
        const response = await apiGet<MarketTickerResponse>(`/api/market/ticker?symbol=${encodeURIComponent(symbol)}`);
        if (!alive) return;

        const price = parseMarketPrice(response.price);
        const fetchedAt = Date.now();
        setTickerPrice(price);
        setTickerSource(response.source || "");
        setTickerState("ready");
        setLastMarketRefreshAt(fetchedAt);

        if (price == null) return;

        setCandles((current) => {
          const nextCandles = mergeLivePriceIntoCandles(current, price, timeframe, fetchedAt).slice(-KLINE_LIMIT);
          const existing = klineCacheRef.current.get(key);
          klineCacheRef.current.set(key, {
            candles: nextCandles,
            source: existing?.source || response.source || "",
            fetchedAt
          });
          setCandleDatasetKey(key);
          return nextCandles;
        });
      } catch {
        if (alive) setTickerState("error");
      }
    }

    void loadTicker();
    intervalId = window.setInterval(() => {
      void loadTicker();
    }, LIVE_TICKER_REFRESH_MS);

    return () => {
      alive = false;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeKlineKey, symbol, timeframe]);

  useEffect(() => {
    let alive = true;
    let eventSource: EventSource | null = null;
    let directSocket: WebSocket | null = null;
    let directFallbackStarted = false;
    const key = activeKlineKey;

    function applyStreamEvent(streamEvent: ReturnType<typeof parseYansirKlineStreamEvent>, sourceLabel: string) {
      if (!alive || !streamEvent || streamEvent.symbol !== symbol || streamEvent.timeframe !== timeframe) return;
      const fetchedAt = Date.now();
      setTickerPrice(streamEvent.candle.close);
      setTickerSource(sourceLabel);
      setTickerState("ready");
      setStreamState("live");
      setLastMarketRefreshAt(fetchedAt);

      setCandles((current) => {
          const nextCandles = mergeKlineCandles(current, [streamEvent.candle], KLINE_LIMIT);
          const existing = klineCacheRef.current.get(key);
          klineCacheRef.current.set(key, {
            candles: nextCandles,
            source: existing?.source || sourceLabel,
            fetchedAt
          });
          setCandleDatasetKey(key);
          return nextCandles;
        });
    }

    function startDirectFallback() {
      if (!alive || directFallbackStarted || typeof WebSocket === "undefined") {
        if (alive) setStreamState("fallback");
        return;
      }

      directFallbackStarted = true;
      eventSource?.close();
      directSocket = new WebSocket(buildBinanceKlineStreamUrl(symbol, timeframe, KLINE_STREAM_BASE_URL));
      setStreamState("connecting");

      directSocket.addEventListener("open", () => {
        if (alive) setStreamState("live");
      });

      directSocket.addEventListener("message", (event) => {
        if (!alive) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }

        applyStreamEvent(parseBinanceKlineStreamEvent(parsed), "direct binance stream");
      });

      directSocket.addEventListener("error", () => {
        if (alive) setStreamState("fallback");
      });

      directSocket.addEventListener("close", () => {
        if (alive) setStreamState("fallback");
      });
    }

    setStreamState("connecting");

    if (typeof EventSource === "undefined") {
      startDirectFallback();
    } else {
      const params = new URLSearchParams({ symbol, timeframe });
      eventSource = new EventSource(apiUrl(`/api/market/kline-stream?${params.toString()}`));

      eventSource.addEventListener("status", (event) => {
        if (!alive) return;
        try {
          const data = JSON.parse(String(event.data)) as { status?: string };
          if (data.status === "connected") {
            setStreamState("live");
            setTickerSource("Yansir proxy");
          }
        } catch {
          // Ignore malformed status events; kline events carry the data that matters.
        }
      });

      eventSource.addEventListener("kline", (event) => {
        applyStreamEvent(parseYansirKlineStreamEvent(event.data), "Yansir proxy");
      });

      eventSource.onerror = () => {
        if (!alive) return;
        setStreamState("fallback");
        startDirectFallback();
      };
    }

    return () => {
      alive = false;
      eventSource?.close();
      directSocket?.close();
    };
  }, [activeKlineKey, symbol, timeframe]);

  useEffect(() => {
    let alive = true;
    const timers = TIMEFRAMES
      .filter((item) => item !== timeframe)
      .map((item, index) => window.setTimeout(async () => {
        const key = klineCacheKey(symbol, item);
        if (klineCacheRef.current.has(key)) return;

        try {
          const response = await apiGet<MarketKlinesResponse>(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(item)}&limit=${KLINE_LIMIT}`);
          if (!alive) return;
          const candles = normalizeCandles(response.candles || []).slice(-KLINE_LIMIT);
          klineCacheRef.current.set(key, {
            candles,
            source: response.source || "",
            fetchedAt: Date.now()
          });
        } catch {
          // Prefetch is opportunistic; the active timeframe request owns user-facing errors.
        }
      }, 250 + index * 200));

    return () => {
      alive = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!canRequestInbox) {
      setInboxSignals([]);
      setSignalState("idle");
      setSignalError("");
      return;
    }

    let alive = true;
    setSignalState("loading");
    setInboxSignals([]);
    setSignalError("");
    apiGet<StrategySignalListResponse>(`/api/strategy/inbox?mode=all&limit=20&page=1&symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`)
      .then((response) => {
        if (!alive) return;
        setInboxSignals(Array.isArray(response.signals) ? response.signals : []);
        setSignalState("ready");
      })
      .catch((error) => {
        if (!alive) return;
        setInboxSignals([]);
        setSignalError(error instanceof Error ? error.message : "策略信号读取失败");
        setSignalState("error");
      });
    return () => {
      alive = false;
    };
  }, [canRequestInbox, symbol, timeframe, refreshNonce]);

  useEffect(() => {
    const requestId = ++strategyRunRequestRef.current;
    const datasetMatches = candleDatasetKey === activeKlineKey;

    if (!canRequestInbox || !datasetMatches || candles.length < MIN_STRATEGY_RUN_CANDLES) {
      setStrategyDiagnostics(null);
      setStrategyRunSignals([]);
      setStrategyRunError("");
      setStrategyRunState("idle");
      return;
    }

    let alive = true;
    const runCandles = candles.slice(-KLINE_LIMIT);

    setStrategyRunState("loading");
    setStrategyRunError("");

    apiPost<StrategyRunResponse>("/api/strategy/run", {
      symbol: `${normalizeLabSymbol(symbol)}USDT`,
      timeframe,
      candles: runCandles,
      limit: runCandles.length,
      market_data_source: "request"
    })
      .then((response) => {
        if (!alive || requestId !== strategyRunRequestRef.current) return;
        setStrategyDiagnostics(response.result?.diagnostics ?? null);
        setStrategyRunSignals(normalizeStrategyRunSignals(response.result?.signals));
        setStrategyRunState("ready");
      })
      .catch((error) => {
        if (!alive || requestId !== strategyRunRequestRef.current) return;
        setStrategyDiagnostics(null);
        setStrategyRunSignals([]);
        setStrategyRunError(error instanceof Error ? error.message : "策略输出读取失败");
        setStrategyRunState("error");
      });

    return () => {
      alive = false;
    };
  }, [canRequestInbox, symbol, timeframe, strategyRunTriggerKey, refreshNonce]);

  const symbolOptions = useMemo(() => {
    const marketSymbols = rows.map((row) => normalizeLabSymbol(row.symbol)).filter(Boolean);
    return Array.from(new Set([symbol, ...DEFAULT_SYMBOLS, ...marketSymbols])).slice(0, 80);
  }, [rows, symbol]);

  const selectedSignal = useMemo(() => {
    return selectLatestSignal(symbol, timeframe, inboxSignals);
  }, [symbol, timeframe, inboxSignals]);

  const primaryStrategyRunSignal = useMemo(() => {
    return strategyRunSignals.find((item) => actionable(item.side)) ?? null;
  }, [strategyRunSignals]);

  const candleQualityReference = useMemo(() => {
    return classifyKlineSignal({
      candles,
      signal: primaryStrategyRunSignal
        ? {
            direction: primaryStrategyRunSignal.side,
            price: primaryStrategyRunSignal.price,
            timeframe,
            symbol
          }
        : null
    });
  }, [candles, primaryStrategyRunSignal, symbol, timeframe]);

  const strategyBands = useMemo(() => {
    return normalizeStrategyDiagnosticBands(strategyDiagnostics?.bands, candles);
  }, [strategyDiagnostics, candles]);

  const chartBands = strategyBands.length ? strategyBands : candleQualityReference.bands;

  const latestCandle = candles[candles.length - 1];
  const livePrice = tickerPrice ?? latestCandle?.close ?? null;
  const liveStatus = streamState === "live"
    ? "流式"
    : streamState === "connecting"
      ? "连接中"
      : tickerState === "error" ? "价格延迟" : tickerState === "loading" && tickerPrice == null ? "同步中" : "实时";
  const lastMarketRefreshLabel = lastMarketRefreshAt ? formatRefreshAge(lastMarketRefreshAt) : "--";

  function handleRefresh() {
    setRefreshNonce((current) => current + 1);
    showToast("策略输出正在刷新");
  }

  return (
    <section className="view active-view kline-lab-view" aria-label="K线实验室">
      <header className="kline-lab-header">
        <button className="kline-lab-back" type="button" onClick={() => navigate("radar")} aria-label="返回">
          返回
        </button>
        <div className="kline-lab-title">
          <span>Yansir 内部</span>
          <h1>K线实验室</h1>
        </div>
        <span className={`kline-confirmation-badge state-${strategyRunState}`}>
          {formatStrategyOutputBadge(strategyRunState, strategyRunSignals, candles.length, canRequestInbox)}
        </span>
      </header>

      <section className="kline-lab-toolbar" aria-label="K线验信控制台">
        <label className="kline-symbol-select">
          <span>币种</span>
          <select value={symbol} onChange={(event) => setSymbol(normalizeLabSymbol(event.target.value))}>
            {symbolOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="kline-timeframe-tabs" role="group" aria-label="周期">
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              className={item === timeframe ? "active" : ""}
              type="button"
              onClick={() => setTimeframe(item)}
              aria-pressed={item === timeframe}
            >
              {item}
            </button>
          ))}
        </div>
        <button className="kline-refresh-button" type="button" onClick={handleRefresh}>
          刷新
        </button>
      </section>

      <section className="kline-lab-grid">
        <article className="kline-chart-panel" aria-label={`${symbol} ${timeframe} K线图`}>
          <div className="kline-panel-head">
            <div>
              <strong>{symbol} / USDT</strong>
              <span>{timeframe} · {KLINE_LIMIT} 根K线{marketSource ? ` · 数据源 ${formatMarketSource(marketSource)}` : ""}</span>
              <div className="kline-live-price" aria-label="实时价格">
                <span>现价</span>
                <strong>{livePrice == null ? "--" : formatPrice(livePrice)}</strong>
                <em>{liveStatus} · {formatMarketSource(tickerSource || marketSource)} · {lastMarketRefreshLabel}</em>
              </div>
            </div>
            <span>{candleState === "loading" ? "读取K线中" : `${candles.length} 根K线`}</span>
          </div>
          {candleError && <p className="kline-lab-error">{candleError}</p>}
          <KlineChart candles={candles} bands={chartBands} />
        </article>

        <StrategyOutputPanel
          signals={strategyRunSignals}
          diagnostics={strategyDiagnostics}
          status={strategyRunState}
          error={strategyRunError}
          canRequestStrategy={canRequestInbox}
          candleCount={candles.length}
        />
      </section>

      <CandleQualityCard candleQuality={candleQualityReference} usingBackendBands={strategyBands.length > 0} />

      <StrategySignalPanel signal={selectedSignal} status={signalState} error={signalError} canRequestInbox={canRequestInbox} />

      <section className="kline-mtf-placeholders" aria-label="多周期占位">
        {TIMEFRAMES.map((item) => (
          <article key={item} className={item === timeframe ? "active" : ""}>
            <span>{item}</span>
            <strong>{item === timeframe ? "当前验信周期" : "待接入多周期共振"}</strong>
            <p>保留位置用于后续展示同币种跨周期趋势带、信号一致性和风险偏离。</p>
          </article>
        ))}
      </section>

      <footer className="kline-lab-footer">
        仅限管理员/内部使用。本页只复核既有策略信号，不改变信号来源，也不会从K线生成新信号。
      </footer>
    </section>
  );
}

function KlineChart({ candles, bands }: { candles: KlineCandle[]; bands: KlineBandPoint[] }) {
  const visibleCandles = candles.slice(-90);
  const visibleStartIndex = Math.max(0, candles.length - visibleCandles.length);
  const visibleBands = visibleChartBands(bands, visibleStartIndex, visibleCandles.length);
  const scale = buildScale(visibleCandles, visibleBands);

  if (!visibleCandles.length || !scale) {
    return (
      <svg className="kline-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="暂无K线数据">
        <text x={CHART_WIDTH / 2} y={CHART_HEIGHT / 2} textAnchor="middle">暂无K线数据</text>
      </svg>
    );
  }

  const candleStep = scale.innerWidth / Math.max(visibleCandles.length, 1);
  const candleWidth = Math.max(2, Math.min(8, candleStep * 0.55));
  const upperPath = buildBandPath(visibleBands, scale, "upper");
  const midPath = buildBandPath(visibleBands, scale, "mid");
  const lowerPath = buildBandPath(visibleBands, scale, "lower");

  return (
    <svg className="kline-svg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="K线与趋势带">
      <line className="kline-axis" x1={CHART_PAD.left} y1={CHART_HEIGHT - CHART_PAD.bottom} x2={CHART_WIDTH - CHART_PAD.right} y2={CHART_HEIGHT - CHART_PAD.bottom} />
      <line className="kline-axis" x1={CHART_PAD.left} y1={CHART_PAD.top} x2={CHART_PAD.left} y2={CHART_HEIGHT - CHART_PAD.bottom} />
      {upperPath && <path className="kline-band kline-band-upper" d={upperPath} fill="none" stroke="#d69118" strokeWidth="1.5" />}
      {lowerPath && <path className="kline-band kline-band-lower" d={lowerPath} fill="none" stroke="#3a7bd5" strokeWidth="1.5" />}
      {midPath && <path className="kline-band kline-band-mid" d={midPath} fill="none" stroke="#72767d" strokeWidth="1.5" strokeDasharray="4 4" />}
      {visibleCandles.map((candle, index) => {
        const x = scale.xAt(index);
        const openY = scale.yAt(candle.open);
        const closeY = scale.yAt(candle.close);
        const highY = scale.yAt(candle.high);
        const lowY = scale.yAt(candle.low);
        const up = candle.close >= candle.open;
        const color = up ? "#14a86b" : "#d94c4c";
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));

        return (
          <g key={`${candle.open_time}-${index}`} className={`kline-candle ${up ? "up" : "down"}`}>
            <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1.2" />
            <rect x={x - candleWidth / 2} y={bodyY} width={candleWidth} height={bodyHeight} rx="1" fill={up ? "transparent" : color} stroke={color} strokeWidth="1.2" />
          </g>
        );
      })}
      <text className="kline-price-label high" x={CHART_PAD.left - 8} y={CHART_PAD.top + 4} textAnchor="end">{formatPrice(scale.max)}</text>
      <text className="kline-price-label low" x={CHART_PAD.left - 8} y={CHART_HEIGHT - CHART_PAD.bottom} textAnchor="end">{formatPrice(scale.min)}</text>
    </svg>
  );
}

function StrategyOutputPanel({
  signals,
  diagnostics,
  status,
  error,
  canRequestStrategy,
  candleCount
}: {
  signals: StrategyRunSignal[];
  diagnostics: StrategyDiagnostics | null;
  status: LoadState;
  error: string;
  canRequestStrategy: boolean;
  candleCount: number;
}) {
  return (
    <article className="kline-evidence-card" aria-label="策略输出">
      <div className="kline-panel-head">
        <div>
          <strong>策略输出</strong>
          <span>{formatStrategyRunStatus(status, canRequestStrategy, candleCount)}</span>
        </div>
        <strong>{signals.length ? `${signals.length} 条` : "--"}</strong>
      </div>
      {error ? (
        <p className="kline-lab-error">后端策略输出读取失败：{error}</p>
      ) : (
        <p>{formatStrategyDiagnosticsSummary(diagnostics, signals)}</p>
      )}
      <dl>
        <div>
          <dt>引擎</dt>
          <dd>{formatStrategyEngine(diagnostics?.active_engine || signals[0]?.engine)}</dd>
        </div>
        <div>
          <dt>市场状态</dt>
          <dd>{formatNullableText(diagnostics?.market_state_text)}</dd>
        </div>
        <div>
          <dt>风险</dt>
          <dd>{formatNullableText(diagnostics?.risk_status)}</dd>
        </div>
        <div>
          <dt>仓位</dt>
          <dd>{formatNullableText(diagnostics?.current_position)}</dd>
        </div>
      </dl>
      {signals.length ? (
        <ul className="kline-evidence-list">
          {signals.map((signal, index) => (
            <li key={`${signal.type || "strategy"}-${signal.side}-${signal.price}-${index}`} className={`status-${actionable(signal.side) ? "pass" : "neutral"}`}>
              <div>
                <strong>{formatStrategyRunSignalTitle(signal)}</strong>
                <span>{formatDirection(signal.side)} · {formatStrategyAction(signal.action)} · {signal.score_impact}/100</span>
              </div>
              <p>
                价格 {formatPrice(signal.price)}
                {formatReducePct(signal) ? ` · 减仓 ${formatReducePct(signal)}` : ""}
                {signal.stop_price != null ? ` · 止损 ${formatPrice(signal.stop_price)}` : ""}
                {signal.take_profit_price != null ? ` · 止盈 ${formatPrice(signal.take_profit_price)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无后端策略信号；本面板不会用前端K线质量参考生成替代信号。</p>
      )}
    </article>
  );
}

function CandleQualityCard({ candleQuality, usingBackendBands }: { candleQuality: KlineConfirmationResult; usingBackendBands: boolean }) {
  return (
    <article className="kline-evidence-card" aria-label="K线质量参考">
      <div className="kline-panel-head">
        <div>
          <strong>K线质量参考</strong>
          <span>{usingBackendBands ? "图表趋势带来自后端策略诊断" : "图表趋势带使用本地质量参考"}</span>
        </div>
        <strong>{candleQuality.score}/100</strong>
      </div>
      <p>{formatCandleQualitySummary(candleQuality)}</p>
      <ul className="kline-evidence-list">
        {candleQuality.evidence.map((item) => (
          <li key={item.key} className={`status-${item.status}`}>
            <div>
              <strong>{formatCandleQualityEvidenceLabel(item)}</strong>
              <span>{formatEvidenceStatus(item.status)} · {item.score}/{item.weight}</span>
            </div>
            <p>{formatCandleQualityEvidenceDetail(item)}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function StrategySignalPanel({ signal, status, error, canRequestInbox }: { signal: SelectedSignal | null; status: LoadState; error: string; canRequestInbox: boolean }) {
  if (!signal) {
    return (
      <section className="kline-strategy-panel empty" aria-label="策略信号箱">
        <strong>策略信号箱</strong>
        <p>暂无当前周期策略命中，当前页面不从K线或市场异动生成新信号。</p>
        {!canRequestInbox && <small>非管理员不会请求策略信号箱。</small>}
        {error && <small>{error}</small>}
      </section>
    );
  }

  return (
    <section className="kline-strategy-panel" aria-label="策略信号箱">
      <div className="kline-panel-head">
        <div>
          <strong>{formatSignalTitle(signal)}</strong>
          <span>策略信号箱 · {signal.timeframe}</span>
        </div>
        <strong>{formatDirection(signal.direction)} · {signal.score ?? "--"}</strong>
      </div>
      <dl>
        <div>
          <dt>币种</dt>
          <dd>{normalizeLabSymbol(signal.symbol)}</dd>
        </div>
        <div>
          <dt>价格</dt>
          <dd>{signal.price == null ? "--" : formatPrice(signal.price)}</dd>
        </div>
        <div>
          <dt>时间</dt>
          <dd>{formatSignalTime(signal.receivedAt || signal.time)}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{status === "loading" ? "刷新中" : formatStrategyEngine(signal.engine)}</dd>
        </div>
      </dl>
      <p>{formatSignalText(signal.reason, signal.direction) || "策略命中无附加说明。"}</p>
      {error && <small>{error}</small>}
    </section>
  );
}

function readInitialSymbol() {
  if (typeof window === "undefined") return "BTC";
  return normalizeLabSymbol(new URLSearchParams(window.location.search).get("symbol"));
}

function readInitialTimeframe(): LabTimeframe {
  if (typeof window === "undefined") return "5m";
  return normalizeLabTimeframe(new URLSearchParams(window.location.search).get("tf"));
}

function klineCacheKey(symbol: string, timeframe: LabTimeframe) {
  return `${normalizeLabSymbol(symbol)}:${timeframe}`;
}

function formatRefreshAge(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 3) return "刚刚";
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  return `${Math.floor(minutes / 60)}小时前`;
}

function normalizeCandles(candles: Array<Partial<KlineCandle>>): KlineCandle[] {
  return candles
    .map((candle) => ({
      open_time: Number(candle.open_time),
      close_time: candle.close_time == null ? null : Number(candle.close_time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: candle.volume == null ? undefined : Number(candle.volume)
    }))
    .filter((candle) => {
      if (!Number.isFinite(candle.open_time)) return false;
      if (candle.close_time != null && !Number.isFinite(candle.close_time)) return false;
      if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high)) return false;
      if (!Number.isFinite(candle.low) || !Number.isFinite(candle.close)) return false;
      if (candle.high < candle.low) return false;
      if (Math.max(candle.open, candle.close) > candle.high) return false;
      return Math.min(candle.open, candle.close) >= candle.low;
    });
}

function normalizeStrategyRunSignals(signals: StrategyRunResult["signals"] | undefined): StrategyRunSignal[] {
  const normalized: StrategyRunSignal[] = [];

  for (const signal of signals ?? []) {
    const price = parseOptionalNumber(signal.price);
    if (price == null) continue;

    normalized.push({
      ...signal,
      side: normalizeStrategySide(signal.side),
      price,
      score_impact: parseOptionalNumber(signal.score_impact) ?? 0,
      reduce_pct: parseOptionalNumber(signal.reduce_pct),
      reducePct: parseOptionalNumber(signal.reducePct),
      stop_price: parseOptionalNumber(signal.stop_price),
      take_profit_price: parseOptionalNumber(signal.take_profit_price)
    });
  }

  return normalized;
}

function normalizeStrategyDiagnosticBands(bands: StrategyDiagnosticBand[] | undefined, candles: KlineCandle[]): KlineBandPoint[] {
  if (!bands?.length || !candles.length) return [];

  const candleByOpenTime = new Map(candles.map((candle, index) => [candle.open_time, { candle, index }]));
  const fallbackStart = Math.max(0, candles.length - bands.length);
  const points: KlineBandPoint[] = [];

  bands.forEach((band, index) => {
    const openTime = parseOptionalNumber(band.open_time);
    const fallbackIndex = Math.min(candles.length - 1, fallbackStart + index);
    const fallbackCandle = candles[fallbackIndex] ?? candles[index];
    const match = openTime == null ? null : candleByOpenTime.get(openTime);
    const candle = match?.candle ?? fallbackCandle;
    const candleIndex = match?.index ?? fallbackIndex;
    if (!candle) return;

    const upperValue = parseOptionalNumber(band.upper);
    const lowerValue = parseOptionalNumber(band.lower);
    const midpoint = parseOptionalNumber(band.avg)
      ?? (upperValue != null && lowerValue != null ? (upperValue + lowerValue) / 2 : null)
      ?? candle.close;
    const upper = upperValue ?? midpoint;
    const lower = lowerValue ?? midpoint;
    const atr = Math.max(Math.abs(upper - lower) / 2, candle.high - candle.low, 0);

    points.push({
      time: openTime ?? candle.open_time,
      open_time: openTime ?? candle.open_time,
      close_time: candle.close_time,
      close: candle.close,
      mid: midpoint,
      basis: midpoint,
      upper,
      lower,
      atr,
      candleIndex
    });
  });

  return points;
}

function normalizeStrategySide(side: KlineDirection | undefined): KlineDirection {
  if (side === "long" || side === "short") return side;
  return "flat";
}

function selectLatestSignal(symbol: string, timeframe: LabTimeframe, inbox: StrategyInboxSignal[]): SelectedSignal | null {
  const cleanSymbol = normalizeLabSymbol(symbol);
  const exactInbox = latestByTime(
    inbox.filter((item) => (
      normalizeLabSymbol(item.symbol) === cleanSymbol
      && isExactTimeframe(item.timeframe, timeframe)
      && actionable(item.direction)
    ))
  );
  return exactInbox ? fromInbox(exactInbox) : null;
}

function fromInbox(signal: StrategyInboxSignal): SelectedSignal {
  return {
    id: signal.id || signal.signalEventId,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    direction: signal.direction,
    price: parseNumber(signal.price),
    score: signal.score,
    title: signal.title,
    reason: signal.reason,
    time: signal.time,
    receivedAt: signal.receivedAt,
    engine: signal.engine || signal.signalType
  };
}

function isExactTimeframe(value: string | undefined, timeframe: LabTimeframe) {
  return String(value ?? "").trim().toLowerCase() === timeframe;
}

function latestByTime<T extends { time?: string | number; receivedAt?: string | number }>(items: T[]) {
  if (!items.length) return null;
  return [...items].sort((left, right) => signalTimestamp(right) - signalTimestamp(left))[0];
}

function signalTimestamp(signal: { time?: string | number; receivedAt?: string | number }) {
  return parseTimestamp(signal.receivedAt) || parseTimestamp(signal.time);
}

function parseTimestamp(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function actionable(direction: KlineDirection | undefined): direction is Exclude<KlineDirection, "flat"> {
  return direction === "long" || direction === "short";
}

function parseNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return null;
  return parseNumber(value);
}

function buildScale(candles: KlineCandle[], bands: KlineBandPoint[]): ChartScale | null {
  if (!candles.length) return null;
  const values = [
    ...candles.flatMap((candle) => [candle.high, candle.low, candle.open, candle.close]),
    ...bands.flatMap((point) => [point.upper, point.mid, point.lower])
  ].filter(Number.isFinite);
  if (!values.length) return null;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, rawMax * 0.002, 0.00000001);
  const min = rawMin - spread * 0.08;
  const max = rawMax + spread * 0.08;
  const innerWidth = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
  const innerHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;

  return {
    min,
    max,
    innerWidth,
    xAt: (index) => CHART_PAD.left + (index + 0.5) * (innerWidth / Math.max(candles.length, 1)),
    yAt: (value) => CHART_PAD.top + ((max - value) / Math.max(max - min, 0.00000001)) * innerHeight
  };
}

function visibleChartBands(bands: KlineBandPoint[], visibleStartIndex: number, visibleCount: number) {
  const visibleEndIndex = visibleStartIndex + visibleCount;
  const hasExplicitIndex = bands.some((point) => typeof point.candleIndex === "number");
  if (!hasExplicitIndex) return bands.slice(-visibleCount);
  return bands
    .filter((point) => (
      typeof point.candleIndex === "number"
      && point.candleIndex >= visibleStartIndex
      && point.candleIndex < visibleEndIndex
    ))
    .map((point) => ({
      ...point,
      candleIndex: (point.candleIndex ?? visibleStartIndex) - visibleStartIndex
    }));
}

function buildBandPath(bands: KlineBandPoint[], scale: ChartScale, key: "upper" | "mid" | "lower") {
  const points = bands
    .map((point, index) => ({ x: scale.xAt(point.candleIndex ?? index), y: scale.yAt(point[key]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return points.map((point, index) => `${index ? "L" : "M"} ${roundSvg(point.x)} ${roundSvg(point.y)}`).join(" ");
}

function roundSvg(value: number) {
  return Math.round(value * 10) / 10;
}

function formatStrategyOutputBadge(state: LoadState, signals: StrategyRunSignal[], candleCount: number, canRequestStrategy: boolean) {
  if (!canRequestStrategy) return "仅管理员可见";
  if (candleCount < MIN_STRATEGY_RUN_CANDLES) return "等待K线";
  if (state === "loading") return "策略运行中";
  if (state === "error") return "策略输出失败";
  if (signals.length) return `策略输出 ${signals.length} 条`;
  return "暂无策略输出";
}

function formatStrategyRunStatus(state: LoadState, canRequestStrategy: boolean, candleCount: number) {
  if (!canRequestStrategy) return "非管理员不请求后端策略";
  if (candleCount < MIN_STRATEGY_RUN_CANDLES) return `至少需要 ${MIN_STRATEGY_RUN_CANDLES} 根K线`;
  if (state === "loading") return "正在读取后端策略输出";
  if (state === "error") return "后端策略输出失败";
  if (state === "ready") return "以后端策略输出为准";
  return "等待后端策略输出";
}

function formatStrategyDiagnosticsSummary(diagnostics: StrategyDiagnostics | null, signals: StrategyRunSignal[]) {
  if (!diagnostics && !signals.length) return "等待后端策略运行结果；前端不会用K线质量参考生成替代信号。";
  const marketState = diagnostics?.market_state_text || "无市场状态";
  const riskStatus = diagnostics?.risk_status ? `，风险 ${diagnostics.risk_status}` : "";
  const activeEngine = diagnostics?.active_engine || signals[0]?.engine;
  return `后端策略诊断：${marketState}${riskStatus}${activeEngine ? `，引擎 ${formatStrategyEngine(activeEngine)}` : ""}。`;
}

function formatStrategyRunSignalTitle(signal: StrategyRunSignal) {
  return formatSignalText(signal.title, signal.side) || `${formatDirection(signal.side)}策略输出`;
}

function formatStrategyAction(action: string | null | undefined) {
  if (!action) return "新输出";
  return action
    .replace(/_/gu, " ")
    .replace(/\breduce long\b/iu, "降低多头")
    .replace(/\breduce short\b/iu, "降低空头")
    .replace(/\blong\b/iu, "做多")
    .replace(/\bshort\b/iu, "做空");
}

function formatReducePct(signal: StrategyRunSignal) {
  const raw = parseOptionalNumber(signal.reduce_pct ?? signal.reducePct);
  if (raw == null) return "";
  const pct = Math.abs(raw) <= 1 ? raw * 100 : raw;
  return `${pct.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function formatNullableText(value: string | number | null | undefined) {
  const clean = `${value ?? ""}`.trim();
  return clean || "--";
}

function formatCandleQualitySummary(candleQuality: KlineConfirmationResult) {
  if (candleQuality.state === "no-signal") return "K线质量参考仅展示行情结构；策略方向和动作以后端策略输出为准。";
  if (candleQuality.state === "watch-next") return `K线质量样本不足，当前已有 ${candleQuality.validCandleCount} 根。`;
  if (candleQuality.state === "invalidated") return `${formatDirection(candleQuality.direction)}方向的K线质量偏弱，仅供复核后端输出时参考。`;
  if (candleQuality.state === "confirmed") return `${formatDirection(candleQuality.direction)}方向的K线质量较好，评分 ${candleQuality.score}/100；这不是信号来源。`;
  return `${formatDirection(candleQuality.direction)}方向的K线质量需要观察，评分 ${candleQuality.score}/100；这不是信号来源。`;
}

function formatCandleQualityEvidenceLabel(item: KlineConfirmationResult["evidence"][number]) {
  if (item.key === "signal-presence") return "策略输出上下文";
  if (item.key === "trend-band") return "K线趋势带";
  if (item.key === "close-stability") return "收盘稳定性";
  if (item.key === "body-quality") return "K线实体质量";
  if (item.key === "wick-risk") return "反向影线风险";
  if (item.key === "atr-distance") return "ATR 距离";
  return "K线质量指标";
}

function formatEvidenceStatus(status: KlineConfirmationResult["evidence"][number]["status"]) {
  if (status === "pass") return "通过";
  if (status === "warn") return "观察";
  if (status === "fail") return "未通过";
  return "中性";
}

function formatCandleQualityEvidenceDetail(item: KlineConfirmationResult["evidence"][number]) {
  if (item.key === "signal-presence") return "暂无后端策略输出上下文，当前只显示K线质量参考。";
  if (item.key === "trend-band") return `近期有 ${formatEvidenceNumber(item.value)} 根K线收在参考趋势带的方向侧。`;
  if (item.key === "close-stability") return `最近2根中有 ${formatEvidenceNumber(item.value)} 根收盘守住后端输出价。`;
  if (item.key === "body-quality") return `实体占近期振幅约 ${formatEvidencePercent(item.value)}，用于观察K线质量。`;
  if (item.key === "wick-risk") return `反向影线占近期振幅约 ${formatEvidencePercent(item.value)}，用于观察拒绝风险。`;
  if (item.key === "atr-distance") return `最新收盘价距离后端输出价约 ${formatEvidenceNumber(item.value)} ATR。`;
  return "该指标仅用于K线质量参考。";
}

function formatEvidenceNumber(value: number) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}

function formatEvidencePercent(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function formatSignalTitle(signal: SelectedSignal) {
  return formatSignalText(signal.title, signal.direction) || `${normalizeLabSymbol(signal.symbol)} 策略信号`;
}

function formatSignalText(text: string | undefined, direction?: KlineDirection) {
  const clean = `${text ?? ""}`.trim();
  if (!clean) return "";
  return clean
    .replace(/\bLONG\s+confirmed\b/giu, "做多 · K线确认")
    .replace(/\bSHORT\s+confirmed\b/giu, "做空 · K线确认")
    .replace(/\bLONG\s+warning\b/giu, "做多 · 结构预警")
    .replace(/\bSHORT\s+warning\b/giu, "做空 · 结构预警")
    .replace(/\bLONG\s+invalidated\b/giu, "做多 · 结构失效")
    .replace(/\bSHORT\s+invalidated\b/giu, "做空 · 结构失效")
    .replace(/\bLONG\b/giu, "做多")
    .replace(/\bSHORT\b/giu, "做空")
    .replace(/\bFLAT\b/giu, "观望")
    .replace(/\bconfirmed\b/giu, "K线确认")
    .replace(/\bwarning\b/giu, "结构预警")
    .replace(/\binvalidated\b/giu, "结构失效")
    .replace(/\bwatch next candle\b/giu, "等待下一根K线")
    .replace(/\bstrategy inbox\b/giu, "策略信号箱")
    .replace(/\bsignal\b/giu, direction ? `${formatDirection(direction)}信号` : "策略信号");
}

function formatStrategyEngine(engine: string | undefined) {
  const clean = `${engine ?? ""}`.trim();
  if (!clean || /^Yansir Strategy$/iu.test(clean)) return "Yansir 策略";
  return clean;
}

function formatMarketSource(source: string) {
  const clean = source.trim();
  return clean || "--";
}

function formatDirection(direction?: KlineDirection) {
  if (direction === "long") return "做多";
  if (direction === "short") return "做空";
  return "观望";
}

function formatPrice(value: number) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatSignalTime(value: string | number | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
