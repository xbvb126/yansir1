# Yansir Crypto Live Signal Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Yansir Crypto realtime radar UI direction, named Live Signal Command, while preserving the existing strategy signal engine as the single source of truth.

**Architecture:** Add a frontend-only radar view-model layer and focused React components under `apps/web/src/features/radar`. Keep `apps/web/src/components/AppShell.tsx` as the navigation/data orchestration shell. The new UI consumes existing signal, watchlist, alert, and performance data; it never computes trading signals or changes backend strategy rules. AI and ValueClaw surfaces are explanation, review, and packaging layers only.

**Tech Stack:** React 18, TypeScript, Vite, existing CSS in `apps/web/src/styles/app.css`, Node assertion tests bundled with esbuild, existing NestJS/FastAPI contracts unchanged.

---

## Strategy Signal Boundary

- The existing strategy signal is the product core and must not be replaced, re-ranked, or overridden by UI code, AI explanations, or ValueClaw packaging.
- Frontend code may map a raw strategy signal into display fields, but every trade direction, score, confidence, trigger, risk label, and status shown in Live Signal Command must originate from existing API or existing frontend state.
- New files in this plan must not edit `services/strategy`.
- Any new helper that derives a display tone must use existing signal direction/status/risk fields and must not invent a buy/sell/hold decision.
- AI copy must explicitly present itself as explanation or review, never as a signal source.

## Current Code Anchors

- Main radar route and application shell: `apps/web/src/components/AppShell.tsx`
- Existing API client helpers: `apps/web/src/lib/api.ts`
- Existing web styles: `apps/web/src/styles/app.css`
- Existing web package scripts: `apps/web/package.json`
- Existing root scripts: `package.json`
- Existing frontend test style: `apps/web/tests/plan-access.test.mjs`

## Task 1: Add Pure Live Signal View-Model Helpers And Tests

- [ ] Create `apps/web/src/features/radar/liveSignalCommand.ts`.
- [ ] Create `apps/web/tests/live-signal-command.test.mjs`.
- [ ] Add `"test:radar-live": "node tests/live-signal-command.test.mjs"` to `apps/web/package.json`.
- [ ] Run `npm run test:radar-live -w apps/web`.
- [ ] Commit with message `Add live signal command view model`.

Implementation for `apps/web/src/features/radar/liveSignalCommand.ts`:

```ts
export type LiveSignalDirection = "long" | "short" | "neutral";
export type LiveSignalTone = "opportunity" | "risk" | "watch";
export type LiveSignalFilter = "now" | "long" | "risk" | "watch";
export type StrategyListeningStatus = "live" | "degraded" | "paused";

export type RawRadarSignal = {
  id?: string;
  symbol?: string;
  name?: string;
  direction?: string;
  action?: string;
  side?: string;
  score?: number;
  confidence?: number;
  strength?: number;
  risk?: string;
  status?: string;
  strategy?: string;
  strategyName?: string;
  trigger?: string;
  reason?: string;
  generatedAt?: string;
  createdAt?: string;
  timestamp?: string;
  price?: number;
  change24h?: number;
};

export type LiveSignal = {
  id: string;
  symbol: string;
  name: string;
  direction: LiveSignalDirection;
  tone: LiveSignalTone;
  score: number;
  confidence: number;
  risk: string;
  status: string;
  strategyName: string;
  trigger: string;
  generatedAt: string;
  price?: number;
  change24h?: number;
  source: "strategy";
};

export type SignalFact = {
  label: string;
  value: string;
  emphasis?: boolean;
};

const riskWords = ["risk", "danger", "stop", "drawdown", "高风险", "风险", "止损"];

export function normalizeDirection(signal: RawRadarSignal): LiveSignalDirection {
  const raw = `${signal.direction ?? signal.action ?? signal.side ?? ""}`.toLowerCase();
  if (raw.includes("short") || raw.includes("sell") || raw.includes("空")) return "short";
  if (raw.includes("long") || raw.includes("buy") || raw.includes("多")) return "long";
  return "neutral";
}

export function normalizeScore(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function resolveSignalTone(signal: RawRadarSignal): LiveSignalTone {
  const riskText = `${signal.risk ?? ""} ${signal.status ?? ""} ${signal.reason ?? ""}`.toLowerCase();
  if (riskWords.some((word) => riskText.includes(word.toLowerCase()))) return "risk";
  if (signal.status?.toLowerCase().includes("watch")) return "watch";
  return "opportunity";
}

export function toLiveSignal(signal: RawRadarSignal, index: number): LiveSignal {
  const direction = normalizeDirection(signal);
  const score = normalizeScore(signal.score ?? signal.strength, 50);
  const confidence = normalizeScore(signal.confidence, score);
  const generatedAt = signal.generatedAt ?? signal.createdAt ?? signal.timestamp ?? new Date(0).toISOString();
  const symbol = (signal.symbol ?? "UNKNOWN").toUpperCase();

  return {
    id: signal.id ?? `${symbol}-${generatedAt}-${index}`,
    symbol,
    name: signal.name ?? symbol,
    direction,
    tone: resolveSignalTone(signal),
    score,
    confidence,
    risk: signal.risk ?? "Strategy risk model",
    status: signal.status ?? "active",
    strategyName: signal.strategyName ?? signal.strategy ?? "Yansir Strategy",
    trigger: signal.trigger ?? signal.reason ?? "Strategy trigger confirmed",
    generatedAt,
    price: signal.price,
    change24h: signal.change24h,
    source: "strategy",
  };
}

export function sortLiveSignals(signals: LiveSignal[]): LiveSignal[] {
  return [...signals].sort((a, b) => {
    const timeDelta = Date.parse(b.generatedAt) - Date.parse(a.generatedAt);
    if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
    return b.score - a.score;
  });
}

export function filterLiveSignals(signals: LiveSignal[], filter: LiveSignalFilter): LiveSignal[] {
  if (filter === "long") return signals.filter((signal) => signal.direction === "long");
  if (filter === "risk") return signals.filter((signal) => signal.tone === "risk");
  if (filter === "watch") return signals.filter((signal) => signal.tone === "watch");
  return signals;
}

export function buildSelectedSignalFacts(signal: LiveSignal): SignalFact[] {
  return [
    { label: "Signal source", value: "Yansir strategy engine", emphasis: true },
    { label: "Symbol", value: signal.symbol, emphasis: true },
    { label: "Direction", value: signal.direction.toUpperCase(), emphasis: signal.direction !== "neutral" },
    { label: "Score", value: `${signal.score}/100`, emphasis: true },
    { label: "Confidence", value: `${signal.confidence}/100` },
    { label: "Risk", value: signal.risk },
    { label: "Trigger", value: signal.trigger },
    { label: "AI role", value: "Explain and review only; strategy signal remains authoritative." },
  ];
}

export function formatSignalTime(isoTime: string, now = Date.now()): string {
  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) return "time unavailable";
  const diffSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours}h ago`;
}
```

Implementation for `apps/web/tests/live-signal-command.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = join(process.cwd(), "tmp-tests", "live-signal-command.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

await build({
  entryPoints: ["src/features/radar/liveSignalCommand.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
});

const module = await import(pathToFileURL(outfile).href);

const baseSignal = module.toLiveSignal(
  {
    id: "sig-btc",
    symbol: "btcUSDT",
    direction: "BUY",
    score: 87.2,
    confidence: 91,
    risk: "controlled",
    status: "active",
    strategyName: "Momentum Breakout",
    trigger: "Volume breakout confirmed",
    generatedAt: "2026-07-04T08:00:00.000Z",
  },
  0,
);

assert.equal(baseSignal.symbol, "BTCUSDT");
assert.equal(baseSignal.direction, "long");
assert.equal(baseSignal.source, "strategy");
assert.equal(baseSignal.score, 87);
assert.equal(baseSignal.confidence, 91);

const riskSignal = module.toLiveSignal(
  {
    symbol: "ETHUSDT",
    side: "short",
    score: 76,
    risk: "High risk stop zone",
    generatedAt: "2026-07-04T08:01:00.000Z",
  },
  1,
);

assert.equal(riskSignal.direction, "short");
assert.equal(riskSignal.tone, "risk");

const filteredLong = module.filterLiveSignals([baseSignal, riskSignal], "long");
assert.deepEqual(
  filteredLong.map((signal) => signal.symbol),
  ["BTCUSDT"],
);

const facts = module.buildSelectedSignalFacts(baseSignal);
assert.equal(facts[0].value, "Yansir strategy engine");
assert.ok(facts.some((fact) => fact.value.includes("Explain and review only")));

assert.equal(
  module.formatSignalTime("2026-07-04T08:00:00.000Z", Date.parse("2026-07-04T08:00:42.000Z")),
  "42s ago",
);

console.log("live signal command tests passed");
```

Expected command output:

```text
live signal command tests passed
```

## Task 2: Create The Live Signal Command Radar Component

- [ ] Create `apps/web/src/features/radar/LiveSignalCommand.tsx`.
- [ ] Export a single `LiveSignalCommand` component plus local section components.
- [ ] Run `npm run test:radar-live -w apps/web`.
- [ ] Run `npm run build:web`.
- [ ] Commit with message `Add live signal command radar component`.

Implementation contract for `LiveSignalCommand`:

```tsx
import type { LiveSignal, LiveSignalFilter, SignalFact, StrategyListeningStatus } from "./liveSignalCommand";
import { buildSelectedSignalFacts, filterLiveSignals, formatSignalTime, sortLiveSignals } from "./liveSignalCommand";

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

const filters: Array<{ value: LiveSignalFilter; label: string }> = [
  { value: "now", label: "Now" },
  { value: "long", label: "Long" },
  { value: "risk", label: "Risk" },
  { value: "watch", label: "Watch" },
];

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
  const visibleSignals = filterLiveSignals(sortLiveSignals(signals), activeFilter);
  const selectedSignal =
    visibleSignals.find((signal) => signal.id === selectedSignalId) ??
    visibleSignals[0] ??
    signals.find((signal) => signal.id === selectedSignalId);
  const selectedFacts = selectedSignal ? buildSelectedSignalFacts(selectedSignal) : [];

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
            className={filter.value === activeFilter ? "is-active" : ""}
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
          now={now}
          onSelectSignal={onSelectSignal}
        />

        <SelectedSignalPanel
          signal={selectedSignal}
          facts={selectedFacts}
          onOpenDetail={onOpenDetail}
          onOpenValueClaw={onOpenValueClaw}
          onToggleWatch={onToggleWatch}
        />
      </div>
    </section>
  );
}
```

Required local component behavior:

- `StrategyStatusPanel` shows `LIVE`, `DEGRADED`, or `PAUSED`, signal count, and a short status line. This panel must not say AI is producing signals.
- `RealtimeSignalQueue` renders one button row per `LiveSignal`, with symbol, direction, score, risk tone, strategy name, trigger, and `formatSignalTime(signal.generatedAt, now)`.
- `SelectedSignalPanel` renders facts from `buildSelectedSignalFacts(signal)`, then three command buttons:
  - `Signal Detail` calls `onOpenDetail(signal.id)`.
  - `ValueClaw` calls `onOpenValueClaw(signal.id)`.
  - `Watch` calls `onToggleWatch(signal.symbol)`.
- Empty state copy: `Waiting for strategy signals`.

## Task 3: Create The Signal Evidence Detail Component

- [ ] Create `apps/web/src/features/radar/SignalEvidenceDetail.tsx`.
- [ ] Run `npm run build:web`.
- [ ] Commit with message `Add signal evidence detail component`.

Implementation contract:

```tsx
import type { LiveSignal, SignalFact } from "./liveSignalCommand";
import { buildSelectedSignalFacts, formatSignalTime } from "./liveSignalCommand";

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
        <p>AI can summarize evidence, compare risk, and prepare ValueClaw context. It does not create or override the strategy signal.</p>
      </section>

      <footer className="signal-evidence__actions">
        <button type="button" onClick={() => onOpenValueClaw(signal.id)}>Open ValueClaw</button>
        <button type="button" onClick={() => onToggleWatch(signal.symbol)}>Watch Symbol</button>
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
```

Required detail sections:

- Header with back control, strategy name, symbol, and direction.
- Score block using the existing strategy score.
- Evidence list generated by `buildSelectedSignalFacts`.
- AI boundary section that says AI reviews and explains only.
- Actions for ValueClaw and watchlist.

## Task 4: Wire The New Radar Into AppShell

- [ ] Modify `apps/web/src/components/AppShell.tsx`.
- [ ] Import `LiveSignalCommand`, `SignalEvidenceDetail`, and view-model helpers.
- [ ] Add local radar UI state for active filter, selected signal id, and detail mode.
- [ ] Map existing radar, inbox, or strategy signal data into `LiveSignal[]` with `toLiveSignal`.
- [ ] Replace the current radar page main body with `LiveSignalCommand` for the radar route while keeping existing navigation, modals, account state, watchlist handlers, and API calls intact.
- [ ] Run `npm run test:radar-live -w apps/web`.
- [ ] Run `npm run build:web`.
- [ ] Commit with message `Wire live signal command into radar page`.

Implementation pattern:

```tsx
import { LiveSignalCommand } from "../features/radar/LiveSignalCommand";
import { SignalEvidenceDetail } from "../features/radar/SignalEvidenceDetail";
import type { LiveSignalFilter, StrategyListeningStatus } from "../features/radar/liveSignalCommand";
import { toLiveSignal } from "../features/radar/liveSignalCommand";
```

State to add inside the radar page component:

```tsx
const [activeLiveFilter, setActiveLiveFilter] = useState<LiveSignalFilter>("now");
const [selectedLiveSignalId, setSelectedLiveSignalId] = useState<string | undefined>();
const [radarDetailSignalId, setRadarDetailSignalId] = useState<string | undefined>();
```

Mapping pattern:

```tsx
const liveSignals = useMemo(
  () => radarSignals.map((signal, index) => toLiveSignal(signal, index)),
  [radarSignals],
);

