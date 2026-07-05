# Yansir Live Signal Product Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current Yansir Crypto live-signal feature branch closer to launch readiness by making the realtime strategy signal flow feel primary, explainable, and continuous across Radar, ValueClaw, Coin Detail, and Alerts.

**Architecture:** Keep the existing strategy signal engine and API contracts unchanged. Add frontend-only routing helpers, signal handoff state, improved empty-state copy, and presentation-level context cards. Radar remains the source of live strategy signal selection; ValueClaw and AI surfaces only explain or review the selected strategy signal.

**Tech Stack:** React 18, TypeScript, Vite, existing `apps/web/src/components/AppShell.tsx`, existing radar feature files under `apps/web/src/features/radar`, CSS in `apps/web/src/styles/app.css`, Node assertion tests bundled with esbuild.

---

## Product Non-Negotiables

- Existing strategy signals remain the product core and source of truth.
- Do not edit `services/strategy/**`, API strategy modules, or database migrations for this optimization pass.
- Do not let ValueClaw, AI copy, or UI ranking create, replace, or override strategy direction, score, confidence, timeframe, trigger, risk, or status.
- UI copy may explain "why this strategy signal matters"; it must not imply "AI generated this trading call".
- Preserve the current mobile-first visual language unless a task explicitly says otherwise.

## Audit Inputs

Use the audit evidence saved at:

- `docs/audits/2026-07-04-yansir-live-signal-product-audit/findings.md`
- `docs/audits/2026-07-04-yansir-live-signal-product-audit/01-radar-default.png`
- `docs/audits/2026-07-04-yansir-live-signal-product-audit/07-symbol-detail-direct.png`
- `docs/audits/2026-07-04-yansir-live-signal-product-audit/08-valueclaw-correct-route.png`
- `docs/audits/2026-07-04-yansir-live-signal-product-audit/09-alerts-correct-route.png`

## Current Code Anchors

- Main shell, routes, Radar, Coin Detail, ValueClaw, Alerts: `apps/web/src/components/AppShell.tsx`
- Bottom navigation route type: `apps/web/src/components/BottomNav.tsx`
- Live radar component: `apps/web/src/features/radar/LiveSignalCommand.tsx`
- Live radar model helpers: `apps/web/src/features/radar/liveSignalModel.ts`
- Web CSS: `apps/web/src/styles/app.css`
- Existing radar test: `apps/web/tests/live-signal-command.test.mjs`
- Web package scripts: `apps/web/package.json`

## File Structure

- Create `apps/web/src/lib/viewRouting.ts`
  - Owns URL view alias normalization.
  - Keeps `valueclaw -> claw` and `alerts -> signal` mapping away from `AppShell.tsx`.
- Create `apps/web/tests/view-routing.test.mjs`
  - Verifies view aliases and unknown view fallback.
- Modify `apps/web/src/components/AppShell.tsx`
  - Use route normalization helper.
  - Track selected radar signal context for ValueClaw and Coin Detail.
  - Move realtime radar command above tracking filters.
  - Pass signal context into `ValueClawPage` and `SymbolDetailPage`.
  - Add source/status chips to alert rows.
- Modify `apps/web/src/features/radar/LiveSignalCommand.tsx`
  - Add richer empty-state props.
  - Render empty, paused, degraded, and filtered states more clearly.
- Modify `apps/web/src/features/radar/liveSignalModel.ts`
  - Add display-only helpers for empty-state and context labels if needed.
  - Do not add strategy decision logic.
- Modify `apps/web/src/styles/app.css`
  - Style radar-first layout, collapsible tracking tools, ValueClaw signal context, coin detail handoff card, route/accessibility states, and alert source chips.
- Modify `apps/web/tests/live-signal-command.test.mjs`
  - Cover signal-first empty state copy and ensure AI boundary copy remains present.
- Modify `apps/web/package.json`
  - Add `test:view-routing`.

## Phase 1: Launch-Blocking P0 Fixes

### Task 1: Add View Route Alias Normalization

**Files:**
- Create: `apps/web/src/lib/viewRouting.ts`
- Create: `apps/web/tests/view-routing.test.mjs`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Create route helper**

Create `apps/web/src/lib/viewRouting.ts`:

