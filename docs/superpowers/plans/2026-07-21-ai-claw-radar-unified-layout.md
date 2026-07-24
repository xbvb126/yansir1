# AIClaw And Radar Unified Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing AIClaw and Radar mobile views to match the approved unified Yansir layout without changing strategy facts, APIs, entitlements, or routes.

**Architecture:** Keep data fetching, entitlement decisions, and navigation orchestration in `AppShell.tsx`. Extract presentational layout into focused feature components, reuse `LiveSignal` as the Radar source of truth, and pass selected signals into AIClaw as read-only context. Add source/runtime contract tests before each visual change, then verify the finished pages against the approved 390 × 844 reference.

**Tech Stack:** React 18, TypeScript, Vite, Node test scripts, `react-dom/server`, existing Yansir CSS and icon components.

## Global Constraints

- Preserve existing API calls, strategy calculations, permissions, and `view` routing semantics.
- Strategy facts remain authoritative; AIClaw may explain or review but must not overwrite direction, score, price, timeframe, or trigger time.
- Use Yansir cobalt `#2F6BFF`, green for opportunity/online, red for short/risk, and gray for neutral.
- The bottom navigation labels remain exactly `数据 / AIClaw / 雷达 / 告警 / 我的`.
- Use the existing icon system; do not add emoji, hand-authored SVG, CSS-drawn icons, wallet UI, promotional banners, or a red brand system.
- Mobile reference viewport is exactly `390 × 844`; all touch targets must be at least 44px.
- Work around unrelated dirty files. Stage and commit only the files named by each task.

---

## File Structure

- Create `apps/web/src/features/claw/AIClawExperience.tsx`: pure AIClaw layout for overview, quick actions, messages, signal context, login gate, and composer slots.
- Create `apps/web/src/features/claw/aiClawPrompts.ts`: six stable quick-action definitions and prompt construction helpers.
- Create `apps/web/src/features/radar/RadarWorkspaceChrome.tsx`: Radar title/status, source tabs, and horizontally scrollable category filters.
- Modify `apps/web/src/components/AppShell.tsx`: retain state/data effects, connect extracted views, and remove superseded page markup.
- Modify `apps/web/src/features/radar/LiveSignalCommand.tsx`: render compact fact rows and the approved inline evidence/actions.
- Modify `apps/web/src/styles/app.css`: add the unified mobile layout and responsive states in one final override section.
- Create `apps/web/tests/ai-claw-layout.test.mjs`: AIClaw source and server-rendered interaction contract tests.
- Modify `apps/web/tests/live-signal-command.test.mjs`: Radar chrome, row facts, expanded evidence, and actions.
- Modify `apps/web/tests/touch-targets.test.mjs`: enforce 44px targets for new controls.
- Modify `apps/web/package.json`: add `test:claw-layout`.

---

### Task 1: Lock The AIClaw Layout Contract

**Files:**
- Create: `apps/web/tests/ai-claw-layout.test.mjs`
- Modify: `apps/web/package.json`
- Create: `apps/web/src/features/claw/aiClawPrompts.ts`

**Interfaces:**
- Produces: `AI_CLAW_QUICK_ACTIONS: readonly AIClawQuickAction[]`
- Produces: `buildAIClawPrompt(actionId: AIClawQuickActionId, signal?: AIClawSignalContext): string`
- `AIClawQuickActionId` is the union `"market" | "flow" | "signal" | "hot" | "whale" | "sentiment"`.

- [ ] **Step 1: Write the failing prompt and source-contract test**

Create a Node test that imports the prompt module through esbuild and asserts the exact six labels and signal-aware prompt behavior:

```js
assert.deepEqual(
  module.AI_CLAW_QUICK_ACTIONS.map((item) => item.label),
  ["市场概览", "资金流向", "策略信号", "热门代币", "巨鲸动态", "市场情绪"],
);
assert.match(
  module.buildAIClawPrompt("signal", { symbol: "BTC", direction: "long", score: 78 }),
  /BTC.*看多.*78/,
);
assert.equal(module.buildAIClawPrompt("signal"), "解读最近的 Yansir 策略信号");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd run test:claw-layout -w apps/web`

Expected: FAIL because the script, prompt module, and presentation component do not exist.

- [ ] **Step 3: Add the test script and minimal prompt module**

Add this package script:

```json
"test:claw-layout": "node tests/ai-claw-layout.test.mjs"
```

Implement the prompt model without importing `AppShell` types:

