import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SystemIcon } from "../../components/SystemIcon";
import { toTrackRecordRow, type TrackRecordRow } from "./publicPerformance";
import { getPublicPerformanceSummary, getPublicSignals, type PublicPerformanceSummary, type PublicSignalsResponse } from "./publicPortalApi";
import { normalizePublicTrackRecordSymbol, publicTrackRecordFilterKey } from "./publicPortalRuntime";

const TRACK_RECORD_CACHE_KEY = "yansir.public-track-record.v1";

type TrackRecordLoadState =
  | { kind: "loading" }
  | { kind: "ready"; summary: PublicPerformanceSummary; rows: TrackRecordRow[]; staleAt: string | null; pagination: PublicSignalsResponse["pagination"] }
  | { kind: "empty"; summary: PublicPerformanceSummary }
  | { kind: "unavailable"; message: string; cached: TrackRecordRow[]; staleAt: string | null };

type CachedTrackRecord = {
  summary: PublicPerformanceSummary;
  rows: TrackRecordRow[];
  staleAt: string;
  delayHours: number;
  historyDays: number;
  pagination: PublicSignalsResponse["pagination"];
};

const emptyPagination = { page: 1, limit: 80, total: 0, hasMore: false, nextPage: null };

function initialFilters() {
  const params = new URLSearchParams(window.location.search);
  const symbol = normalizePublicTrackRecordSymbol(params.get("symbol") || "");
  const requestedDirection = params.get("direction");
  const direction = requestedDirection === "long" || requestedDirection === "short" ? requestedDirection : "all";
  return { symbol, direction } as const;
}

function cacheStorageKey(filterKey: string) {
  return `${TRACK_RECORD_CACHE_KEY}.${encodeURIComponent(filterKey)}`;
}

function readCache(filterKey: string): CachedTrackRecord | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(cacheStorageKey(filterKey)) || "null") as CachedTrackRecord | null;
    return parsed?.summary && Array.isArray(parsed.rows) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(filterKey: string, value: CachedTrackRecord) {
  try {
    window.sessionStorage.setItem(cacheStorageKey(filterKey), JSON.stringify(value));
  } catch {
    // A blocked storage API must not turn a successful public response into an error state.
  }
}

function formatMetric(value: number | null, percent = true) {
  if (value === null || !Number.isFinite(value)) return "计算中";
  return percent ? `${(value * 100).toFixed(1)}%` : String(value);
}