```ts
import type { ViewName } from "../components/BottomNav";

const viewAliases: Record<string, ViewName> = {
  valueclaw: "claw",
  alerts: "signal",
  alert: "signal",
  signals: "radar",
};

const canonicalViews = new Set<ViewName>([
  "data",
  "claw",
  "radar",
  "signal",
  "account",
  "login",
  "register",
  "admin",
  "plans",
  "team",
]);

export function normalizeViewParam(value: string | null | undefined): ViewName {
  const clean = `${value ?? ""}`.trim().toLowerCase();
  if (!clean) return "data";
  if (clean in viewAliases) return viewAliases[clean];
  return canonicalViews.has(clean as ViewName) ? (clean as ViewName) : "data";
}
```

- [ ] **Step 2: Add failing route test**

Create `apps/web/tests/view-routing.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outfile = join(process.cwd(), "tmp-tests", "view-routing.mjs");
mkdirSync(join(process.cwd(), "tmp-tests"), { recursive: true });

await build({
  entryPoints: ["src/lib/viewRouting.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
});

const module = await import(pathToFileURL(outfile).href);

assert.equal(module.normalizeViewParam("valueclaw"), "claw");
assert.equal(module.normalizeViewParam("alerts"), "signal");
assert.equal(module.normalizeViewParam("signals"), "radar");
assert.equal(module.normalizeViewParam("radar"), "radar");
assert.equal(module.normalizeViewParam("unknown"), "data");
assert.equal(module.normalizeViewParam(null), "data");

console.log("view routing tests passed");
```

- [ ] **Step 3: Add package script**

In `apps/web/package.json`, add:

```json
"test:view-routing": "node tests/view-routing.test.mjs"
```

- [ ] **Step 4: Wire helper into `AppShell.tsx`**

Import helper:

```ts
import { normalizeViewParam } from "../lib/viewRouting";
```

Replace `readView()` body:

```ts
function readView(): ViewName {
  const value = new URLSearchParams(window.location.search).get("view");
  return normalizeViewParam(value);
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:radar-live -w apps/web
```

Expected:

```text
view routing tests passed
live signal command tests passed
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/viewRouting.ts apps/web/tests/view-routing.test.mjs apps/web/package.json apps/web/src/components/AppShell.tsx
git commit -m "Normalize Yansir view route aliases"
```

### Task 2: Make Radar Signal-First And Move Tracking Tools Below

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

- [ ] **Step 1: Add test assertions for radar-first source order**

In `apps/web/tests/live-signal-command.test.mjs`, add after `const appShellSource = ...`:

```js
const liveCommandIndex = appShellSource.indexOf("<LiveSignalCommand");
const trackingHeaderIndex = appShellSource.indexOf('<header className="ai-track-header">');
assert.ok(liveCommandIndex > -1, "radar should render LiveSignalCommand");
assert.ok(trackingHeaderIndex > -1, "radar should keep tracking tools");
assert.ok(
  liveCommandIndex < trackingHeaderIndex,
  "realtime strategy radar should render before tracking filters",
);
```

Run:

```powershell
npm.cmd run test:radar-live -w apps/web
```

Expected before implementation: FAIL with `realtime strategy radar should render before tracking filters`.

- [ ] **Step 2: Reorder `RadarPage` JSX**

In `RadarPage`, move the `<LiveSignalCommand ... />` block so it is the first substantive child inside:

```tsx
<section className="view active-view polished-screen radar-tracking-screen">
  <LiveSignalCommand
    signals={liveSignals}
    selectedSignalId={selectedLiveSignalId}
    activeFilter={activeLiveFilter}
    listeningStatus={listeningStatus}
    emptyState={liveEmptyState}
    now={scanNow}
    onFilterChange={setActiveLiveFilter}
    onSelectSignal={setSelectedLiveSignalId}
    onOpenDetail={handleOpenSignalDetail}
    onOpenValueClaw={handleOpenValueClaw}
    onToggleWatch={handleToggleWatchSymbol}
  />

  <section className="radar-tools-panel" aria-label="筛选与历史追踪">
    <header className="ai-track-header">
      ...
    </header>
    ...
  </section>
</section>
```

Keep all existing tracking filters and rule settings inside `radar-tools-panel`. Do not delete filter functionality.

- [ ] **Step 3: Add compact tools styling**

Add CSS near the live command styles:

