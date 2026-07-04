import { useEffect, useMemo, useState } from "react";
import type { ViewName } from "../../components/BottomNav";
import { apiGet } from "../../lib/api";
import {
  classifyKlineSignal,
  normalizeLabSymbol,
  normalizeLabTimeframe
} from "./klineConfirmation";
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

type CachedSignalLike = {
  id?: string;
  symbol: string;
  timeframe?: string;
  direction?: KlineDirection;
  price?: string | number;
  score?: number;
  title?: string;
  reason?: string;
  time?: string | number;
  receivedAt?: string | number;
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
  source: "strategy" | "cache";
  id?: string;
  symbol: string;
  timeframe?: string;
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
  signals: CachedSignalLike[];
  navigate: (nextView: ViewName) => void;
  showToast: (message: string) => void;
};

type MarketKlinesResponse = {
  source?: string;
  candles?: Array<Partial<KlineCandle>>;
};

type StrategySignalListResponse = {
  signals?: StrategyInboxSignal[];
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
const CHART_WIDTH = 720;
const CHART_HEIGHT = 320;
const CHART_PAD = { top: 18, right: 24, bottom: 26, left: 54 };

export function KlineLabView({ currentUser, rows, signals, navigate, showToast }: KlineLabViewProps) {
  const [symbol, setSymbol] = useState(() => readInitialSymbol());
  const [timeframe, setTimeframe] = useState<LabTimeframe>(() => readInitialTimeframe());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [candles, setCandles] = useState<KlineCandle[]>([]);
  const [marketSource, setMarketSource] = useState("");
  const [candleState, setCandleState] = useState<LoadState>("idle");
  const [candleError, setCandleError] = useState("");
  const [inboxSignals, setInboxSignals] = useState<StrategyInboxSignal[]>([]);
  const [signalState, setSignalState] = useState<LoadState>("idle");
  const [signalError, setSignalError] = useState("");
  const canRequestInbox = Boolean(currentUser.id && currentUser.role === "admin");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "kline-lab");
    params.set("symbol", symbol);
    params.set("tf", timeframe);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }, [symbol, timeframe]);

  useEffect(() => {
    let alive = true;
    setCandleState("loading");
    setCandleError("");
    apiGet<MarketKlinesResponse>(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=180`)
      .then((response) => {
        if (!alive) return;
        setCandles(normalizeCandles(response.candles || []));
        setMarketSource(response.source || "");
        setCandleState("ready");
      })
      .catch((error) => {
        if (!alive) return;
        setCandles([]);
        setMarketSource("");
        setCandleError(error instanceof Error ? error.message : "K线读取失败");
        setCandleState("error");
      });
    return () => {
      alive = false;
    };
  }, [symbol, timeframe, refreshNonce]);

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
    apiGet<StrategySignalListResponse>(`/api/strategy/inbox?mode=all&limit=20&page=1&symbol=${encodeURIComponent(symbol)}`)
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
  }, [canRequestInbox, symbol, refreshNonce]);

  const symbolOptions = useMemo(() => {
    const marketSymbols = rows.map((row) => normalizeLabSymbol(row.symbol)).filter(Boolean);
    return Array.from(new Set([symbol, ...DEFAULT_SYMBOLS, ...marketSymbols])).slice(0, 80);
  }, [rows, symbol]);

  const selectedSignal = useMemo(() => {
    return selectLatestSignal(symbol, timeframe, inboxSignals, signals);
  }, [symbol, timeframe, inboxSignals, signals]);

  const confirmation = useMemo(() => {
    return classifyKlineSignal({
      candles,
      signal: selectedSignal
        ? {
            direction: selectedSignal.direction,
            price: selectedSignal.price,
            time: selectedSignal.time,
            receivedAt: selectedSignal.receivedAt,
            timeframe: selectedSignal.timeframe || timeframe,
            symbol: selectedSignal.symbol
          }
        : null
    });
  }, [candles, selectedSignal, timeframe]);

  function handleRefresh() {
    setRefreshNonce((current) => current + 1);
    showToast("K线验信室正在刷新");
  }

  return (
    <section className="view active-view kline-lab-view" aria-label="K线验信室">
      <header className="kline-lab-header">
        <button className="kline-lab-back" type="button" onClick={() => navigate("radar")} aria-label="返回">
          返回
        </button>
        <div className="kline-lab-title">
          <span>Yansir Internal</span>
          <h1>K线验信室</h1>
        </div>
        <span className={`kline-confirmation-badge state-${confirmation.state}`}>{confirmation.label}</span>
      </header>

      <section className="kline-lab-toolbar" aria-label="K线验信控制台">
        <label className="kline-symbol-select">
          <span>Symbol</span>
          <select value={symbol} onChange={(event) => setSymbol(normalizeLabSymbol(event.target.value))}>
            {symbolOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="kline-timeframe-tabs" role="group" aria-label="Timeframe">
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
          Refresh
        </button>
      </section>

      <section className="kline-lab-grid">
        <article className="kline-chart-panel" aria-label={`${symbol} ${timeframe} K线图`}>
          <div className="kline-panel-head">
            <div>
              <strong>{symbol} / USDT</strong>
              <span>{timeframe} · limit 180{marketSource ? ` · ${marketSource}` : ""}</span>
            </div>
            <span>{candleState === "loading" ? "读取K线中" : `${candles.length} candles`}</span>
          </div>
          {candleError && <p className="kline-lab-error">{candleError}</p>}
          <KlineChart candles={candles} bands={confirmation.bands} />
        </article>

        <EvidenceCard confirmation={confirmation} />
      </section>

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
        Admin-only/internal. 本页只复核既有策略信号，不改变信号来源，也不会从K线生成新信号。
      </footer>
    </section>
  );
}

function KlineChart({ candles, bands }: { candles: KlineCandle[]; bands: KlineBandPoint[] }) {
  const visibleCandles = candles.slice(-90);
  const visibleBands = bands.slice(-visibleCandles.length);
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

function EvidenceCard({ confirmation }: { confirmation: KlineConfirmationResult }) {
  return (
    <article className="kline-evidence-card" aria-label="K线验信证据">
      <div className="kline-panel-head">
        <div>
          <strong>{confirmation.label}</strong>
          <span>{confirmation.state}</span>
        </div>
        <strong>{confirmation.score}/100</strong>
      </div>
      <p>{confirmation.summary}</p>
      <ul className="kline-evidence-list">
        {confirmation.evidence.map((item) => (
          <li key={item.key} className={`status-${item.status}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.status} · {item.score}/{item.weight}</span>
            </div>
            <p>{item.detail}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

function StrategySignalPanel({ signal, status, error, canRequestInbox }: { signal: SelectedSignal | null; status: LoadState; error: string; canRequestInbox: boolean }) {
  if (!signal) {
    return (
      <section className="kline-strategy-panel empty" aria-label="策略信号">
        <strong>策略信号</strong>
        <p>暂无策略命中，当前页面不从K线生成新信号。</p>
        {!canRequestInbox && <small>Guest/non-admin will not request strategy inbox.</small>}
        {error && <small>{error}</small>}
      </section>
    );
  }

  return (
    <section className="kline-strategy-panel" aria-label="策略信号">
      <div className="kline-panel-head">
        <div>
          <strong>{signal.title}</strong>
          <span>{signal.source === "strategy" ? "Strategy inbox" : "Cached signal"} · {signal.timeframe || "tf unknown"}</span>
        </div>
        <strong>{formatDirection(signal.direction)} · {signal.score ?? "--"}</strong>
      </div>
      <dl>
        <div>
          <dt>Symbol</dt>
          <dd>{normalizeLabSymbol(signal.symbol)}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{signal.price == null ? "--" : formatPrice(signal.price)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatSignalTime(signal.receivedAt || signal.time)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status === "loading" ? "刷新中" : signal.engine || "Yansir Strategy"}</dd>
        </div>
      </dl>
      <p>{signal.reason || "策略命中无附加说明。"}</p>
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

function selectLatestSignal(symbol: string, timeframe: LabTimeframe, inbox: StrategyInboxSignal[], cached: CachedSignalLike[]): SelectedSignal | null {
  const exactInbox = latestByTime(inbox.filter((item) => normalizeLabSymbol(item.symbol) === symbol && normalizeLabTimeframe(item.timeframe) === timeframe && actionable(item.direction)));
  if (exactInbox) return fromInbox(exactInbox);

  const symbolInbox = latestByTime(inbox.filter((item) => normalizeLabSymbol(item.symbol) === symbol && actionable(item.direction)));
  if (symbolInbox) return fromInbox(symbolInbox);

  const exactCached = latestByTime(cached.filter((item) => normalizeLabSymbol(item.symbol) === symbol && item.timeframe && normalizeLabTimeframe(item.timeframe) === timeframe && actionable(item.direction)));
  if (exactCached) return fromCached(exactCached, timeframe);

  const symbolCached = latestByTime(cached.filter((item) => normalizeLabSymbol(item.symbol) === symbol && actionable(item.direction)));
  return symbolCached ? fromCached(symbolCached, timeframe) : null;
}

function fromInbox(signal: StrategyInboxSignal): SelectedSignal {
  return {
    source: "strategy",
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

function fromCached(signal: CachedSignalLike, fallbackTimeframe: LabTimeframe): SelectedSignal {
  return {
    source: "cache",
    id: signal.id,
    symbol: signal.symbol,
    timeframe: signal.timeframe || fallbackTimeframe,
    direction: signal.direction,
    price: parseNumber(signal.price),
    score: signal.score,
    title: signal.title || `${normalizeLabSymbol(signal.symbol)} cached signal`,
    reason: signal.reason || "",
    time: signal.time,
    receivedAt: signal.receivedAt
  };
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

function buildBandPath(bands: KlineBandPoint[], scale: ChartScale, key: "upper" | "mid" | "lower") {
  const points = bands
    .map((point, index) => ({ x: scale.xAt(index), y: scale.yAt(point[key]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return points.map((point, index) => `${index ? "L" : "M"} ${roundSvg(point.x)} ${roundSvg(point.y)}`).join(" ");
}

function roundSvg(value: number) {
  return Math.round(value * 10) / 10;
}

function formatDirection(direction?: KlineDirection) {
  if (direction === "long") return "LONG";
  if (direction === "short") return "SHORT";
  return "FLAT";
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
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