const selectedDetailSignal = useMemo(
  () => liveSignals.find((signal) => signal.id === radarDetailSignalId),
  [liveSignals, radarDetailSignalId],
);
```

Listening status pattern:

```tsx
const listeningStatus: StrategyListeningStatus = strategyStatus === "online" ? "live" : strategyStatus === "degraded" ? "degraded" : "paused";
```

Render pattern:

```tsx
if (selectedDetailSignal) {
  return (
    <SignalEvidenceDetail
      signal={selectedDetailSignal}
      onBack={() => setRadarDetailSignalId(undefined)}
      onOpenValueClaw={handleOpenValueClaw}
      onToggleWatch={handleToggleWatchSymbol}
    />
  );
}

return (
  <LiveSignalCommand
    signals={liveSignals}
    selectedSignalId={selectedLiveSignalId}
    activeFilter={activeLiveFilter}
    listeningStatus={listeningStatus}
    onFilterChange={setActiveLiveFilter}
    onSelectSignal={setSelectedLiveSignalId}
    onOpenDetail={setRadarDetailSignalId}
    onOpenValueClaw={handleOpenValueClaw}
    onToggleWatch={handleToggleWatchSymbol}
  />
);
```

Execution notes:

- Use the actual signal array name already present in `RadarPage`. If the current code uses `radarRecords`, `signals`, `strategySignals`, or another existing name, map that array with `toLiveSignal`.
- If the existing ValueClaw handler expects a symbol instead of a signal id, pass the selected signal to a small adapter inside `AppShell.tsx`.
- If the existing watchlist handler accepts a market object instead of a symbol, use the existing symbol lookup already used by the radar or detail screen.
- Keep old radar data fetching, refresh controls, notification wiring, and auth logic in place.
- Do not modify backend API contracts in this task.

## Task 5: Add Responsive Live Signal Command Styling

- [ ] Modify `apps/web/src/styles/app.css`.
- [ ] Add a clearly labeled section named `Live Signal Command`.
- [ ] Style the radar component, queue rows, selected facts, evidence detail, status panel, and mobile layout.
- [ ] Run `npm run build:web`.
- [ ] Commit with message `Style live signal command radar`.

CSS section to add near the current radar and signal detail styles:

```css
/* Live Signal Command */
.live-command {
  display: flex;
  min-height: calc(100vh - 96px);
  flex-direction: column;
  gap: 18px;
  padding: 20px 16px 96px;
  color: var(--text-primary);
}

