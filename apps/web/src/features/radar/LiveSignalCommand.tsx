import { Fragment, useMemo } from "react";
import type { LiveSignal, LiveSignalFilter, SignalFact, StrategyListeningStatus } from "./liveSignalModel";
import { buildSelectedSignalFacts, filterLiveSignals, formatSignalTime, sortLiveSignals } from "./liveSignalModel";

type LiveSignalCommandProps = {
  signals: LiveSignal[];
  selectedSignalId?: string;
  activeFilter: LiveSignalFilter;
  listeningStatus: StrategyListeningStatus;
  now?: number;
  onFilterChange: (filter: LiveSignalFilter) => void;
  onSelectSignal: (signalId: string) => void;
  onOpenDetail: (signalId: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

type StrategyStatusPanelProps = {
  status: StrategyListeningStatus;
  signalCount: number;
};

type RealtimeSignalQueueProps = {
  signals: LiveSignal[];
  selectedSignalId?: string;
  selectedFacts: SignalFact[];
  now: number;
  onSelectSignal: (signalId: string) => void;
  onOpenDetail: (signalId: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

type SelectedSignalPanelProps = {
  className?: string;
  signal?: LiveSignal;
  facts: SignalFact[];
  onOpenDetail: (signalId: string) => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

const filters: Array<{ value: LiveSignalFilter; label: string }> = [
  { value: "now", label: "Now" },
  { value: "long", label: "Long" },
  { value: "risk", label: "Risk" },
  { value: "watch", label: "Watch" },
];

const statusCopy: Record<StrategyListeningStatus, { label: string; text: string }> = {
  live: { label: "LIVE", text: "Strategy listener active" },
  degraded: { label: "DEGRADED", text: "Using latest strategy feed" },
  paused: { label: "PAUSED", text: "Waiting for strategy scan" },
};

export function LiveSignalCommand({
  signals,
  selectedSignalId,
  activeFilter,
  listeningStatus,
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
      visibleSignals.find((signal) => signal.id === selectedSignalId) ??
      visibleSignals[0] ??
      signals.find((signal) => signal.id === selectedSignalId),
    [selectedSignalId, signals, visibleSignals],
  );
  const selectedFacts = useMemo(
    () => (selectedSignal ? buildSelectedSignalFacts(selectedSignal) : []),
    [selectedSignal],
  );

  return (
    <section className="live-command" aria-label="Yansir Crypto realtime signal radar">
      <div className="live-command__header">
        <div>
          <p className="live-command__eyebrow">Yansir Crypto</p>
          <h1>Realtime Radar</h1>
        </div>
        <StrategyStatusPanel status={listeningStatus} signalCount={signals.length} />
      </div>

      <div className="live-command__filters" role="tablist" aria-label="Signal filters">
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
    <aside className={`live-command__status is-${status}`} aria-label="Strategy listener status">
      <strong>{copy.label}</strong>
      <span>{signalCount} strategy signals</span>
      <small>{copy.text}</small>
    </aside>
  );
}

function RealtimeSignalQueue({
  signals,
  selectedSignalId,
  selectedFacts,
  now,
  onSelectSignal,
  onOpenDetail,
  onOpenValueClaw,
  onToggleWatch,
}: RealtimeSignalQueueProps) {
  if (!signals.length) {
    return (
      <section className="live-command__queue live-command__empty" aria-label="Realtime signal queue">
        <strong>Waiting for strategy signals</strong>
        <span>The radar will light up when the strategy engine emits a signal.</span>
      </section>
    );
  }

  return (
    <section className="live-command__queue" aria-label="Realtime signal queue">
      {signals.map((signal) => {
        const selected = signal.id === selectedSignalId;

        return (
          <Fragment key={signal.id}>
            <button
              type="button"
              className={`live-command__row is-${signal.tone} ${selected ? "is-active" : ""}`.trim()}
              onClick={() => onSelectSignal(signal.id)}
            >
              <span className="live-command__symbol">
                <strong>{signal.symbol}</strong>
                <span className={`live-command__badge is-${signal.tone}`}>{signal.direction.toUpperCase()}</span>
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
      <aside className={`live-command__selected live-command__selected-empty ${className ?? ""}`.trim()} aria-label="Selected strategy signal">
        <strong>No signal selected</strong>
        <span>Waiting for strategy signals</span>
      </aside>
    );
  }

  return (
    <aside className={`live-command__selected ${className ?? ""}`.trim()} aria-label="Selected strategy signal">
      <div className="live-command__selected-head">
        <div>
          <span>{signal.strategyName}</span>
          <strong>{signal.symbol}</strong>
        </div>
        <em>{signal.status}</em>
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
        <button type="button" onClick={() => onOpenDetail(signal.id)}>
          Signal Detail
        </button>
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          ValueClaw
        </button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
          Watch
        </button>
      </div>
    </aside>
  );
}
