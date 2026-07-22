import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSignal, LiveSignalFilter, StrategyListeningStatus } from "./liveSignalModel";
import { filterLiveSignals, formatDirectionLabel, sortLiveSignals } from "./liveSignalModel";

type LiveSignalCommandProps = {
  signals: LiveSignal[];
  selectedSignalId?: string;
  activeFilter: LiveSignalFilter;
  listeningStatus: StrategyListeningStatus;
  emptyState: LiveSignalEmptyState;
  now?: number;
  onFilterChange: (filter: LiveSignalFilter) => void;
  onSelectSignal: (signalId?: string) => void;
  onOpenDetail: (symbol: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

type LiveSignalEmptyState = {
  title: string;
  description: string;
  meta: string[];
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

type RealtimeSignalQueueProps = {
  signals: LiveSignal[];
  selectedSignalId?: string;
  emptyState: LiveSignalEmptyState;
  totalSignalCount: number;
  onSelectSignal: (signalId?: string) => void;
  onOpenDetail: (symbol: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

type SelectedSignalPanelProps = {
  className?: string;
  signal?: LiveSignal;
  onCollapse: () => void;
  onOpenDetail: (symbol: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

const LIVE_SIGNAL_LIST_INITIAL_LIMIT = 30;
const LIVE_SIGNAL_LIST_PAGE_SIZE = 30;

export function LiveSignalCommand({
  signals,
  selectedSignalId,
  activeFilter,
  emptyState,
  onSelectSignal,
  onOpenDetail,
  onOpenValueClaw,
  onToggleWatch,
}: LiveSignalCommandProps) {
  const listRef = useRef<HTMLElement | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(LIVE_SIGNAL_LIST_INITIAL_LIMIT);
  const sortedSignals = useMemo(() => sortLiveSignals(signals), [signals]);
  const visibleSignals = useMemo(() => filterLiveSignals(sortedSignals, activeFilter), [activeFilter, sortedSignals]);
  const listIdentity = `${activeFilter}:${visibleSignals.length}:${visibleSignals[0]?.id ?? ""}:${visibleSignals[visibleSignals.length - 1]?.id ?? ""}`;
  const renderedSignals = visibleSignals.slice(0, visibleLimit);
  const hasMoreSignals = renderedSignals.length < visibleSignals.length;
  const selectedSignal = useMemo(
    () =>
      selectedSignalId
        ? visibleSignals.find((signal) => signal.id === selectedSignalId) ??
          signals.find((signal) => signal.id === selectedSignalId)
        : undefined,
    [selectedSignalId, signals, visibleSignals],
  );

  useEffect(() => {
    setVisibleLimit(LIVE_SIGNAL_LIST_INITIAL_LIMIT);
  }, [listIdentity]);

  useEffect(() => {
    if (!hasMoreSignals) return;

    let ticking = false;
    const maybeLoadMore = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const target = listRef.current;
        if (!target) return;
        if (target.getBoundingClientRect().bottom <= window.innerHeight + 640) {
          setVisibleLimit((count) => Math.min(count + LIVE_SIGNAL_LIST_PAGE_SIZE, visibleSignals.length));
        }
      });
    };

    maybeLoadMore();
    window.addEventListener("scroll", maybeLoadMore, { passive: true });
    window.addEventListener("resize", maybeLoadMore);

    return () => {
      window.removeEventListener("scroll", maybeLoadMore);
      window.removeEventListener("resize", maybeLoadMore);
    };
  }, [hasMoreSignals, visibleSignals.length]);

  return (
    <section ref={listRef} className="live-command" aria-label="信号列表">
      <div className="live-command__body">
        <RealtimeSignalQueue
          signals={renderedSignals}
          selectedSignalId={selectedSignal?.id}
          emptyState={emptyState}
          totalSignalCount={visibleSignals.length}
          onSelectSignal={onSelectSignal}
          onOpenDetail={onOpenDetail}
          onOpenValueClaw={onOpenValueClaw}
          onToggleWatch={onToggleWatch}
        />
      </div>
    </section>
  );
}

function RealtimeSignalQueue({
  signals,
  selectedSignalId,
  emptyState,
  totalSignalCount,
  onSelectSignal,
  onOpenDetail,
  onOpenValueClaw,
  onToggleWatch,
}: RealtimeSignalQueueProps) {
  if (!signals.length) {
    return (
      <section className="live-command__queue live-command__empty" aria-label="实时信号队列" aria-live="polite">
        <strong>{emptyState.title}</strong>
        <span>{emptyState.description}</span>
        <ul>
          {emptyState.meta.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {(emptyState.primaryAction || emptyState.secondaryAction) && (
          <div className="live-command__empty-actions">
            {emptyState.primaryAction && (
              <button type="button" onClick={emptyState.primaryAction.onClick}>
                {emptyState.primaryAction.label}
              </button>
            )}
            {emptyState.secondaryAction && (
              <button type="button" onClick={emptyState.secondaryAction.onClick}>
                {emptyState.secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="live-command__queue" aria-label="实时信号队列">
      {signals.map((signal) => {
        const selected = signal.id === selectedSignalId;

        return (
          <Fragment key={signal.id}>
            <button
              type="button"
              className={`live-command__row is-${signal.tone} ${selected ? "is-active" : ""}`.trim()}
              aria-expanded={selected}
              onClick={() => onSelectSignal(resolveNextSelectedSignalId(selectedSignalId, signal.id))}
            >
              <time>{formatClock(signal.generatedAt)}</time>
              <span className="radar-signal-row__pair">{signal.symbol}</span>
              <span className="radar-signal-row__timeframe">{signal.timeframe || "--"}</span>
              <span className="radar-signal-row__direction">{formatDirectionLabel(signal.direction)}</span>
              <span className="radar-signal-row__score">{isWaitingStrategySignal(signal) ? "--" : signal.score}</span>
              <span className="radar-signal-row__price">{formatTriggerPrice(signal)}</span>
            </button>
            {selected && (
              <SelectedSignalPanel
                className="live-command__row-detail"
                signal={signal}
                onCollapse={() => onSelectSignal(undefined)}
                onOpenDetail={onOpenDetail}
                onOpenValueClaw={onOpenValueClaw}
                onToggleWatch={onToggleWatch}
              />
            )}
          </Fragment>
        );
      })}
      <div className="live-command__load-state" aria-live="polite">
        {signals.length < totalSignalCount
          ? `继续下滑加载更多 · 已显示 ${signals.length}/${totalSignalCount}`
          : `已显示全部 ${signals.length} 条信号`}
      </div>
    </section>
  );
}

export function resolveNextSelectedSignalId(selectedSignalId: string | undefined, clickedSignalId: string): string | undefined {
  return selectedSignalId === clickedSignalId ? undefined : clickedSignalId;
}

function SelectedSignalPanel({
  className,
  signal,
  onCollapse,
  onOpenDetail,
  onOpenValueClaw,
  onToggleWatch,
}: SelectedSignalPanelProps) {
  if (!signal) {
    return (
      <aside className={`live-command__selected live-command__selected-empty ${className ?? ""}`.trim()} aria-label="已选策略信号">
        <strong>尚未选择信号</strong>
        <span>等待策略信号</span>
      </aside>
    );
  }

  if (signal.source === "market") {
    return (
      <aside className={`live-command__selected live-command__selected-market ${className ?? ""}`.trim()} aria-label="市场异动详情">
        <div className="live-command__selected-head">
          <strong>市场异动详情</strong>
          <button className="live-command__collapse" type="button" onClick={onCollapse}>
            收起
          </button>
        </div>

        <div className="live-command__note">
          <span>触发原因</span>
          <p>{signal.trigger}</p>
        </div>
        <div className="live-command__note">
          <span>市场事实</span>
          <p>24H {formatMarketChange(signal)} · {formatMarketActivity(signal)}</p>
        </div>

        <div className="live-command__actions">
          <button type="button" className="market-primary" onClick={() => onOpenDetail(signal.symbol)}>
            币种详情
          </button>
          <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
            AIClaw 复核
          </button>
          <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
            加入观察
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`live-command__selected live-command__selected-strategy ${className ?? ""}`.trim()} aria-label="策略信号详情">
      <div className="live-command__selected-head">
        <strong>策略信号详情</strong>
        <button className="live-command__collapse" type="button" onClick={onCollapse}>
          收起
        </button>
      </div>

      <div className="live-command__note">
        <span>触发原因</span>
        <p>{signal.trigger}</p>
      </div>
      {isWaitingStrategySignal(signal) && (
        <div className="live-command__note">
          <span>历史关系</span>
          <p>{formatHistoricalHitSummary(signal)}</p>
        </div>
      )}
      <div className="live-command__note">
        <span>{signal.tone === "risk" ? "风险事实" : "策略事实"}</span>
        <p>{signal.tone === "risk" ? signal.risk : `${signal.strategyName} · ${formatStrategyScore(signal)}`}</p>
      </div>

      <div className="live-command__actions">
        <button type="button" onClick={() => onOpenDetail(signal.symbol)}>
          币种详情
        </button>
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          AIClaw 复核
        </button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
          加入观察
        </button>
      </div>
    </aside>
  );
}

function isWaitingStrategySignal(signal: LiveSignal) {
  return signal.source === "strategy" && signal.status === "no-signal";
}

function formatStrategyScore(signal: LiveSignal) {
  return isWaitingStrategySignal(signal) ? "--" : `${signal.score}/100`;
}

function formatClock(generatedAt: string) {
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return "--:--";
  return new Date(timestamp).toISOString().slice(11, 16);
}

function formatTriggerPrice(signal: LiveSignal) {
  const value = signal.triggerPrice;
  if (value === undefined || value === null || value === "") return "--";
  return String(value);
}

function formatHistoricalHitSummary(signal: LiveSignal) {
  const count = signal.payload?.historicalHitCount ?? 0;
  if (!count) {
    return "这只代表当前自选/筛选下暂未触发新信号；历史命中请切换“全部历史”或按币种筛选查看。";
  }

  const latestParts = [
    signal.payload?.latestHistoricalTimeframe,
    signal.payload?.latestHistoricalDirection === "short"
      ? "看空"
      : signal.payload?.latestHistoricalDirection === "long"
        ? "看多"
        : "",
    Number.isFinite(signal.payload?.latestHistoricalScore) ? `${signal.payload?.latestHistoricalScore}分` : "",
  ].filter(Boolean);
  const latestAt = formatHistoricalHitTime(signal.payload?.latestHistoricalHitAt);
  const latestText = latestParts.length ? `，最近一次 ${latestParts.join(" / ")}${latestAt ? ` · ${latestAt}` : ""}` : "";
  return `该币历史命中过 ${count} 次${latestText}；当前行只表示本轮暂未触发新的 Yansir 策略信号。`;
}

function formatHistoricalHitTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatMarketChange(signal: LiveSignal) {
  const rawChange = signal.change24h;
  if (rawChange === undefined || rawChange === null || rawChange === "") return "--";
  const text = String(rawChange);
  const value = parseChange(text);
  if (!Number.isFinite(value)) return text;
  if (text.trim().startsWith("+") || text.trim().startsWith("-")) return text;
  return `${value > 0 ? "+" : ""}${text}`;
}

function formatMarketActivity(signal: LiveSignal) {
  if (signal.tone === "risk") return "风险放大";
  if (parseChange(signal.change24h) >= 3 || signal.score >= 70) return "活跃放大";
  return "波动正常";
}

function parseChange(value: LiveSignal["change24h"]) {
  if (value === undefined || value === null) return Number.NaN;
  return Number.parseFloat(String(value).replace("%", ""));
}