```ts
export type AIClawQuickActionId = "market" | "flow" | "signal" | "hot" | "whale" | "sentiment";
export type AIClawSignalContext = { symbol: string; direction: "long" | "short" | "flat"; score: number };

export const AI_CLAW_QUICK_ACTIONS = [
  { id: "market", label: "市场概览", icon: "chart" },
  { id: "flow", label: "资金流向", icon: "trend" },
  { id: "signal", label: "策略信号", icon: "target" },
  { id: "hot", label: "热门代币", icon: "spark" },
  { id: "whale", label: "巨鲸动态", icon: "network" },
  { id: "sentiment", label: "市场情绪", icon: "pulse" },
] as const;
```

`buildAIClawPrompt` must return concrete Chinese prompts for all six ids and include selected signal facts only for `signal`.

- [ ] **Step 4: Run the focused test**

Run: `npm.cmd run test:claw-layout -w apps/web`

Expected: all prompt-module assertions PASS.

- [ ] **Step 5: Commit the prompt contract**

```powershell
git add apps/web/package.json apps/web/tests/ai-claw-layout.test.mjs apps/web/src/features/claw/aiClawPrompts.ts
git commit -m "test(web): define AIClaw layout contract"
```

---

### Task 2: Build The AIClaw Presentation

**Files:**
- Create: `apps/web/src/features/claw/AIClawExperience.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Test: `apps/web/tests/ai-claw-layout.test.mjs`

**Interfaces:**
- Consumes: `AI_CLAW_QUICK_ACTIONS` and `buildAIClawPrompt` from Task 1.
- Produces: `AIClawExperience(props: AIClawExperienceProps): JSX.Element`.
- `AIClawExperienceProps` receives status, signed-in state, insight copy, messages as `ReactNode`, optional signal context as `ReactNode`, input value, loading state, and callbacks for quick action, input, submit, login, help, and clear-context actions.

- [ ] **Step 1: Extend the failing test with server-rendered structure**

Bundle the component with esbuild and `react-dom/server`, render a signed-in fixture, and assert:

```js
assert.match(markup, /AIClaw/);
assert.match(markup, /在线/);
assert.match(markup, /今天想先看什么？/);
assert.match(markup, /市场概览.*资金流向.*策略信号.*热门代币.*巨鲸动态.*市场情绪/s);
assert.match(markup, /信号上下文/);
assert.match(markup, /向 AIClaw 提问/);
```

Render a signed-out fixture and assert that the page structure remains visible together with `登录后使用 AIClaw`.

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm.cmd run test:claw-layout -w apps/web`

Expected: FAIL because `AIClawExperience` is absent.

- [ ] **Step 3: Implement the pure presentation component**

The component must render this semantic outline:

```tsx
<section className="ai-claw-workspace">
  <header className="ai-claw-workspace__header">...</header>
  <section className="ai-claw-overview">...</section>
  <div className="ai-claw-quick-actions">...</div>
  <section className="ai-claw-conversation" aria-live="polite">...</section>
  {signalContext}
  <form className="ai-claw-composer" onSubmit={onSubmit}>...</form>
</section>
```

Use `<SystemIcon>` through a render callback or import the existing exported icon component if available. Do not add new inline SVGs.

- [ ] **Step 4: Replace only the `ValueClawPage` presentation**

Keep `input`, `loading`, `messages`, status effects, `/api/claw/status`, `/api/claw/chat`, fallback blocks, `signalContext`, and `sendMessage` in `AppShell.tsx`. Rename visible copy from `ValueClaw` to `AIClaw` while retaining API and internal route names. Pass the existing message blocks and signal context into `AIClawExperience`.

Quick-action click behavior:

```ts
setInput(buildAIClawPrompt(actionId, signalContext ? {
  symbol: signalContext.symbol,
  direction: signalContext.direction,
  score: signalContext.score,
} : undefined));
```

- [ ] **Step 5: Run focused and route tests**

Run:

```powershell
npm.cmd run test:claw-layout -w apps/web
npm.cmd run test:view-routing -w apps/web
npm.cmd run lint -w apps/web
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit AIClaw presentation**

```powershell
git add apps/web/src/features/claw/AIClawExperience.tsx apps/web/src/components/AppShell.tsx apps/web/tests/ai-claw-layout.test.mjs
git commit -m "feat(web): redesign AIClaw workspace"
```

---

### Task 3: Build The Radar Workspace Chrome

**Files:**
- Create: `apps/web/src/features/radar/RadarWorkspaceChrome.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

**Interfaces:**
- Produces: `RadarWorkspaceChrome(props: RadarWorkspaceChromeProps): JSX.Element`.
- Props include source tab state/callback, listener label, latest scan label, category items, active category/callback, and filter callback.
- Category items use `{ id: string; label: string; count?: number }` and never carry signal facts.

- [ ] **Step 1: Write the failing Radar chrome test**

