# Track Record Trust Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public Yansir track-record page around a credibility-first summary while preserving the existing public API, filters, cache, pagination, permissions, and navigation.

**Architecture:** Keep request orchestration and URL/cache state in `PublicTrackRecordView`. Add pure presentation helpers in `publicPerformance.ts` and move the selected layout into focused presentational React components so the data contract and UI can be tested independently. Continue using the existing portal styles and icon system; no new runtime dependency is needed.

**Tech Stack:** React 18, TypeScript, Vite, Node assertion tests, existing Yansir CSS and `SystemIcon` components.

## Global Constraints

- Scope is only the public `track-record` page.
- Preserve existing API, session cache, URL filters, pagination, permissions, login return intent, desktop portal navigation, and five-item mobile bottom navigation.
- Use only `totalSignals`, `completed24hCount`, `pending24hCount`, `directionalHitRate1h`, and `averageDirectionalReturn1h` from the existing public summary.
- Never infer or display a 1h hit numerator because the API does not provide it.
- Anonymous users continue to see only 15m and 1h results; 4h, 24h, MFE, and MAE remain locked.
- Empty or null metrics display `计算中` or `暂无满足公开条件的样本`; never manufacture sample rows or percentages.
- The selected visual target is `docs/superpowers/specs/assets/track-record-trust-dashboard.png`.
- Minimum body text is 14px and every interactive target is at least 44px high.
- Verify 390px, 768px, and 1180px layouts without horizontal page overflow.

---

## File Structure

- Modify `apps/web/src/features/portal/publicPerformance.ts`: pure trust-summary and return-tone presentation helpers.
- Create `apps/web/src/features/portal/TrackRecordPresentation.tsx`: trust summary, filters, record list, methodology disclosure, and state presentation.
- Modify `apps/web/src/features/portal/PublicTrackRecordView.tsx`: retain loading/data flow and compose the new presentation components.
- Modify `apps/web/src/styles/app.css`: selected responsive layout and visual states.
- Modify `apps/web/tests/public-performance.test.mjs`: pure helper coverage.
- Modify `apps/web/tests/public-portal-source.test.mjs`: source contract for the selected hierarchy and preservation of data behavior.
- Modify `apps/web/tests/touch-targets.test.mjs`: explicit 44px interaction checks.

### Task 1: Add Credibility Presentation Helpers

**Files:**
- Modify: `apps/web/src/features/portal/publicPerformance.ts`
- Test: `apps/web/tests/public-performance.test.mjs`

**Interfaces:**
- Consumes: `PublicPerformanceSummary` from `publicPortalApi.ts`.
- Produces: `TrustSummaryView`, `toTrustSummaryView(summary)`, and `publicReturnTone(value)`.

- [ ] **Step 1: Write failing helper tests**

Add these assertions after the existing row assertions in `apps/web/tests/public-performance.test.mjs`:

```js
  const trust = performance.toTrustSummaryView({
    windowDays: 7,
    generatedAt: "2026-07-19T00:00:00.000Z",
    methodologyVersion: "fixed-window-v1",
    totalSignals: 2980,
    completed24hCount: 1842,
    pending24hCount: 1138,
    directionalHitRate1h: 0.618,
    averageDirectionalReturn1h: 0.0042,
  });
  assert.deepEqual(trust, {
    hitRate: "61.8%",
    averageReturn: "+0.42%",
    sampleCount: "2,980",
    sampleCaption: "公开信号样本",
    isEmpty: false,
  });

  const emptyTrust = performance.toTrustSummaryView({
    windowDays: 7,
    generatedAt: "2026-07-19T00:00:00.000Z",
    methodologyVersion: "fixed-window-v1",
    totalSignals: 0,
    completed24hCount: 0,
    pending24hCount: 0,
    directionalHitRate1h: null,
    averageDirectionalReturn1h: null,
  });
  assert.equal(emptyTrust.hitRate, "计算中");
  assert.equal(emptyTrust.averageReturn, "计算中");
  assert.equal(emptyTrust.sampleCaption, "暂无满足公开条件的样本");
  assert.equal(emptyTrust.isEmpty, true);

  assert.equal(performance.publicReturnTone("+0.42%"), "positive");
  assert.equal(performance.publicReturnTone("-0.31%"), "negative");
  assert.equal(performance.publicReturnTone("计算中"), "neutral");
  assert.equal(performance.publicReturnTone("会员解锁"), "locked");
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
npm.cmd run test:public-performance -w apps/web
```