```css
.radar-tools-panel {
  margin-top: 12px;
}

.radar-tools-panel .ai-track-header {
  margin-top: 0;
}

.app-shell.view-radar .live-command {
  margin-top: 0;
}
```

- [ ] **Step 4: Run tests and browser QA**

Run:

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

Browser QA:

- Open `http://127.0.0.1:3201/yansir/?view=radar`.
- Confirm `实时雷达` appears before `AI追踪 / 策略追踪 / 我的追踪`.
- Confirm bottom navigation still works.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/live-signal-command.test.mjs
git commit -m "Prioritize realtime radar on signal page"
```

### Task 3: Upgrade Radar Empty, Paused, Degraded, And Filtered States

**Files:**
- Modify: `apps/web/src/features/radar/LiveSignalCommand.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

- [ ] **Step 1: Add empty-state prop types**

In `LiveSignalCommand.tsx`, add:

```ts
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
```

Add to `LiveSignalCommandProps`:

```ts
emptyState: LiveSignalEmptyState;
```

Thread it through `RealtimeSignalQueueProps`:

```ts
emptyState: LiveSignalEmptyState;
```

- [ ] **Step 2: Replace generic empty copy**

In `RealtimeSignalQueue`, replace the current empty branch with:

```tsx
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
```

- [ ] **Step 3: Build empty-state values in `RadarPage`**

In `RadarPage`, create `liveEmptyState` before `return`:

```tsx
const latestScanLabel = strategyLastScan || formatClockTime(scanBaseTime);
const activeScopeLabel = trackingSection === "strategy"
  ? strategyHistoryMode === "current"
    ? "当前自选策略信号"
    : "全部历史策略信号"
  : trackingSection === "mine"
    ? "我的观察信号"
    : "全市场雷达信号";

const liveEmptyState = {
  title: strategyStatus === "error" ? "策略信号暂时延迟" : "暂无符合条件的策略信号",
  description:
    strategyStatus === "error"
      ? "正在使用最近一次策略数据，新的信号恢复后会自动更新。"
      : "策略引擎没有发现满足当前筛选条件的信号，这不是 AI 判断缺席。",
  meta: [
    `信号来源：Yansir 策略引擎`,
    `最近扫描：${latestScanLabel}`,
    `当前范围：${activeScopeLabel}`,
    `当前筛选：${activeLiveFilter === "now" ? "全部" : activeLiveFilter}`,
  ],
  primaryAction: {
    label: "放宽筛选",
    onClick: () => {
      setActiveLiveFilter("now");
      setSignalFilter("all");
      setStrategyFilterDirection("all");
      setStrategyFilterMinScore("all");
    },
  },
  secondaryAction: {
    label: "查看扫描记录",
    onClick: () => setTrackingSection("strategy"),
  },
};
```

Then pass `emptyState={liveEmptyState}` to `LiveSignalCommand`.

- [ ] **Step 4: Add empty-state CSS**

```css
.live-command__empty {
  gap: 8px;
  padding: 16px;
}

.live-command__empty ul {
  display: grid;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.live-command__empty li {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.live-command__empty-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.live-command__empty-actions button:first-child {
  color: #ffffff;
  background: var(--blue);
  border-color: var(--blue);
}
```

- [ ] **Step 5: Update tests**

In `live-signal-command.test.mjs`, define:

```js
const emptyState = {
  title: "暂无符合条件的策略信号",
  description: "策略引擎没有发现满足当前筛选条件的信号，这不是 AI 判断缺席。",
  meta: ["信号来源：Yansir 策略引擎", "最近扫描：14:30"],
};
```

Pass `emptyState` into every `LiveSignalCommand` render.

Add:

```js
const emptyMarkup = renderToStaticMarkup(
  React.createElement(componentModule.LiveSignalCommand, {
    signals: [],
    activeFilter: "now",
    listeningStatus: "paused",
    emptyState,
    now: Date.parse("2026-07-04T08:03:00.000Z"),
    onFilterChange: () => undefined,
    onSelectSignal: () => undefined,
    onOpenDetail: () => undefined,
    onOpenValueClaw: () => undefined,
    onToggleWatch: () => undefined,
  }),
);

assert.match(emptyMarkup, /暂无符合条件的策略信号/);
assert.match(emptyMarkup, /Yansir 策略引擎/);
assert.doesNotMatch(emptyMarkup, /AI 判断|AI 生成|AI 发出信号/);
```

