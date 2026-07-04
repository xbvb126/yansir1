import type { LiveSignal, SignalFact } from "./liveSignalModel";
import { buildSelectedSignalFacts, formatSignalTime } from "./liveSignalModel";

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
    <section className="signal-evidence" aria-label={`${signal.symbol} strategy signal evidence`}>
      <header className="signal-evidence__header">
        <button type="button" className="signal-evidence__back" onClick={onBack} aria-label="Back to realtime radar">
          Back
        </button>
        <div>
          <p>{signal.strategyName}</p>
          <h1>{signal.symbol}</h1>
        </div>
        <strong>{signal.direction.toUpperCase()}</strong>
      </header>

      <div className="signal-evidence__score">
        <span>{signal.score}</span>
        <div>
          <p>Strategy score</p>
          <small>{formatSignalTime(signal.generatedAt, now)}</small>
        </div>
      </div>

      <EvidenceList facts={facts} />

      <section className="signal-evidence__ai-boundary" aria-label="AI role">
        <h2>AI Review Boundary</h2>
        <p>
          AI can summarize evidence, compare risk, and prepare ValueClaw context. It does not create or override
          the strategy signal.
        </p>
      </section>

      <footer className="signal-evidence__actions">
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>
          Open ValueClaw
        </button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>
          Watch Symbol
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