Expected: FAIL because `toTrustSummaryView` and `publicReturnTone` are not exported.

- [ ] **Step 3: Implement the pure helpers**

Change the import and add the following code in `apps/web/src/features/portal/publicPerformance.ts`:

```ts
import type { PublicPerformanceSummary, PublicSignal } from "./publicPortalApi";

export type TrustSummaryView = {
  hitRate: string;
  averageReturn: string;
  sampleCount: string;
  sampleCaption: string;
  isEmpty: boolean;
};

function formatPercent(value: number | null | undefined, digits: number, signed: boolean) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "计算中";
  const percent = value * 100;
  const sign = signed && percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits)}%`;
}

export function toTrustSummaryView(summary: PublicPerformanceSummary): TrustSummaryView {
  const isEmpty = summary.totalSignals === 0;
  return {
    hitRate: formatPercent(summary.directionalHitRate1h, 1, false),
    averageReturn: formatPercent(summary.averageDirectionalReturn1h, 2, true),
    sampleCount: summary.totalSignals.toLocaleString("en-US"),
    sampleCaption: isEmpty ? "暂无满足公开条件的样本" : "公开信号样本",
    isEmpty,
  };
}

export function publicReturnTone(value: string): "positive" | "negative" | "neutral" | "locked" {
  if (value === "会员解锁") return "locked";
  if (value.startsWith("+")) return "positive";
  if (value.startsWith("-")) return "negative";
  return "neutral";
}
```

Keep the existing `formatPublicPercent` export unchanged because row formatting tests rely on two decimal places.

- [ ] **Step 4: Run the focused test and confirm the green state**

Run:

```powershell
npm.cmd run test:public-performance -w apps/web
```

Expected: `public performance tests passed`.

- [ ] **Step 5: Commit the helper layer**

```powershell
git add apps/web/src/features/portal/publicPerformance.ts apps/web/tests/public-performance.test.mjs
git commit -m "feat(web): add track record trust presentation helpers"
```

### Task 2: Build Focused Track Record Presentation Components

**Files:**
- Create: `apps/web/src/features/portal/TrackRecordPresentation.tsx`
- Modify: `apps/web/tests/public-portal-source.test.mjs`

**Interfaces:**
- Consumes: `PublicPerformanceSummary`, `TrackRecordRow`, `TrustSummaryView`, callbacks already owned by `PublicTrackRecordView`.
- Produces: `TrackRecordHero`, `TrustSummary`, `TrackRecordFilters`, `TrackRecordList`, `MethodologyDisclosure`, and `TrackRecordState`.

- [ ] **Step 1: Add failing source-contract tests**

In `apps/web/tests/public-portal-source.test.mjs`, read the new file and add explicit hierarchy assertions:

```js
const trackPresentation = src("src/features/portal/TrackRecordPresentation.tsx");

assert.match(trackPresentation, /export function TrustSummary/);
assert.match(trackPresentation, /1h 方向命中率/);
assert.match(trackPresentation, /公开信号样本/);
assert.match(trackPresentation, /平均方向收益/);
assert.match(trackPresentation, /export function TrackRecordFilters/);
assert.match(trackPresentation, /全部方向/);
assert.match(trackPresentation, /export function TrackRecordList/);
assert.match(trackPresentation, /最近公开信号/);
assert.match(trackPresentation, /固定窗口，不挑样本/);
assert.match(trackPresentation, /<details/);
assert.doesNotMatch(trackPresentation, /命中样本|1842|2980/);
```

- [ ] **Step 2: Run the source test and confirm the red state**

Run:

```powershell
npm.cmd run test:portal-source -w apps/web
```

Expected: FAIL because `TrackRecordPresentation.tsx` does not exist.

- [ ] **Step 3: Create the presentational component module**

Create `apps/web/src/features/portal/TrackRecordPresentation.tsx` with this implementation:

```tsx
import type { FormEvent } from "react";
import { SystemIcon } from "../../components/SystemIcon";
import { publicReturnTone, toTrustSummaryView, type TrackRecordRow } from "./publicPerformance";
import type { PublicPerformanceSummary } from "./publicPortalApi";