Bundle and render `RadarWorkspaceChrome` with fixtures, then assert exact source tabs and status:

```js
assert.match(markup, /雷达/);
assert.match(markup, /监听中/);
assert.match(markup, /最后扫描 14:02:00/);
assert.match(markup, /市场异动.*策略信号.*我的/s);
assert.match(markup, /全部.*看多.*看空.*趋势突破.*回调反弹.*成交量异动.*资金异动/s);
assert.match(markup, /aria-label="高级筛选"/);
```

- [ ] **Step 2: Run Radar tests to verify failure**

Run: `npm.cmd run test:radar-live -w apps/web`

Expected: FAIL because `RadarWorkspaceChrome.tsx` does not exist.

- [ ] **Step 3: Implement the Radar chrome component**

Use buttons with `aria-pressed` for category filters and semantic tabs for source switching. The category row must be horizontally scrollable in CSS; the component itself must not truncate items.

- [ ] **Step 4: Integrate it into `RadarPage`**

Replace `ai-track-header` and the redundant visible strategy filter stacks with `RadarWorkspaceChrome`. Keep symbol/timeframe/score controls reachable from the existing advanced-filter button or rule modal. Default source remains `strategy`. Compute listener copy from the existing `strategyStatus` and `strategyRealtime` values; do not create a fake online state.

- [ ] **Step 5: Run focused tests and lint**

Run:

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run lint -w apps/web
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Radar chrome**

```powershell
git add apps/web/src/features/radar/RadarWorkspaceChrome.tsx apps/web/src/components/AppShell.tsx apps/web/tests/live-signal-command.test.mjs
git commit -m "feat(web): add radar workspace controls"
```

---

### Task 4: Reshape Radar Rows And Inline Evidence

**Files:**
- Modify: `apps/web/src/features/radar/LiveSignalCommand.tsx`
- Modify: `apps/web/src/features/radar/liveSignalModel.ts`
- Modify: `apps/web/tests/live-signal-command.test.mjs`

**Interfaces:**
- Consumes: existing `LiveSignal` facts and callbacks.
- Produces: one compact row per signal and one inline evidence panel for the selected id.
- No new signal direction or score calculation is allowed.

- [ ] **Step 1: Add failing markup assertions**

Render strategy fixtures and require the row to expose time, symbol, timeframe, direction, score, trigger price, and expansion state. Require selected actions exactly:

```js
assert.match(markup, /币种详情/);
assert.match(markup, /AIClaw 复核/);
assert.match(markup, /加入观察/);
assert.match(markup, /aria-expanded="true"/);
```

Also assert a risk fixture includes textual `看空` or `风险`, so color is not the sole signal.

- [ ] **Step 2: Run the Radar test to verify failure**

Run: `npm.cmd run test:radar-live -w apps/web`

Expected: FAIL on the new labels and compact fact contract.

- [ ] **Step 3: Implement the compact fact row**

Change each row button to expose this stable order:

```tsx
<time>{formatClock(signal.generatedAt)}</time>
<span className="radar-signal-row__pair">...</span>
<span className="radar-signal-row__timeframe">{signal.timeframe || "--"}</span>
<span className="radar-signal-row__direction">...</span>
<span className="radar-signal-row__score">...</span>
<span className="radar-signal-row__price">...</span>
```

If `LiveSignal` lacks a typed timeframe or trigger-price field, add optional fields populated only from existing payload values in `toLiveSignal`; default to `--`.

- [ ] **Step 4: Simplify the selected panel**

Show at most two evidence statements: trigger reason and one known strategy/market fact. Rename actions to `币种详情`, `AIClaw 复核`, and `加入观察`. Keep the existing callbacks and toggle behavior.

- [ ] **Step 5: Run Radar and touch tests**

Run:

```powershell
npm.cmd run test:radar-live -w apps/web
npm.cmd run test:touch-targets -w apps/web
npm.cmd run lint -w apps/web
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the Radar queue**

```powershell
git add apps/web/src/features/radar/LiveSignalCommand.tsx apps/web/src/features/radar/liveSignalModel.ts apps/web/tests/live-signal-command.test.mjs
git commit -m "feat(web): refine radar signal timeline"
```

---

### Task 5: Apply The Unified Responsive Visual System

**Files:**
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/touch-targets.test.mjs`

**Interfaces:**
- Consumes: class names from Tasks 2–4.
- Produces: a 390 × 844-first responsive layout with a shared surface, spacing, status, filter, row, composer, and bottom-nav system.

- [ ] **Step 1: Extend the failing touch and overflow tests**

Assert the final CSS contains:

```js
assert.match(css, /\.ai-claw-quick-actions[\s\S]*grid-template-columns:\s*repeat\(2,/);
assert.match(css, /\.radar-workspace__filters[\s\S]*overflow-x:\s*auto/);
assert.match(css, /\.ai-claw-composer[\s\S]*min-height:\s*44px/);
assert.match(css, /\.radar-signal-row[\s\S]*min-height:\s*44px/);
```

Add a source assertion that the timeline container does not opt into horizontal scrolling.

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm.cmd run test:touch-targets -w apps/web
npm.cmd run test:claw-layout -w apps/web
npm.cmd run test:radar-live -w apps/web
```

Expected: FAIL on missing final styles.

- [ ] **Step 3: Add one final scoped override section**

Append a clearly marked `AIClaw + Radar unified layout` section. Scope rules under `.view-claw` and `.radar-tracking-screen`; do not globally restyle generic cards or buttons. Use CSS custom properties locally:

```css
.view-claw,
.radar-tracking-screen {
  --workspace-blue: #2f6bff;
  --workspace-bg: #f7f9fc;
  --workspace-line: #e6ebf3;
  --workspace-radius: 12px;
}
```

Implement the exact two-column AIClaw action grid, horizontally scrollable Radar filters, compact timeline rows, selected evidence panel, fixed-safe composer, and consistent 44px controls. At `min-width: 768px`, cap the content width instead of converting Radar into a desktop table.

- [ ] **Step 4: Run the complete web verification**

Run:

```powershell
npm.cmd run test:claw-layout -w apps/web
npm.cmd run test:radar-live -w apps/web
npm.cmd run test:touch-targets -w apps/web
npm.cmd run test:view-routing -w apps/web
npm.cmd run lint -w apps/web
$env:PUBLIC_SITE_ORIGIN='https://example.test/yansir'; npm.cmd run build -w apps/web
```

Expected: every command exits 0 and Vite reports a successful production build.

- [ ] **Step 5: Commit the visual system**

```powershell
git add apps/web/src/styles/app.css apps/web/tests/touch-targets.test.mjs
git commit -m "style(web): unify AIClaw and radar mobile layout"
```

---

### Task 6: Visual QA And Final Regression

**Files:**
- Modify only files from Tasks 2–5 if visual defects are found.
- Reference: `docs/superpowers/specs/assets/ai-claw-radar-unified-layout.png`

**Interfaces:**
- Produces: visually verified AIClaw and Radar pages at the approved mobile viewport.

- [ ] **Step 1: Start the existing local app**

Run: `npm.cmd run dev -w apps/web -- --port 4175`

Expected: Vite serves `/yansir/` on port 4175.

- [ ] **Step 2: Capture both pages at 390 × 844**

Capture:

- `http://127.0.0.1:4175/yansir/?view=radar`
- `http://127.0.0.1:4175/yansir/?view=claw`

Use realistic fixtures or the current API state. Exercise source tabs, category filters, one expanded signal, all three signal actions, all six AIClaw quick actions, signal-context navigation, composer input, login gate, and error/empty states.

- [ ] **Step 3: Compare reference and implementation together**

Create side-by-side comparison inputs using the approved reference and each captured page. Check title baseline, 16px page gutters, action-grid proportions, filter scrolling, row density, selected evidence spacing, 12px radii, icon weight, bottom-nav height, composer safe area, clipping, and horizontal overflow.

- [ ] **Step 4: Fix only visible mismatches and re-capture**

Apply the smallest scoped CSS or markup corrections. Re-run the affected focused test after every correction and repeat the comparison until no material mismatch remains.

- [ ] **Step 5: Run fresh final verification**

Run:

```powershell
npm.cmd run test:claw-layout -w apps/web
npm.cmd run test:radar-live -w apps/web
npm.cmd run test:touch-targets -w apps/web
npm.cmd run test:view-routing -w apps/web
npm.cmd run lint -w apps/web
$env:PUBLIC_SITE_ORIGIN='https://example.test/yansir'; npm.cmd run build -w apps/web
git status --short
```

Expected: tests, type checking, and build exit 0; Git status shows only intentional task changes plus the user's pre-existing unrelated modifications.

- [ ] **Step 6: Commit final QA corrections**

```powershell
git add apps/web/src/components/AppShell.tsx apps/web/src/features/claw/AIClawExperience.tsx apps/web/src/features/radar/RadarWorkspaceChrome.tsx apps/web/src/features/radar/LiveSignalCommand.tsx apps/web/src/styles/app.css apps/web/tests/ai-claw-layout.test.mjs apps/web/tests/live-signal-command.test.mjs apps/web/tests/touch-targets.test.mjs
git commit -m "fix(web): align AIClaw and radar with approved layout"
```
