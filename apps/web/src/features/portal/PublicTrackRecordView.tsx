import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SystemIcon } from "../../components/SystemIcon";
import { describeTrackRecordEmptyState, toTrackRecordRow, type TrackRecordRow } from "./publicPerformance";
import { getPublicPerformanceSummary, getPublicSignals, type PublicPerformanceSummary, type PublicSignalsResponse } from "./publicPortalApi";
import { normalizePublicTrackRecordSymbol, publicTrackRecordFilterKey } from "./publicPortalRuntime";
import { MethodologyDisclosure, TrackRecordFilters, TrackRecordHero, TrackRecordList, TrustSummary, TrustSummaryLoading } from "./TrackRecordPresentation";

const TRACK_RECORD_CACHE_KEY = "yansir.public-track-record.v1";

type TrackRecordLoadState =
  | { kind: "loading" }
  | { kind: "ready"; summary: PublicPerformanceSummary; rows: TrackRecordRow[]; staleAt: string | null; pagination: PublicSignalsResponse["pagination"] }
  | { kind: "empty"; summary: PublicPerformanceSummary }
  | { kind: "unavailable"; message: string; cached: TrackRecordRow[]; staleAt: string | null; hasCachedSnapshot: boolean };

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
        staleAt: fallback?.staleAt || null,
        hasCachedSnapshot: Boolean(fallback)
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
      <TrackRecordHero delayHours={delayHours} historyDays={historyDays} />
      {summary ? <TrustSummary summary={summary} /> : displayState.kind === "loading" ? <TrustSummaryLoading /> : null}
      <TrackRecordFilters
        symbolDraft={symbolDraft}
        direction={direction}
        onSymbolDraftChange={setSymbolDraft}
        onSubmit={submitSymbol}
        onDirectionChange={setDirection}
      />

      {displayState.kind === "loading" && (
        <div className="portal-empty-state" role="status" aria-live="polite" aria-atomic="true">
          <SystemIcon name="clock" /><div><strong>正在加载公开战绩</strong><p>正在读取满足服务端公开条件的真实信号。</p></div>
        </div>
      )}
      {displayState.kind === "empty" && (
        <div className="portal-empty-state" role="status" aria-live="polite" aria-atomic="true">
          <SystemIcon name="target" /><div><strong>暂无满足公开条件的样本</strong><p>{describeTrackRecordEmptyState({ symbol, direction, delayHours, historyDays })}</p></div>
        </div>
      )}
      {displayState.kind === "unavailable" && (
        <div className={`track-unavailable ${displayState.hasCachedSnapshot ? "stale" : ""}`} role="alert">
          <div><strong>{displayState.hasCachedSnapshot ? "数据已过期" : "公开战绩暂时不可用"}</strong><p>{displayState.hasCachedSnapshot ? `最后成功更新时间 ${formatTime(displayState.staleAt)}` : displayState.message}</p></div>
          <button className="portal-retry-button" type="button" onClick={() => void load()}>重新加载</button>
        </div>
      )}

      {rows.length > 0 && (
        <TrackRecordList
          rows={rows}
          hasMore={Boolean(pagination.hasMore && pagination.nextPage)}
          loadingMore={loadingMore}
          onLoadMore={() => void load(pagination.nextPage || 1)}
        />
      )}

      <MethodologyDisclosure />
      {onUnlock && <button className="portal-primary-action track-record-unlock" type="button" onClick={() => onUnlock({ symbol, direction })}>升级解锁完整战绩</button>}
    </section>
  );
}