export function TrackRecordHero({ delayHours, historyDays }: { delayHours: number | null; historyDays: number | null }) {
  return (
    <header className="track-record-heading">
      <div>
        <span className="portal-eyebrow">可验证的公开记录</span>
        <h1 id="track-record-title">历史战绩</h1>
        <p>基于公开信号的真实执行记录，数据可验证。</p>
      </div>
      <span className="track-record-verified" aria-label="公开数据范围">
        <SystemIcon name="shield" />
        {delayHours === null || historyDays === null ? "公开范围读取中" : `${historyDays} 天记录 · 延迟 ${delayHours} 小时`}
      </span>
    </header>
  );
}

export function TrustSummary({ summary }: { summary: PublicPerformanceSummary }) {
  const view = toTrustSummaryView(summary);
  return (
    <section className={`track-trust-summary ${view.isEmpty ? "is-empty" : ""}`} aria-labelledby="track-trust-title">
      <h2 id="track-trust-title">可信度总览</h2>
      <div className="track-trust-grid">
        <article className="track-trust-primary">
          <span>1h 方向命中率</span>
          <strong>{view.hitRate}</strong>
          <small>{view.sampleCaption} · {view.sampleCount}</small>
        </article>
        <article>
          <span><SystemIcon name="database" />公开信号</span>
          <strong>{view.sampleCount}<small> 条</small></strong>
        </article>
        <article>
          <span><SystemIcon name="target" />平均方向收益</span>
          <strong className={publicReturnTone(view.averageReturn)}>{view.averageReturn}</strong>
        </article>
      </div>
    </section>
  );
}

type FilterProps = {
  symbolDraft: string;
  direction: "all" | "long" | "short";
  onSymbolDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onDirectionChange: (direction: "all" | "long" | "short") => void;
};

export function TrackRecordFilters(props: FilterProps) {
  return (
    <section className="track-record-controls" aria-label="战绩筛选">
      <form onSubmit={props.onSubmit}>
        <label><span>币种</span><input value={props.symbolDraft} onChange={(event) => props.onSymbolDraftChange(event.target.value)} placeholder="BTC / ETH / SOL" /></label>
        <button type="submit">筛选</button>
      </form>
      <div role="group" aria-label="方向筛选">
        {(["all", "long", "short"] as const).map((item) => (
          <button className={props.direction === item ? "active" : ""} key={item} type="button" onClick={() => props.onDirectionChange(item)}>
            {item === "all" ? "全部方向" : item === "long" ? "看多" : "看空"}
          </button>
        ))}
      </div>
    </section>
  );
}

export function TrackRecordList({ rows, hasMore, loadingMore, onLoadMore }: { rows: TrackRecordRow[]; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void }) {
  return (
    <section className="track-record-ledger" aria-labelledby="track-ledger-title">
      <div className="track-record-ledger-head"><h2 id="track-ledger-title">最近公开信号</h2><span>固定窗口复盘</span></div>
      <div className="track-record-list">
        {rows.map((row) => (
          <article className="track-record-row" key={row.id}>
            <div><strong>{row.symbol}</strong><small>{new Date(row.time).toLocaleString("zh-CN", { hour12: false })}</small></div>
            <div><span className={`track-direction ${row.direction}`}>{row.direction === "long" ? "看多" : "看空"}</span><small>{row.score} 分</small></div>
            <div><span className={`track-completion ${row.completionStatus}`}>{row.completionStatus === "completed" ? "已完成" : "待完成"}</span><strong className={publicReturnTone(row.return1h)}>{row.return1h}</strong><small>1h</small></div>
          </article>
        ))}
      </div>
      {hasMore && <button className="portal-retry-button" type="button" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "加载中…" : "加载更多"}</button>}
    </section>
  );
}