.live-command__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.live-command__eyebrow {
  margin: 0 0 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.live-command__header h1 {
  margin: 0;
  font-size: 28px;
  letter-spacing: 0;
}

.live-command__status,
.live-command__queue,
.live-command__selected,
.signal-evidence__score,
.signal-evidence__facts,
.signal-evidence__ai-boundary {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-primary);
  box-shadow: var(--shadow-soft);
}

.live-command__status {
  min-width: 138px;
  padding: 12px;
  text-align: right;
}

.live-command__status strong {
  display: block;
  color: var(--accent-green);
  font-size: 13px;
}

.live-command__status span {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.live-command__filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.live-command__filters button,
.live-command__selected button,
.signal-evidence__actions button,
.signal-evidence__back {
  min-height: 40px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
}

.live-command__filters button.is-active {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 16%, var(--surface-primary));
}

.live-command__body {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 14px;
}

.live-command__queue {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.live-command__row {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) auto;
  gap: 10px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border-subtle);
  background: transparent;
  padding: 14px;
  color: inherit;
  text-align: left;
}

.live-command__row:last-child {
  border-bottom: 0;
}

.live-command__row.is-active {
  background: color-mix(in srgb, var(--accent-green) 10%, transparent);
}

.live-command__symbol {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.live-command__symbol strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-command__badge {
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--surface-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
}

.live-command__badge.is-risk {
  color: var(--accent-red);
}

.live-command__score {
  justify-self: end;
  font-size: 24px;
  font-weight: 800;
}

.live-command__trigger {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
}

.live-command__selected {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.live-command__facts,
.signal-evidence__facts {
  display: grid;
  gap: 10px;
  margin: 0;
}

.live-command__facts div,
.signal-evidence__facts div {
  display: grid;
  gap: 4px;
}

.live-command__facts dt,
.signal-evidence__facts dt {
  color: var(--text-secondary);
  font-size: 12px;
}

.live-command__facts dd,
.signal-evidence__facts dd {
  margin: 0;
  font-weight: 700;
}

.live-command__actions,
.signal-evidence__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.signal-evidence {
  display: flex;
  min-height: calc(100vh - 96px);
  flex-direction: column;
  gap: 16px;
  padding: 20px 16px 96px;
}

.signal-evidence__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.signal-evidence__header h1,
.signal-evidence__header p {
  margin: 0;
}

.signal-evidence__header p {
  color: var(--text-secondary);
  font-size: 12px;
}

.signal-evidence__score {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
}

.signal-evidence__score span {
  font-size: 44px;
  font-weight: 900;
}

.signal-evidence__facts,
.signal-evidence__ai-boundary {
  padding: 16px;
}

.signal-evidence__ai-boundary h2,
.signal-evidence__ai-boundary p {
  margin: 0;
}

.signal-evidence__ai-boundary p {
  margin-top: 8px;
  color: var(--text-secondary);
  line-height: 1.45;
}

@media (max-width: 760px) {
  .live-command__header {
    flex-direction: column;
  }

  .live-command__status {
    width: 100%;
    text-align: left;
  }

  .live-command__body {
    grid-template-columns: 1fr;
  }

  .live-command__actions,
  .signal-evidence__actions {
    grid-template-columns: 1fr;
  }
}
```

Execution notes:

- If `var(--surface-primary)`, `var(--surface-secondary)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--border-subtle)`, `var(--accent-green)`, `var(--accent-red)`, or `var(--shadow-soft)` are not defined in the existing CSS, use the closest existing Yansir variables already defined in `app.css`.
- Keep border radius at `8px` or less for cards and panels.
- Do not introduce decorative gradient orbs or oversized marketing hero sections.
- Keep button text short enough for mobile width.

## Task 6: Browser QA, Visual Adjustments, And Final Verification

- [ ] Run `npm run test:radar-live -w apps/web`.
- [ ] Run `npm run build:web`.
- [ ] Start the web dev server with `npm run dev:web`.
- [ ] Open the local web app in the in-app browser.
- [ ] Verify the radar first screen at mobile width around `390x844`.
- [ ] Verify the radar first screen at desktop width around `1280x900`.
- [ ] Click each filter: `Now`, `Long`, `Risk`, `Watch`.
- [ ] Select at least two signal rows and verify the selected facts change.
- [ ] Open signal detail, return to radar, and verify no console errors.
- [ ] Click ValueClaw and Watch actions and confirm they call existing handlers without changing signal facts.
- [ ] Apply visual fixes with `apps/web/src/styles/app.css` or component class changes only.
- [ ] Re-run `npm run build:web` after visual fixes.
- [ ] Commit with message `Verify live signal command radar`.

Expected verification results:

```text
live signal command tests passed
```

```text
✓ built in
```

Browser acceptance criteria:

- Realtime Radar is the first visible radar experience.
- The selected strategy signal remains visually dominant on mobile and desktop.
- AI boundary copy is visible in the detail flow.
- No UI copy says AI creates trading signals.
- Existing bottom navigation still works.
- No overlapping text or clipped command buttons at mobile width.
- Console has no runtime errors.

## Final Integration Check

- [ ] Run `git status -sb` and confirm only intended files changed before the final commit for each task.
- [ ] Run `git log --oneline -5` and confirm each task commit is present.
- [ ] Push the branch to GitHub after all task commits pass verification.
- [ ] Use the GitHub connector or `git ls-remote origin main` to verify the pushed branch includes the final commit.

## Files Expected To Change

- `apps/web/package.json`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/features/radar/liveSignalCommand.ts`
- `apps/web/src/features/radar/LiveSignalCommand.tsx`
- `apps/web/src/features/radar/SignalEvidenceDetail.tsx`
- `apps/web/src/styles/app.css`
- `apps/web/tests/live-signal-command.test.mjs`

## Files That Must Not Change For This UI Plan

- `services/strategy/**`
- `apps/api/src/modules/strategy/**`
- `apps/api/src/modules/signal/**`
- Database migration files

## Self-Review Checklist

- [ ] Every visible signal fact traces back to existing strategy/API/frontend state.
- [ ] No frontend helper creates a new trading decision.
- [ ] No AI or ValueClaw component claims signal authority.
- [ ] Mobile layout keeps controls tappable and text unclipped.
- [ ] `npm run test:radar-live -w apps/web` passes.
- [ ] `npm run build:web` passes.