function formatTime(value: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function PublicTrackRecordView({ onUnlock }: { onUnlock?: (filters: { symbol: string; direction: string }) => void }) {
  const initial = useRef(initialFilters());
  const initialFilterKey = publicTrackRecordFilterKey(initial.current);
  const initialCache = useRef<CachedTrackRecord | null>(readCache(initialFilterKey));
  const [state, setState] = useState<TrackRecordLoadState>(() => {
    const cached = initialCache.current;
    return cached ? { kind: "ready", summary: cached.summary, rows: cached.rows, staleAt: cached.staleAt, pagination: cached.pagination || emptyPagination } : { kind: "loading" };
  });
  const [symbolDraft, setSymbolDraft] = useState(initial.current.symbol);
  const [symbol, setSymbol] = useState(initial.current.symbol);
  const [direction, setDirection] = useState<"all" | "long" | "short">(initial.current.direction);
  const filterKey = publicTrackRecordFilterKey({ symbol, direction });
  const [loadedFilterKey, setLoadedFilterKey] = useState(initialFilterKey);
  const [delayHours, setDelayHours] = useState<number | null>(initialCache.current?.delayHours ?? null);
  const [historyDays, setHistoryDays] = useState<number | null>(initialCache.current?.historyDays ?? null);
  const requestId = useRef(0);

  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (page = 1) => {
    const activeRequest = ++requestId.current;
    const cached = readCache(filterKey);
    setLoadedFilterKey(filterKey);
    if (page === 1) {
      setState(cached ? { kind: "ready", summary: cached.summary, rows: cached.rows, staleAt: cached.staleAt, pagination: cached.pagination || emptyPagination } : { kind: "loading" });
    } else {
      setLoadingMore(true);
    }
    try {
      const query = {
        page,
        limit: 80,
        symbol: symbol || undefined,
        direction: direction === "all" ? undefined : direction
      };
      const [signals, summary] = await Promise.all([getPublicSignals(query), getPublicPerformanceSummary()]);
      if (activeRequest !== requestId.current) return;
      const pageRows = signals.signals.map(toTrackRecordRow);
      const currentRows = page === 1 ? [] : state.kind === "ready" ? state.rows : cached?.rows || [];
      const rows = [...currentRows, ...pageRows.filter((row) => !currentRows.some((item) => item.id === row.id))];
      const staleAt = new Date().toISOString();
      const nextCache: CachedTrackRecord = {
        summary,
        rows,
        staleAt,
        delayHours: signals.delayHours,
        historyDays: signals.historyDays,
        pagination: signals.pagination
      };
      writeCache(filterKey, nextCache);
      setDelayHours(signals.delayHours);
      setHistoryDays(signals.historyDays);
      setState(rows.length ? { kind: "ready", summary, rows, staleAt, pagination: signals.pagination } : { kind: "empty", summary });
    } catch (error) {
      if (activeRequest !== requestId.current) return;
      const fallback = readCache(filterKey);
      setState({
        kind: "unavailable",
        message: error instanceof Error ? error.message : "公开战绩暂时不可用",
        cached: fallback?.rows || [],
        staleAt: fallback?.staleAt || null
      });
    } finally {
      if (activeRequest === requestId.current) setLoadingMore(false);
    }
  }, [direction, filterKey, state, symbol]);

  useEffect(() => {
    void load(1);
    // state changes after a response must not restart page one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function submitSymbol(event: FormEvent) {
    event.preventDefault();
    setSymbol(normalizePublicTrackRecordSymbol(symbolDraft));
  }

  const displayState: TrackRecordLoadState = loadedFilterKey === filterKey ? state : { kind: "loading" };
  const summary = displayState.kind === "ready" || displayState.kind === "empty" ? displayState.summary : readCache(filterKey)?.summary;
  const rows = displayState.kind === "ready" ? displayState.rows : displayState.kind === "unavailable" ? displayState.cached : [];
  const pagination = displayState.kind === "ready" ? displayState.pagination : emptyPagination;

  return (
    <section className="view active-view public-track-record-view" aria-labelledby="track-record-title">
      <header className="track-record-hero">
        <div>
          <span className="portal-eyebrow">可验证的公开记录</span>
          <h1 id="track-record-title">历史战绩</h1>
          <p>按 fixed-window-v1 固定窗口复盘策略引擎生成的真实信号。AI Claw 只负责解释与复核，不生成战绩。</p>
        </div>
        <aside aria-label="公开数据范围">
          <span><SystemIcon name="clock" />{delayHours === null ? "服务端延迟校验中" : `服务端延迟 ${delayHours} 小时`}</span>
          <span><SystemIcon name="database" />{historyDays === null ? "历史范围读取中" : `公开历史 ${historyDays} 天`}</span>
          <span><SystemIcon name="shield" />15m / 1h 可见</span>
        </aside>
      </header>

      {summary && (
        <section className="track-summary-grid" aria-label="战绩摘要">
          <article><span>公开信号</span><strong>{summary.totalSignals}</strong><small>{summary.windowDays} 天固定窗口</small></article>
          <article><span>24h 已完成</span><strong>{summary.completed24hCount}</strong><small>仅统计已到期样本</small></article>
          <article><span>24h 待完成</span><strong>{summary.pending24hCount}</strong><small>不会提前推断结果</small></article>
          <article><span>1h 方向命中率</span><strong>{formatMetric(summary.directionalHitRate1h)}</strong><small>样本口径：fixed-window-v1</small></article>
          <article><span>1h 平均方向收益</span><strong>{formatMetric(summary.averageDirectionalReturn1h)}</strong><small>多空按方向统一计算</small></article>
        </section>
      )}

      <section className="track-filter-card track-record-filter" aria-label="战绩筛选">
        <form onSubmit={submitSymbol}>
          <label><span>币种</span><input value={symbolDraft} onChange={(event) => setSymbolDraft(event.target.value)} placeholder="BTC / ETH / SOL" /></label>
          <button type="submit">筛选</button>
        </form>
        <div role="group" aria-label="方向筛选">
          {(["all", "long", "short"] as const).map((item) => (
            <button className={direction === item ? "active" : ""} key={item} type="button" onClick={() => setDirection(item)}>
              {item === "all" ? "全部方向" : item === "long" ? "看多" : "看空"}
            </button>
          ))}
        </div>
      </section>

      {displayState.kind === "loading" && <div className="portal-empty-state" role="status" aria-live="polite" aria-atomic="true"><SystemIcon name="clock" /><div><strong>正在加载公开战绩</strong><p>正在读取服务端确认已满足延迟条件的真实信号。</p></div></div>}
      {displayState.kind === "empty" && <div className="portal-empty-state" role="status" aria-live="polite" aria-atomic="true"><SystemIcon name="target" /><div><strong>当前筛选暂无记录</strong><p>可清空币种或切换方向后重试；系统不会补造信号。</p></div></div>}
      {displayState.kind === "unavailable" && (
        <div className={`track-unavailable ${displayState.cached.length ? "stale" : ""}`} role="alert">
          <div><strong>{displayState.cached.length ? "数据已过期" : "公开战绩暂时不可用"}</strong><p>{displayState.cached.length ? `最后成功更新时间 ${formatTime(displayState.staleAt)}` : displayState.message}</p></div>
          <button className="portal-retry-button" type="button" onClick={() => void load()}>重新加载</button>
        </div>
      )}

      {rows.length > 0 && (
        <section className="track-table-card" aria-label="公开战绩明细">
          <div className="track-table-scroll">
            <table>
              <thead><tr><th>信号</th><th>方向 / 分数</th><th>状态</th><th>15m</th><th>1h</th><th>4h</th><th>24h</th><th>MFE</th><th>MAE</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.symbol}</strong><small>{formatTime(row.time)}</small></td>
                  <td><span className={`track-direction ${row.direction}`}>{row.direction === "long" ? "看多" : "看空"}</span><small>{row.score} 分</small></td>
                  <td>{row.completionStatus === "completed" ? "已完成" : "待完成"}</td>
                  <td>{row.return15m}</td><td>{row.return1h}</td>
                  <td className="track-locked">会员解锁</td><td className="track-locked">会员解锁</td>
                  <td className="track-locked">会员解锁</td><td className="track-locked">会员解锁</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pagination.hasMore && pagination.nextPage && (
            <button className="portal-retry-button" type="button" disabled={loadingMore} onClick={() => void load(pagination.nextPage || 1)}>
              {loadingMore ? "加载中…" : "加载更多"}
            </button>
          )}
        </section>
      )}

      <section className="track-methodology">
        <div><SystemIcon name="target" /><span><strong>固定窗口，不挑样本</strong><small>每条信号按 15m、1h、4h、24h 到期时间统一复盘。</small></span></div>
        <div><SystemIcon name="shield" /><span><strong>公开字段严格锁定</strong><small>匿名用户仅查看 15m / 1h；4h、24h、MFE、MAE 显示会员解锁。</small></span></div>
        <div><SystemIcon name="database" /><span><strong>结果来自策略记录</strong><small>延迟和历史范围由 API 返回，不以客户端计时替代服务端约束。</small></span></div>
      </section>
      {onUnlock && <button className="portal-primary-action" type="button" onClick={() => onUnlock({ symbol, direction })}>升级解锁完整战绩</button>}
    </section>
  );
}