export function MethodologyDisclosure() {
  return (
    <details className="track-methodology-disclosure">
      <summary><SystemIcon name="target" /><span><strong>固定窗口，不挑样本</strong><small>查看统计口径与公开字段范围</small></span></summary>
      <div>
        <p>每条信号按 15m、1h、4h、24h 到期时间统一复盘。</p>
        <p>匿名用户仅查看 15m / 1h；4h、24h、MFE、MAE 为会员字段。</p>
        <p>延迟和历史范围由 API 返回，不使用客户端计时替代服务端约束。</p>
      </div>
    </details>
  );
}
```

The implementation uses only existing `shield`, `database`, and `target` icon names; do not add new SVG artwork.

- [ ] **Step 4: Run the source test and TypeScript lint**

Run:

```powershell
npm.cmd run test:portal-source -w apps/web
npm.cmd run lint -w apps/web
```

Expected: source test passes and TypeScript exits 0. Resolve any error inside `TrackRecordPresentation.tsx` before committing.

- [ ] **Step 5: Commit the presentational module**

```powershell
git add apps/web/src/features/portal/TrackRecordPresentation.tsx apps/web/tests/public-portal-source.test.mjs
git commit -m "feat(web): add track record trust presentation"
```

### Task 3: Recompose the Public Track Record Page

**Files:**
- Modify: `apps/web/src/features/portal/PublicTrackRecordView.tsx`
- Modify: `apps/web/tests/public-portal-source.test.mjs`

**Interfaces:**
- Consumes: all components from `TrackRecordPresentation.tsx`.
- Produces: the selected trust-first page while preserving `load`, `submitSymbol`, cache, pagination, unavailable-state retry, and `onUnlock` behavior.

- [ ] **Step 1: Add failing integration-contract assertions**

Add to `apps/web/tests/public-portal-source.test.mjs`:

```js
assert.match(track, /<TrackRecordHero/);
assert.match(track, /<TrustSummary/);
assert.match(track, /<TrackRecordFilters/);
assert.match(track, /<TrackRecordList/);
assert.match(track, /<MethodologyDisclosure/);
assert.match(track, /onUnlock\(\{ symbol, direction \}\)/);
assert.match(track, /pagination\.nextPage/);
assert.match(track, /void load\(pagination\.nextPage/);
assert.doesNotMatch(track, /track-summary-grid/);
assert.doesNotMatch(track, /track-methodology">/);
```

- [ ] **Step 2: Run the source test and confirm the red state**

Run:

```powershell
npm.cmd run test:portal-source -w apps/web
```

Expected: FAIL because the page still renders the old hero, summary grid, table, and methodology block.

- [ ] **Step 3: Import and compose the new components**

Add this import to `PublicTrackRecordView.tsx`:

```ts
import { MethodologyDisclosure, TrackRecordFilters, TrackRecordHero, TrackRecordList, TrustSummary } from "./TrackRecordPresentation";
```

Delete the local `formatMetric` function. Keep `formatTime` for the stale-cache notice. Replace the existing returned markup with:

```tsx
  return (
    <section className="view active-view public-track-record-view" aria-labelledby="track-record-title">
      <TrackRecordHero delayHours={delayHours} historyDays={historyDays} />
      {summary && <TrustSummary summary={summary} />}
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
          <SystemIcon name="target" /><div><strong>暂无满足公开条件的样本</strong><p>可清空币种或切换方向后重试；系统不会补造信号。</p></div>
        </div>
      )}
      {displayState.kind === "unavailable" && (
        <div className={`track-unavailable ${displayState.cached.length ? "stale" : ""}`} role="alert">
          <div><strong>{displayState.cached.length ? "数据已过期" : "公开战绩暂时不可用"}</strong><p>{displayState.cached.length ? `最后成功更新时间 ${formatTime(displayState.staleAt)}` : displayState.message}</p></div>
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
```

- [ ] **Step 4: Run page contract, performance, and lint checks**

Run:

```powershell
npm.cmd run test:portal-source -w apps/web
npm.cmd run test:public-performance -w apps/web
npm.cmd run lint -w apps/web
```

Expected: both test scripts print `passed`; TypeScript exits 0.

- [ ] **Step 5: Commit the page composition**

```powershell
git add apps/web/src/features/portal/PublicTrackRecordView.tsx apps/web/tests/public-portal-source.test.mjs
git commit -m "feat(web): recompose public track record page"
```

### Task 4: Implement the Selected Responsive Visual System

**Files:**
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/touch-targets.test.mjs`

**Interfaces:**
- Consumes: class names emitted by Task 2 and Task 3.
- Produces: responsive mobile-first trust dashboard at 390px, 768px, and 1180px.

- [ ] **Step 1: Extend failing touch-target tests**

Add these assertions to `apps/web/tests/touch-targets.test.mjs`:

```js
assertMinHeightAtLeast(".track-record-controls button", 44);
assertMinHeightAtLeast(".track-methodology-disclosure summary", 44);
assertMinHeightAtLeast(".track-record-unlock", 44);
```

- [ ] **Step 2: Run the touch-target test and confirm the red state**

Run:

```powershell
npm.cmd run test:touch-targets -w apps/web
```

Expected: FAIL because the new selectors do not yet have explicit CSS blocks with `min-height`.

- [ ] **Step 3: Replace the old public track-record CSS section**

In `apps/web/src/styles/app.css`, replace the block beginning at `/* Public Track Record */` through its existing mobile media query with rules that implement this structure:

```css
.public-track-record-view {
  width: min(100% - 24px, 1180px);
  margin: 0 auto;
  padding: 28px 0 112px;
  color: #12213d;
}

.track-record-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 10px 4px 24px;
  border-bottom: 1px solid #e7edf6;
}

.track-record-heading h1 { margin: 8px 0; font-size: clamp(38px, 7vw, 64px); line-height: 1; letter-spacing: -0.05em; }
.track-record-heading p { margin: 0; color: #70809a; font-size: 15px; }
.track-record-verified { display: inline-flex; align-items: center; gap: 8px; color: #617492; font-size: 13px; font-weight: 700; }
.track-record-verified .system-icon { width: 28px; height: 28px; color: #2568ef; }

.track-trust-summary { margin-top: 22px; }
.track-trust-summary h2 { margin: 0 0 14px; font-size: 24px; }
.track-trust-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(180px, .7fr);
  grid-template-rows: 1fr 1fr;
  overflow: hidden;
  border: 1px solid #dbe6f6;
  border-radius: 24px;
  background: linear-gradient(135deg, #fff, #f7fbff);
}
.track-trust-grid article { display: grid; align-content: center; gap: 8px; padding: 22px; }
.track-trust-grid article:not(.track-trust-primary) + article { border-top: 1px solid #e4ebf6; }
.track-trust-primary { grid-row: 1 / -1; border-right: 1px solid #e4ebf6; }
.track-trust-grid span { color: #40516e; font-size: 14px; font-weight: 700; }
.track-trust-grid span .system-icon { width: 20px; height: 20px; margin-right: 8px; vertical-align: middle; }
.track-trust-grid strong { font-size: clamp(28px, 6vw, 42px); letter-spacing: -0.04em; }
.track-trust-primary strong { color: #099b73; font-size: clamp(52px, 11vw, 82px); }
.track-trust-grid strong small { font-size: 14px; letter-spacing: 0; }
.track-trust-grid small { color: #8290a7; font-size: 12px; }
.track-trust-grid .positive { color: #099b73; }
.track-trust-grid .negative { color: #d44855; }

.track-record-controls { display: flex; justify-content: space-between; gap: 16px; margin-top: 22px; }
.track-record-controls form, .track-record-controls > div { display: flex; align-items: flex-end; gap: 8px; }
.track-record-controls label { display: grid; gap: 6px; color: #61708b; font-size: 12px; }
.track-record-controls input, .track-record-controls button { min-height: 44px; border: 1px solid #dbe3ef; border-radius: 12px; }
.track-record-controls input { width: min(260px, 48vw); padding: 0 14px; color: #12213d; background: #fff; }
.track-record-controls button { padding: 0 17px; color: #253755; background: #fff; font-weight: 750; }
.track-record-controls button.active, .track-record-controls form button { border-color: #102343; color: #fff; background: #102343; }

.track-record-ledger { margin-top: 30px; }
.track-record-ledger-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.track-record-ledger-head h2 { margin: 0; font-size: 22px; }
.track-record-ledger-head span { color: #8390a5; font-size: 12px; }
.track-record-list { border-top: 1px solid #e5ebf4; }
.track-record-row { display: grid; grid-template-columns: minmax(0, 1.2fr) .7fr .7fr; gap: 16px; align-items: center; min-height: 84px; padding: 14px 6px; border-bottom: 1px solid #e5ebf4; }
.track-record-row > div { display: grid; gap: 4px; }
.track-record-row > div:last-child { justify-items: end; text-align: right; }
.track-record-row strong, .track-record-row small { display: block; }
.track-record-row small { color: #8390a5; font-size: 12px; }
.track-record-row .positive { color: #099b73; }
.track-record-row .negative { color: #d44855; }
.track-completion { font-size: 12px; font-weight: 800; }
.track-completion.completed { color: #098c68; }
.track-completion.pending { color: #6e7f9b; }

.track-methodology-disclosure { margin-top: 20px; border-radius: 14px; background: #f7f9fc; }
.track-methodology-disclosure summary { display: flex; min-height: 44px; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; }
.track-methodology-disclosure summary span, .track-methodology-disclosure summary strong, .track-methodology-disclosure summary small { display: block; }
.track-methodology-disclosure summary small { margin-top: 2px; color: #8090a8; }
.track-methodology-disclosure > div { display: grid; gap: 8px; padding: 0 16px 16px 46px; color: #64748d; font-size: 14px; line-height: 1.55; }
.track-methodology-disclosure p { margin: 0; }
.track-record-unlock { min-height: 44px; margin-top: 18px; }

@media (max-width: 720px) {
  .public-track-record-view { width: min(100% - 20px, 1180px); padding-top: 18px; }
  .track-record-heading { align-items: center; }
  .track-record-heading p { max-width: 280px; }
  .track-record-verified { max-width: 108px; text-align: right; }
  .track-trust-grid { grid-template-columns: minmax(0, 1.2fr) minmax(116px, .8fr); border-radius: 20px; }
  .track-trust-grid article { padding: 18px 16px; }
  .track-record-controls { align-items: stretch; flex-direction: column; }
  .track-record-controls form, .track-record-controls > div { width: 100%; }
  .track-record-controls label { flex: 1; }
  .track-record-controls input { width: 100%; }
  .track-record-controls > div button { flex: 1; padding: 0 10px; }
}

@media (max-width: 430px) {
  .track-record-heading h1 { font-size: 42px; }
  .track-record-verified { font-size: 11px; }
  .track-trust-primary strong { font-size: 54px; }
  .track-trust-grid strong { font-size: 26px; }
  .track-record-row { grid-template-columns: minmax(0, 1.25fr) .65fr .65fr; gap: 8px; }
}
```

If an existing global rule conflicts, append a selector scoped by `.public-track-record-view` rather than using `!important`.

- [ ] **Step 4: Run touch-target and TypeScript checks**

Run:

```powershell
npm.cmd run test:touch-targets -w apps/web
npm.cmd run lint -w apps/web
```

Expected: touch target tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit the responsive styling**

```powershell
git add apps/web/src/styles/app.css apps/web/tests/touch-targets.test.mjs
git commit -m "style(web): match track record trust dashboard"
```

### Task 5: Verify Product Behavior and Visual Fidelity

**Files:**
- Modify only if verification exposes a defect: files from Tasks 1–4.

**Interfaces:**
- Consumes: completed track-record implementation.
- Produces: passing web test/build evidence and same-viewport reference comparison.

- [ ] **Step 1: Run the complete relevant web test suite**

Run:

```powershell
npm.cmd run test:public-performance -w apps/web
npm.cmd run test:portal-source -w apps/web
npm.cmd run test:portal-runtime -w apps/web
npm.cmd run test:portal-routing -w apps/web
npm.cmd run test:touch-targets -w apps/web
npm.cmd run build -w apps/web
```

Expected: every script exits 0 and Vite reports a successful production build.

- [ ] **Step 2: Verify the live page at the mobile viewport**

Open `http://127.0.0.1:60326/yansir/?view=track-record` in the in-app browser and inspect at 390 × 844. Verify:

```text
Title, credibility summary, total sample context, average directional return,
symbol filter, direction filter, and the start of recent records appear without
horizontal overflow. Empty data shows “暂无满足公开条件的样本”; it does not show
mock rows or generated metrics.
```

- [ ] **Step 3: Compare implementation and selected source together**

Capture the 390 × 844 implementation. Place it beside `docs/superpowers/specs/assets/track-record-trust-dashboard.png` in one comparison image and inspect:

```text
Compare hierarchy, spacing, typography scale, corner radii, borders, color use,
bottom-nav clearance, filter wrapping, and whether the primary metric dominates.
Fix visible mismatches that do not require unsupported data or new functionality.
```

- [ ] **Step 4: Verify intermediate and desktop widths**

Inspect at 768px and 1180px. Confirm the controls remain readable, the desktop list/table treatment does not overflow the page, methodology stays secondary, and bottom navigation/desktop header behavior remains unchanged.

- [ ] **Step 5: Commit verification fixes, if any**

If files changed:

```powershell
git add apps/web/src/features/portal/publicPerformance.ts apps/web/src/features/portal/TrackRecordPresentation.tsx apps/web/src/features/portal/PublicTrackRecordView.tsx apps/web/src/styles/app.css apps/web/tests/public-performance.test.mjs apps/web/tests/public-portal-source.test.mjs apps/web/tests/touch-targets.test.mjs
git commit -m "fix(web): close track record visual review gaps"
```

If no files changed, record the commands and visual comparison result in the task handoff without creating an empty commit.
