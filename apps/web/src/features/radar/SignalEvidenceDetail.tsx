import type { LiveSignal, SignalFact } from "./liveSignalModel";
import { buildSelectedSignalFacts, formatDirectionLabel, formatSignalTime } from "./liveSignalModel";

type SignalEvidenceDetailProps = {
  signal: LiveSignal;
  now?: number;
  onBack: () => void;
  onOpenValueClaw: (signalId: string) => void;
  onToggleWatch: (symbol: string) => void;
};

export function SignalEvidenceDetail({
  signal,
  now = Date.now(),
  onBack,
  onOpenValueClaw,
  onToggleWatch,
}: SignalEvidenceDetailProps) {
  const facts = buildSelectedSignalFacts(signal);

  return (
    <section className="signal-evidence" aria-label={`${signal.symbol} 策略信号证据`}>
      <header className="signal-evidence__header">
        <button type="button" className="signal-evidence__back" onClick={onBack} aria-label="收起信号详情">
          收起
        </button>
        <div>
          <p>{signal.strategyName}</p>
          <h1>{signal.symbol}</h1>
        </div>
        <strong>{formatDirectionLabel(signal.direction)}</strong>
      </header>

      <div className="signal-evidence__score">
        <span>{signal.score}</span>
        <div>
          <p>策略评分</p>
          <small>{formatSignalTime(signal.generatedAt, now)}</small>
        </div>
      </div>

      <EvidenceList facts={facts} />

      <section className="signal-evidence__ai-boundary" aria-label="AI 角色边界">
        <h2>AI 复核边界</h2>
        <p>
          AI 可以汇总证据、比较风险，并准备 ValueClaw 上下文；它不会创建或覆盖策略信号。
        </p>
      </section>

      <footer className="signal-evidence__actions">
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          打开 ValueClaw
        </button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
          加入观察
        </button>
      </footer>
    </section>
  );
}

function EvidenceList({ facts }: { facts: SignalFact[] }) {
  return (
    <dl className="signal-evidence__facts">
      {facts.map((fact) => (
        <div key={fact.label} className={fact.emphasis ? "is-emphasis" : undefined}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