- [ ] **Step 6: Run verification**

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/radar/LiveSignalCommand.tsx apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/live-signal-command.test.mjs
git commit -m "Clarify radar empty signal states"
```

### Task 4: Complete Signal-To-ValueClaw Context Flow

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

- [ ] **Step 1: Add signal context state in AppShell**

Near other top-level state in `AppShell`, add:

```tsx
const [valueClawSignalContext, setValueClawSignalContext] = useState<LiveSignal | null>(null);
```

Update `handleOpenValueClaw`:

```tsx
function handleOpenValueClaw(signalId: string) {
  const signal = liveSignals.find((item) => item.id === signalId);
  if (signal) {
    setValueClawSignalContext(signal);
    onToast(`${signal.symbol} 的 ValueClaw 复核上下文已准备好`);
  }
  onNavigate("claw");
}
```

Pass into `ValueClawPage`:

```tsx
<ValueClawPage
  currentUser={currentUser}
  rows={rows}
  signals={safeSignals}
  signalContext={valueClawSignalContext}
  onNavigate={navigate}
  onOpenSearch={() => setSearchOpen(true)}
  onOpenSymbol={openSymbol}
  onToast={showToast}
/>
```

- [ ] **Step 2: Extend `ValueClawPage` props**

Change signature:

```tsx
function ValueClawPage({
  currentUser,
  onNavigate,
  onOpenSearch,
  onOpenSymbol,
  onToast,
  rows,
  signalContext,
  signals
}: {
  currentUser: CurrentUser;
  onNavigate: (view: ViewName) => void;
  onOpenSearch: () => void;
  onOpenSymbol: (symbol: string) => void;
  onToast: (message: string) => void;
  rows: MarketRow[];
  signalContext?: LiveSignal | null;
  signals: Signal[];
}) {
```

When `signalContext` changes, prime the input:

```tsx
useEffect(() => {
  if (!signalContext) return;
  setInput(`复核 ${signalContext.symbol} 这条 Yansir 策略信号：方向 ${formatDirectionLabel(signalContext.direction)}，评分 ${signalContext.score}/100，风险 ${signalContext.risk}`);
}, [signalContext?.id]);
```

Import `formatDirectionLabel` if needed:

```ts
import { LiveSignalCommand } from "../features/radar/LiveSignalCommand";
import type { LiveSignal } from "../features/radar/liveSignalModel";
import { formatDirectionLabel } from "../features/radar/liveSignalModel";
```

- [ ] **Step 3: Render pinned context card**

Inside signed-in ValueClaw content, above `.claw-chat-card`, add:

```tsx
{signalContext && (
  <section className="polished-card claw-signal-context" aria-label="当前策略信号上下文">
    <div>
      <span>来自实时雷达</span>
      <strong>{signalContext.symbol}</strong>
      <em>{formatDirectionLabel(signalContext.direction)} · {signalContext.score}/100</em>
    </div>
    <p>{signalContext.trigger}</p>
    <small>ValueClaw 仅解释和复核该策略信号，不创建或覆盖交易方向。</small>
    <button type="button" onClick={() => onOpenSymbol(signalContext.symbol)}>
      查看币种详情
    </button>
  </section>
)}
```

- [ ] **Step 4: Add CSS**

```css
.claw-signal-context {
  display: grid;
  gap: 10px;
}

.claw-signal-context div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.claw-signal-context span,
.claw-signal-context small {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.claw-signal-context strong {
  color: var(--text);
  font-size: 24px;
  font-weight: 950;
}

.claw-signal-context p {
  margin: 0;
  color: #1d2738;
  font-size: 13px;
  line-height: 1.45;
}
```

- [ ] **Step 5: Add test source assertions**

In `live-signal-command.test.mjs`, add source assertions:

```js
assert.match(
  appShellSource,
  /valueClawSignalContext/,
  "ValueClaw should receive selected radar signal context",
);
assert.match(
  appShellSource,
  /ValueClaw 仅解释和复核该策略信号/,
  "ValueClaw signal context must preserve AI boundary copy",
);
```

- [ ] **Step 6: Verify**

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

Browser QA:

- Expand a radar signal when test data is available.
- Click `打开 ValueClaw`.
- Confirm URL becomes `view=claw`.
- Confirm pinned context card shows symbol, direction, score, trigger, and boundary copy.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/live-signal-command.test.mjs
git commit -m "Carry radar signal context into ValueClaw"
```

### Task 5: Add Radar Handoff Context To Coin Detail

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

- [ ] **Step 1: Add symbol handoff state**

In `AppShell`, add:

```tsx
const [symbolSignalContext, setSymbolSignalContext] = useState<LiveSignal | null>(null);
```

Update `handleOpenSignalDetail`:

```tsx
function handleOpenSignalDetail(symbol: string) {
  const signal = liveSignals.find((item) => item.symbol === symbol);
  if (signal) {
    setSymbolSignalContext(signal);
    onOpenSymbol(signal.symbol);
  }
}
```

Update `openSymbol` to clear handoff for normal data-page navigation:

```tsx
function openSymbol(symbol: string) {
  const clean = normalizeDisplaySymbol(symbol);
  if (!clean) return;
  setSymbolSignalContext(null);
  setSelectedSymbol(clean);
  replaceAppUrl("data", clean);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
```

Add a dedicated radar symbol opener:

```tsx
function openSymbolFromRadar(signal: LiveSignal) {
  setSymbolSignalContext(signal);
  setSelectedSymbol(signal.symbol);
  replaceAppUrl("data", signal.symbol);
  window.scrollTo({ top: 0, behavior: "smooth" });
}
```

Then call `openSymbolFromRadar(signal)` from `handleOpenSignalDetail`.

- [ ] **Step 2: Pass context to `SymbolDetailPage`**

```tsx
<SymbolDetailPage
  symbol={selectedSymbol}
  seedRows={rows}
  signals={safeSignals}
  radarSignalContext={
    symbolSignalContext?.symbol === selectedSymbol ? symbolSignalContext : null
  }
  currentUser={currentUser}
  entitlements={entitlements}
  onBack={closeSymbol}
  onNavigate={navigate}
  onToast={showToast}
/>
```

Extend `SymbolDetailPage` props:

```tsx
radarSignalContext?: LiveSignal | null;
```

- [ ] **Step 3: Render handoff card**

Inside `SymbolDetailPage`, immediately after `<header className="polished-symbol-head">...</header>`, add:

```tsx
{radarSignalContext && (
  <section className="polished-card symbol-radar-context" aria-label="实时雷达信号上下文">
    <div>
      <span>来自实时雷达</span>
      <strong>{formatDirectionLabel(radarSignalContext.direction)} · {radarSignalContext.score}/100</strong>
    </div>
    <p>{radarSignalContext.trigger}</p>
    <small>信号来源：Yansir 策略引擎 · ValueClaw 仅用于解释和复核</small>
    <button type="button" onClick={() => onNavigate("claw")}>
      打开 ValueClaw 复核
    </button>
  </section>
)}
```

- [ ] **Step 4: Add CSS**

```css
.symbol-radar-context {
  display: grid;
  gap: 10px;
}

.symbol-radar-context div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.symbol-radar-context span,
.symbol-radar-context small {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.symbol-radar-context strong {
  color: var(--blue);
  font-size: 14px;
  font-weight: 950;
}

.symbol-radar-context p {
  margin: 0;
  color: #1d2738;
  font-size: 13px;
  line-height: 1.45;
}
```

- [ ] **Step 5: Add test source assertions**

```js
assert.match(
  appShellSource,
  /symbolSignalContext/,
  "symbol detail should preserve radar signal handoff context",
);
assert.match(
  appShellSource,
  /来自实时雷达/,
  "symbol detail should label radar handoff context",
);
```

- [ ] **Step 6: Verify**

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

Browser QA:

- From radar, open a signal detail.
- Confirm coin detail page shows a compact `来自实时雷达` context card.
- From data page market list, open a coin detail and confirm the radar context card is not shown.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/live-signal-command.test.mjs
git commit -m "Show radar handoff context on symbol detail"
```

## Phase 2: Public-Beta Quality Fixes

### Task 6: Tighten Product Naming Without Changing Routes

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] **Step 1: Keep route names, adjust user-facing copy only**

Do not rename `ViewName` route keys. Keep:

```ts
"radar" // bottom nav signal page
"signal" // alert center route
"claw" // ValueClaw route
```

Update visible labels so the mental model is consistent:

- Bottom nav `radar`: keep `信号`.
- Bottom nav `signal`: keep `告警`.
- Radar header: make `实时雷达` the dominant heading.
- Tracking section label: change `AI追踪` to `市场追踪`; keep `策略追踪`; keep `我的追踪`.

- [ ] **Step 2: Verify no route regression**

Run:

```powershell
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

- [ ] **Step 3: Browser QA**

Open:

- `http://127.0.0.1:3201/yansir/?view=radar`
- `http://127.0.0.1:3201/yansir/?view=signal`
- `http://127.0.0.1:3201/yansir/?view=claw`

Confirm labels are clear and no page silently falls back to data.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/components/BottomNav.tsx apps/web/src/styles/app.css
git commit -m "Clarify signal and alert product labels"
```

### Task 7: Add Strategy Source And Push Status Chips To Alerts

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`

- [ ] **Step 1: Add display fields in `AlertsPage` rows**

In `AlertsPage`, when rendering alert queue rows, add chips:

```tsx
<div className="alert-source-row">
  <span>实时雷达</span>
  <span>Yansir 策略引擎</span>
  <span>{radarPushEnabled ? "已同步" : "待推送"}</span>
</div>
```

If `radarPushEnabled` is not available in `AlertsPage`, use row-derived copy:

```tsx
<span>{signal.score >= entitlements.minAlertScore ? "已同步" : "观察中"}</span>
```

- [ ] **Step 2: Add CSS**

```css
.alert-source-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.alert-source-row span {
  border: 1px solid #dbe7f5;
  border-radius: 999px;
  padding: 4px 8px;
  color: #64748b;
  background: #f8fbff;
  font-size: 11px;
  font-weight: 850;
}
```

- [ ] **Step 3: Verify**

```powershell
npm.cmd run build:web
```

Browser QA:

- Open `http://127.0.0.1:3201/yansir/?view=signal`.
- Confirm each alert row shows source and push status without crowding the row.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css
git commit -m "Show strategy source in alert center"
```

## Phase 3: QA, Accessibility, And Launch Decision

### Task 8: Browser QA Matrix

**Files:**
- Modify: `docs/audits/2026-07-04-yansir-live-signal-product-audit/findings.md`

- [ ] **Step 1: Verify mobile routes**

Use browser viewport `430x900`:

- `view=radar`
- `view=data`
- `view=data&symbol=UB`
- `view=claw`
- `view=signal`
- `view=valueclaw`
- `view=alerts`

Record pass/fail and screenshots in:

```text
docs/audits/2026-07-04-yansir-live-signal-product-audit/
```

- [ ] **Step 2: Verify desktop radar**

Use browser viewport `1280x900`:

- `view=radar`

Decision:

- If mobile-shell desktop is acceptable for beta, document that beta is mobile-first.
- If not acceptable, create a separate desktop radar plan. Do not mix desktop redesign into this plan.

- [ ] **Step 3: Accessibility checks**

Manual checks:

- Tab through bottom nav, radar filters, row actions, ValueClaw compose, and alert controls.
- Confirm focus is visible.
- Confirm buttons have readable labels.
- Confirm touch targets are not visibly cramped on `430x900`.

- [ ] **Step 4: Final verification**

Run:

```powershell
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:radar-live -w apps/web
npm.cmd run build:web
```

- [ ] **Step 5: Commit QA docs**

```powershell
git add docs/audits/2026-07-04-yansir-live-signal-product-audit
git commit -m "Document live signal product QA"
```

## Out Of Scope For This Plan

- Strategy engine changes.
- New backend ranking logic.
- New database schema.
- Payment, entitlement, and team-admin changes.
- Full desktop command-console redesign.
- Production LLM provider changes for ValueClaw.

## Execution Order

1. Task 1 route aliases
2. Task 2 radar-first layout
3. Task 3 radar empty states
4. Task 4 signal-to-ValueClaw context
5. Task 5 radar-to-coin-detail context
6. Task 6 naming polish
7. Task 7 alert source chips
8. Task 8 QA matrix

Stop after each task if tests fail. Do not bundle multiple task fixes into one commit.
