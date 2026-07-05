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

export function KlineLabView({ currentUser, rows, navigate, showToast }: KlineLabViewProps) {
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

  const symbolOptions = useMemo(() => {
    const marketSymbols = rows.map((row) => normalizeLabSymbol(row.symbol)).filter(Boolean);
    return Array.from(new Set([symbol, ...DEFAULT_SYMBOLS, ...marketSymbols])).slice(0, 80);
  }, [rows, symbol]);

  const selectedSignal = useMemo(() => {
    return selectLatestSignal(symbol, timeframe, inboxSignals);
  }, [symbol, timeframe, inboxSignals]);

  const confirmation = useMemo(() => {
    return classifyKlineSignal({
      candles,
      signal: selectedSignal
        ? {
            direction: selectedSignal.direction,
            price: selectedSignal.price,
            time: selectedSignal.time,
            receivedAt: selectedSignal.receivedAt,
            timeframe: selectedSignal.timeframe,
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
          <span>Yansir 内部</span>
          <h1>K线验信室</h1>
        </div>
        <span className={`kline-confirmation-badge state-${confirmation.state}`}>{formatConfirmationLabel(confirmation)}</span>
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
              <span>{timeframe} · 180 根K线{marketSource ? ` · 数据源 ${formatMarketSource(marketSource)}` : ""}</span>
            </div>
            <span>{candleState === "loading" ? "读取K线中" : `${candles.length} 根K线`}</span>
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
        仅限管理员/内部使用。本页只复核既有策略信号，不改变信号来源，也不会从K线生成新信号。
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
          <strong>{formatConfirmationLabel(confirmation)}</strong>
          <span>{formatConfirmationState(confirmation.state)}</span>
        </div>
        <strong>{confirmation.score}/100</strong>
      </div>
      <p>{formatConfirmationSummary(confirmation)}</p>
      <ul className="kline-evidence-list">
        {confirmation.evidence.map((item) => (
          <li key={item.key} className={`status-${item.status}`}>
            <div>
              <strong>{formatEvidenceLabel(item)}</strong>
              <span>{formatEvidenceStatus(item.status)} · {item.score}/{item.weight}</span>
            </div>
            <p>{formatEvidenceDetail(item)}</p>
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

function formatConfirmationLabel(confirmation: KlineConfirmationResult) {
  if (confirmation.state === "no-signal") return "暂无策略";
  if (confirmation.state === "watch-next") return `${formatDirection(confirmation.direction)} · 等待K线`;
  if (confirmation.state === "invalidated") return `${formatDirection(confirmation.direction)} · 结构失效`;
  if (confirmation.state === "confirmed") return `${formatDirection(confirmation.direction)} · K线确认`;
  return `${formatDirection(confirmation.direction)} · 结构预警`;
}

function formatConfirmationState(state: KlineConfirmationResult["state"]) {
  if (state === "no-signal") return "暂无策略";
  if (state === "watch-next") return "等待K线";
  if (state === "confirmed") return "K线确认";
  if (state === "warning") return "结构预警";
  return "结构失效";
}

function formatConfirmationSummary(confirmation: KlineConfirmationResult) {
  if (confirmation.state === "no-signal") return "暂无可复核的做多或做空策略信号。";
  if (confirmation.state === "watch-next") return `等待更多有效K线，当前已有 ${confirmation.validCandleCount} 根。`;
  if (confirmation.state === "invalidated") return `${formatDirection(confirmation.direction)}结构未通过价格与趋势带检查。`;
  if (confirmation.state === "confirmed") return `${formatDirection(confirmation.direction)}结构已通过K线复核，评分 ${confirmation.score}/100。`;
  return `${formatDirection(confirmation.direction)}结构需要谨慎观察，K线评分 ${confirmation.score}/100。`;
}

function formatEvidenceLabel(item: KlineConfirmationResult["evidence"][number]) {
  if (item.key === "signal-presence") return "信号状态";
  if (item.key === "trend-band") return "趋势带";
  if (item.key === "close-stability") return "收盘稳定性";
  if (item.key === "body-quality") return "实体质量";
  if (item.key === "wick-risk") return "反向影线风险";
  if (item.key === "atr-distance") return "ATR 距离";
  return "验信指标";
}

function formatEvidenceStatus(status: KlineConfirmationResult["evidence"][number]["status"]) {
  if (status === "pass") return "通过";
  if (status === "warn") return "观察";
  if (status === "fail") return "未通过";
  return "中性";
}

function formatEvidenceDetail(item: KlineConfirmationResult["evidence"][number]) {
  if (item.key === "signal-presence") return "当前没有可复核的做多或做空策略信号。";
  if (item.key === "trend-band") return `近期有 ${formatEvidenceNumber(item.value)} 根K线收在 EMA 趋势带的信号侧。`;
  if (item.key === "close-stability") return `最近2根中有 ${formatEvidenceNumber(item.value)} 根收盘守住信号价。`;
  if (item.key === "body-quality") return `实体占近期振幅约 ${formatEvidencePercent(item.value)}，用于评估方向质量。`;
  if (item.key === "wick-risk") return `反向影线占近期振幅约 ${formatEvidencePercent(item.value)}，用于评估拒绝风险。`;
  if (item.key === "atr-distance") return `最新收盘价距离信号价约 ${formatEvidenceNumber(item.value)} ATR。`;
  return "该指标已纳入当前K线评分。";
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
