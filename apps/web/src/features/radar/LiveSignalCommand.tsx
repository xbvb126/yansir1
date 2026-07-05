import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { LiveSignal, LiveSignalFilter, StrategyListeningStatus } from "./liveSignalModel";
import { filterLiveSignals, formatDirectionLabel, formatSignalStatus, formatSignalTime, sortLiveSignals } from "./liveSignalModel";

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
  now: number;
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
  now = Date.now(),
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
          now={now}
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
  now,
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
              onClick={() => onSelectSignal(resolveNextSelectedSignalId(selectedSignalId, signal.id))}
            >
              <span className="live-command__symbol">
                <strong>{signal.symbol}</strong>
                <span className={`live-command__badge is-${signal.tone}`}>{formatSignalKind(signal)}</span>
                {signal.source === "strategy" && !isWaitingStrategySignal(signal) && (
                  <span className={`live-command__badge is-direction is-${signal.tone}`}>{formatDirectionLabel(signal.direction)}</span>
                )}
              </span>
              {signal.source === "market" ? (
                <span className="live-command__price">
                  <strong>{formatMarketPrice(signal)}</strong>
                  <em className={changeToneClass(signal)}>{formatMarketChange(signal)}</em>
                </span>
              ) : (
                <span className="live-command__score">
                  <strong>{isWaitingStrategySignal(signal) ? "--" : signal.score}</strong>
                  <small>{isWaitingStrategySignal(signal) ? "未命中" : "策略分"}</small>
                </span>
              )}
              <span className="live-command__meta">
                {formatSignalMeta(signal, now)}
              </span>
              <p className="live-command__trigger">{signal.trigger}</p>
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

        <dl className="live-command__facts live-command__facts-grid">
          <div className="is-emphasis">
            <dt>异动类型</dt>
            <dd>{formatMarketMovementType(signal)}</dd>
          </div>
          <div>
            <dt>现价</dt>
            <dd>{formatMarketPrice(signal)}</dd>
          </div>
          <div className={changeToneClass(signal) === "is-positive" ? "is-positive" : undefined}>
            <dt>24H 涨跌</dt>
            <dd>{formatMarketChange(signal)}</dd>
          </div>
          <div>
            <dt>成交状态</dt>
            <dd>{formatMarketActivity(signal)}</dd>
          </div>
        </dl>

        <div className="live-command__note">
          <span>观察重点</span>
          <p>{buildMarketObservation(signal)}</p>
        </div>
        <div className="live-command__note">
          <span>策略状态</span>
          <p>暂未触发 Yansir 策略信号，不生成交易方向。</p>
        </div>

        <div className="live-command__actions">
          <button type="button" className="market-primary" onClick={() => onOpenDetail(signal.symbol)}>
            策略追踪
          </button>
          <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
            ValueClaw
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

      <dl className="live-command__facts live-command__facts-grid">
        <div className="is-emphasis">
          <dt>信号来源</dt>
          <dd>Yansir 策略引擎</dd>
        </div>
        <div className={signal.direction === "short" ? "is-risk" : signal.direction === "long" ? "is-positive" : undefined}>
          <dt>方向</dt>
          <dd>{formatDirectionLabel(signal.direction)}</dd>
        </div>
        <div>
          <dt>策略分</dt>
          <dd>{formatStrategyScore(signal)}</dd>
        </div>
        <div>
          <dt>置信度</dt>
          <dd>{formatStrategyConfidence(signal)}</dd>
        </div>
      </dl>

      <div className="live-command__note">
        <span>触发原因</span>
        <p>{signal.trigger}</p>
      </div>
      <div className="live-command__note">
        <span>AI 边界</span>
        <p>仅用于解释和复核，策略信号保持最高优先级。</p>
      </div>

      <div className="live-command__actions">
        <button type="button" onClick={() => onOpenDetail(signal.symbol)}>
          信号详情
        </button>
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          ValueClaw
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

function formatSignalKind(signal: LiveSignal) {
  if (signal.source === "market") return formatMarketMovementType(signal);
  if (signal.action === "add_long") return "\u52a0\u591a";
  if (signal.action === "add_short") return "\u52a0\u7a7a";
  if (signal.action === "reduce_long") return "\u51cf\u591a";
  if (signal.action === "reduce_short") return "\u51cf\u7a7a";
  return isWaitingStrategySignal(signal) ? "等待信号" : "命中策略";
}

function formatStrategyScore(signal: LiveSignal) {
  return isWaitingStrategySignal(signal) ? "--" : `${signal.score}/100`;
}

function formatStrategyConfidence(signal: LiveSignal) {
  return isWaitingStrategySignal(signal) ? "--" : `${signal.confidence}/100`;
}

function formatSignalMeta(signal: LiveSignal, now: number) {
  if (signal.source === "market") {
    return `24H ${formatMarketChange(signal)} · ${formatMarketActivity(signal)}`;
  }
  return `${signal.strategyName} · ${formatSignalTime(signal.generatedAt, now)}`;
}

function formatMarketMovementType(signal: LiveSignal) {
  if (signal.tone === "risk") return signal.risk && signal.risk !== "策略风险模型" ? signal.risk : "风险观察";
  const changeValue = parseChange(signal.change24h);
  if (changeValue >= 3 || signal.score >= 70) return "市场急涨";
  return "市场观察";
}

function formatMarketPrice(signal: LiveSignal) {
  const rawPrice = signal.price;
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") return "--";
  return String(rawPrice);
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

function changeToneClass(signal: LiveSignal) {
  const value = parseChange(signal.change24h);
  if (!Number.isFinite(value)) return undefined;
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return undefined;
}

function formatMarketActivity(signal: LiveSignal) {
  if (signal.tone === "risk") return "风险放大";
  if (parseChange(signal.change24h) >= 3 || signal.score >= 70) return "活跃放大";
  return "波动正常";
}

function buildMarketObservation(signal: LiveSignal) {
  if (signal.tone === "risk") return "价格回落或资金拥挤正在扩大，建议等待二次确认。";
  return "确认成交量能否延续，同时跟踪资金费率和下一轮策略扫描。";
}

function parseChange(value: LiveSignal["change24h"]) {
  if (value === undefined || value === null) return Number.NaN;
  return Number.parseFloat(String(value).replace("%", ""));
}
