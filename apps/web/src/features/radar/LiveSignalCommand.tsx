import { Fragment, useMemo } from "react";
import type { LiveSignal, LiveSignalFilter, SignalFact, StrategyListeningStatus } from "./liveSignalModel";
import { buildSelectedSignalFacts, filterLiveSignals, formatDirectionLabel, formatSignalStatus, formatSignalTime, sortLiveSignals } from "./liveSignalModel";

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

type StrategyStatusPanelProps = {
  status: StrategyListeningStatus;
  signalCount: number;
};

type RealtimeSignalQueueProps = {
  signals: LiveSignal[];
  selectedSignalId?: string;
  selectedFacts: SignalFact[];
  emptyState: LiveSignalEmptyState;
  now: number;
  onSelectSignal: (signalId?: string) => void;
  onOpenDetail: (symbol: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

type SelectedSignalPanelProps = {
  className?: string;
  signal?: LiveSignal;
  facts: SignalFact[];
  onOpenDetail: (symbol: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

const filters: Array<{ value: LiveSignalFilter; label: string }> = [
  { value: "now", label: "全部" },
  { value: "long", label: "做多" },
  { value: "risk", label: "风险" },
  { value: "watch", label: "观察" },
];

const statusCopy: Record<StrategyListeningStatus, { label: string; text: string }> = {
  live: { label: "监听中", text: "策略监听器正在运行" },
  degraded: { label: "延迟", text: "正在使用最新策略数据" },
  paused: { label: "暂停", text: "等待下一轮策略扫描" },
};

export function LiveSignalCommand({
  signals,
  selectedSignalId,
  activeFilter,
  listeningStatus,
  emptyState,
  now = Date.now(),
  onFilterChange,
  onSelectSignal,
  onOpenDetail,
  onOpenValueClaw,
  onToggleWatch,
}: LiveSignalCommandProps) {
  const sortedSignals = useMemo(() => sortLiveSignals(signals), [signals]);
  const visibleSignals = useMemo(() => filterLiveSignals(sortedSignals, activeFilter), [activeFilter, sortedSignals]);
  const selectedSignal = useMemo(
    () =>
      selectedSignalId
        ? visibleSignals.find((signal) => signal.id === selectedSignalId) ??
          signals.find((signal) => signal.id === selectedSignalId)
        : undefined,
    [selectedSignalId, signals, visibleSignals],
  );
  const selectedFacts = useMemo(
    () => (selectedSignal ? buildSelectedSignalFacts(selectedSignal) : []),
    [selectedSignal],
  );

  return (
    <section className="live-command" aria-label="Yansir Crypto 实时信号雷达">
      <div className="live-command__header">
        <div>
          <p className="live-command__eyebrow">Yansir Crypto</p>
          <h1>实时雷达</h1>
        </div>
        <StrategyStatusPanel status={listeningStatus} signalCount={signals.length} />
      </div>

      <div className="live-command__filters" role="tablist" aria-label="信号筛选">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            role="tab"
            className={filter.value === activeFilter ? "is-active" : undefined}
            aria-selected={filter.value === activeFilter}
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="live-command__body">
        <RealtimeSignalQueue
          signals={visibleSignals}
          selectedSignalId={selectedSignal?.id}
          selectedFacts={selectedFacts}
          emptyState={emptyState}
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

function StrategyStatusPanel({ status, signalCount }: StrategyStatusPanelProps) {
  const copy = statusCopy[status];

  return (
    <aside className={`live-command__status is-${status}`} aria-label="策略监听状态">
      <strong>{copy.label}</strong>
      <span>{signalCount} 条策略信号</span>
      <small>{copy.text}</small>
    </aside>
  );
}

function RealtimeSignalQueue({
  signals,
  selectedSignalId,
  selectedFacts,
  emptyState,
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
                <span className={`live-command__badge is-${signal.tone}`}>{formatDirectionLabel(signal.direction)}</span>
              </span>
              <span className="live-command__score">{signal.score}</span>
              <span className="live-command__meta">
                {signal.strategyName} · {formatSignalTime(signal.generatedAt, now)}
              </span>
              <p className="live-command__trigger">{signal.trigger}</p>
            </button>
            {selected && (
              <SelectedSignalPanel
                className="live-command__row-detail"
                signal={signal}
                facts={selectedFacts}
                onOpenDetail={onOpenDetail}
                onOpenValueClaw={onOpenValueClaw}
                onToggleWatch={onToggleWatch}
              />
            )}
          </Fragment>
        );
      })}
    </section>
  );
}

export function resolveNextSelectedSignalId(selectedSignalId: string | undefined, clickedSignalId: string): string | undefined {
  return selectedSignalId === clickedSignalId ? undefined : clickedSignalId;
}

function SelectedSignalPanel({
  className,
  signal,
  facts,
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

  return (
    <aside className={`live-command__selected ${className ?? ""}`.trim()} aria-label="已选策略信号">
      <div className="live-command__selected-head">
        <div>
          <span>{signal.strategyName}</span>
          <strong>{signal.symbol}</strong>
        </div>
        <em>{formatSignalStatus(signal.status)}</em>
      </div>

      <dl className="live-command__facts">
        {facts.map((fact) => (
          <div key={fact.label} className={fact.emphasis ? "is-emphasis" : undefined}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <div className="live-command__actions">
        <button type="button" onClick={() => onOpenDetail(signal.symbol)}>
          币种详情
        </button>
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          打开 ValueClaw
        </button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
          加入观察
        </button>
      </div>
    </aside>
  );
}
