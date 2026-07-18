# Yansir Public Product Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first public Yansir portal where anonymous visitors can understand the product, browse public market data, use an eight-hour delayed radar, inspect a transparent track record, compare plans, and preview AI Claw without sending AI requests.

**Architecture:** Extend the existing query-based SPA with `home` and `track-record` views, but keep portal units outside the large `AppShell.tsx`. Reuse `GET /api/strategy/public-signals` for delayed ledger rows and add one read-only aggregate endpoint for public performance. Keep delay and locked-field enforcement on the server, while small pure frontend modules own routing, return intent, navigation, access prompts, formatting, and metadata.

**Tech Stack:** React 18, TypeScript, Vite 5, NestJS 10, PostgreSQL, Node `assert`, esbuild, existing CSS design system.

## Global Constraints

- The strategy engine creates signals; AI Claw only explains and reviews them.
- Anonymous radar data is delayed server-side by exactly eight hours.
- Anonymous public history is limited to seven days.
- Anonymous per-record performance exposes 15-minute and one-hour values only; 4-hour, 24-hour, MFE, and MAE remain locked.
- AI Claw remains the second mobile navigation item.
- Mobile bottom navigation order is Market, AI Claw, Radar, Track Record, My.
- Desktop top navigation order is Home, Market, AI Claw, Radar, Track Record, Plans.
- Mobile interactive targets are at least 44 by 44 CSS pixels.
- Never fabricate signal rows or profitable examples when public data is empty.
- Preserve existing `valueclaw`, `alerts`, and `signals` route aliases.
- Preserve unrelated user changes already present in the working tree.
- Do not change strategy rules, TradingView parity, signal scoring, or signal lifecycle semantics.

---

## File Map

### New web files

- `apps/web/src/features/portal/portalNavigation.ts`: canonical public destinations and responsive navigation models.
- `apps/web/src/features/portal/returnIntent.ts`: one-time login/upgrade return-intent serialization.
- `apps/web/src/features/portal/accessBoundary.ts`: pure action-access decision model.
- `apps/web/src/features/portal/ResponsivePrimaryNav.tsx`: desktop top navigation and mobile brand/home header.
- `apps/web/src/features/portal/PublicHomeView.tsx`: approved public-home sequence.
- `apps/web/src/features/portal/PublicClawPreview.tsx`: anonymous, non-interactive AI Claw preview.
- `apps/web/src/features/portal/publicPortalApi.ts`: typed public-signals and summary reads.
- `apps/web/src/features/portal/publicPerformance.ts`: public performance types, formatting, and pending/stale helpers.
- `apps/web/src/features/portal/PublicTrackRecordView.tsx`: summary, ledger, methodology, locked fields, and failure states.
- `apps/web/src/features/portal/publicMetadata.ts`: per-view document metadata and canonical URL updates.
- `apps/web/tests/portal-routing.test.mjs`: routing, navigation, return intent, and action-access tests.
- `apps/web/tests/public-performance.test.mjs`: formatting and aggregate-view-model tests.
- `apps/web/tests/public-portal-source.test.mjs`: component and integration source assertions.
- `apps/web/scripts/generate-public-metadata.mjs`: deterministic `robots.txt` and `sitemap.xml` generation.

### Modified web files

- `apps/web/src/components/BottomNav.tsx`: add Home/Track Record types and approved mobile order.
- `apps/web/src/components/AppShell.tsx`: coordinate new views, anonymous AI Claw preview, return intent, and responsive navigation.
- `apps/web/src/lib/viewRouting.ts`: add canonical views and default Home.
- `apps/web/src/lib/planAccess.ts`: make Home and Track Record public while leaving real AI Claw guarded.
- `apps/web/src/styles/app.css`: portal layout, desktop navigation, locked values, stale states, and responsive rules.
- `apps/web/tests/view-routing.test.mjs`: assert new default/canonical views.
- `apps/web/tests/plan-access.test.mjs`: assert new public destinations and AI Claw guard.
- `apps/web/tests/touch-targets.test.mjs`: assert portal and navigation targets.
- `apps/web/package.json`: add portal tests and metadata prebuild.
- `apps/web/index.html`: neutral initial metadata before client route synchronization.
- `.env.example`: document `PUBLIC_SITE_ORIGIN`.

### Modified API files

- `apps/api/src/modules/strategy/strategy.controller.ts`: expose `GET /api/strategy/public-performance-summary`.
- `apps/api/src/modules/strategy/strategy.service.ts`: aggregate the seven-day delayed public window.
- `apps/api/tests/strategy-contract.test.mjs`: verify SQL boundaries, mapping, empty database behavior, and locked rows.

### Documentation

- `docs/API_CONTRACTS.md`: document the public signals and performance summary contracts.
- `docs/PRODUCTION_CHECKLIST.md`: add site origin, robots, sitemap, and public-route checks.

---

### Task 1: Canonical Views, Navigation Model, and Return Intent

**Files:**
- Create: `apps/web/src/features/portal/portalNavigation.ts`
- Create: `apps/web/src/features/portal/returnIntent.ts`
- Create: `apps/web/src/features/portal/accessBoundary.ts`
- Create: `apps/web/tests/portal-routing.test.mjs`
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/lib/viewRouting.ts`
- Modify: `apps/web/src/lib/planAccess.ts`
- Modify: `apps/web/tests/view-routing.test.mjs`
- Modify: `apps/web/tests/plan-access.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `ViewName` with `home` and `track-record`.
- Produces: `mobilePrimaryItems`, `desktopPrimaryItems`, and `isPublicPortalView(view)`.
- Produces: `ReturnIntent`, `saveReturnIntent`, `readReturnIntent`, and `consumeReturnIntent`.
- Produces: `accessDecision(requirement, identity)` for later portal controls.

- [ ] **Step 1: Write failing routing and portal-model tests**

Create `apps/web/tests/portal-routing.test.mjs` with a shared esbuild helper and these assertions:

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-portal-routing");
mkdirSync(outDir, { recursive: true });
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

function bundle(entry, name) {
  const outfile = path.join(outDir, `${name}.mjs`);
  execFileSync(process.execPath, [esbuildBin, entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], { cwd: root });
  return import(pathToFileURL(outfile));
}

try {
  const navigation = await bundle("src/features/portal/portalNavigation.ts", "navigation");
  assert.deepEqual(navigation.mobilePrimaryItems.map((item) => item.view), ["data", "claw", "radar", "track-record", "account"]);
  assert.deepEqual(navigation.desktopPrimaryItems.map((item) => item.view), ["home", "data", "claw", "radar", "track-record", "plans"]);
  assert.equal(navigation.isPublicPortalView("home"), true);
assert.equal(navigation.isPublicPortalView("track-record"), true);
assert.equal(navigation.isPublicPortalView("claw"), true);
  assert.equal(navigation.isPublicPortalView("admin"), false);

  const intent = await bundle("src/features/portal/returnIntent.ts", "return-intent");
  const storage = new Map();
  const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  intent.saveReturnIntent(adapter, { view: "radar", symbol: "BTC", signalId: "sig-1", filters: { direction: "long" }, action: "save-watchlist" });
  assert.equal(intent.readReturnIntent(adapter)?.signalId, "sig-1");
  assert.equal(intent.consumeReturnIntent(adapter)?.view, "radar");
  assert.equal(intent.readReturnIntent(adapter), null);

  const access = await bundle("src/features/portal/accessBoundary.ts", "access");
  assert.deepEqual(access.accessDecision("ai-claw", { signedIn: false, plan: "Guest" }), { allowed: false, next: "login" });
  assert.deepEqual(access.accessDecision("realtime-radar", { signedIn: false, plan: "Guest" }), { allowed: false, next: "login" });
  assert.deepEqual(access.accessDecision("realtime-radar", { signedIn: true, plan: "Free" }), { allowed: false, next: "plans" });
  assert.deepEqual(access.accessDecision("save-watchlist", { signedIn: true, plan: "Free" }), { allowed: true, next: null });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("portal routing tests passed");
```

Extend `apps/web/tests/view-routing.test.mjs`:

```js
assert.equal(module.normalizeViewParam("home"), "home");
assert.equal(module.normalizeViewParam("track-record"), "track-record");
assert.equal(module.normalizeViewParam(null), "home");
assert.equal(module.normalizeViewParam("unknown"), "home");
```

Extend `apps/web/tests/plan-access.test.mjs`:

```js
assert.equal(routeAccessPrompt("home", guest, freeEntitlements), null);
assert.equal(routeAccessPrompt("track-record", guest, freeEntitlements), null);
assert.equal(routeAccessPrompt("claw", guest, freeEntitlements), null, "guest route renders the AI Claw preview; sending a prompt is guarded inside the page");
```

Add to `apps/web/package.json`:

```json
"test:portal-routing": "node tests/portal-routing.test.mjs"
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```powershell
npm run test:portal-routing -w apps/web
npm run test:view-routing -w apps/web
npm run test:entitlements -w apps/web
```

Expected: portal test fails because the new files do not exist; view routing fails because null still resolves to `data`.

- [ ] **Step 3: Implement the navigation and access model**

In `portalNavigation.ts` define:

```ts
import type { ViewName } from "../../components/BottomNav";

export type PrimaryNavItem = { label: string; view: ViewName };

export const mobilePrimaryItems: PrimaryNavItem[] = [
  { label: "市场", view: "data" },
  { label: "AI Claw", view: "claw" },
  { label: "雷达", view: "radar" },
  { label: "战绩", view: "track-record" },
  { label: "我的", view: "account" }
];

export const desktopPrimaryItems: PrimaryNavItem[] = [
  { label: "首页", view: "home" },
  { label: "市场", view: "data" },
  { label: "AI Claw", view: "claw" },
  { label: "雷达", view: "radar" },
  { label: "战绩", view: "track-record" },
  { label: "套餐", view: "plans" }
];

const publicPortalViews = new Set<ViewName>(["home", "data", "claw", "radar", "track-record", "plans"]);
export function isPublicPortalView(view: ViewName) { return publicPortalViews.has(view); }
```

In `returnIntent.ts` define a storage adapter so tests do not require DOM globals:

```ts
import type { ViewName } from "../../components/BottomNav";

const RETURN_INTENT_KEY = "yansir.returnIntent.v1";
export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReturnIntent = { view: ViewName; symbol?: string; signalId?: string; filters?: Record<string, string>; action: string };

export function saveReturnIntent(storage: StorageAdapter, intent: ReturnIntent) { storage.setItem(RETURN_INTENT_KEY, JSON.stringify(intent)); }
export function readReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  try { return JSON.parse(storage.getItem(RETURN_INTENT_KEY) || "null") as ReturnIntent | null; } catch { return null; }
}
export function consumeReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  const value = readReturnIntent(storage); storage.removeItem(RETURN_INTENT_KEY); return value;
}
```

In `accessBoundary.ts` define the explicit requirements:

```ts
export type AccessRequirement = "ai-claw" | "realtime-radar" | "save-watchlist" | "full-performance";
export type AccessIdentity = { signedIn: boolean; plan: string };
export type AccessDecision = { allowed: boolean; next: "login" | "plans" | null };

export function accessDecision(requirement: AccessRequirement, identity: AccessIdentity): AccessDecision {
  if (!identity.signedIn) return { allowed: false, next: "login" };
  if (requirement === "save-watchlist") return identity.signedIn ? { allowed: true, next: null } : { allowed: false, next: "login" };
  if (requirement === "ai-claw") return identity.signedIn ? { allowed: true, next: null } : { allowed: false, next: "login" };
  const paid = /vip|svip|pro/i.test(identity.plan);
  return paid ? { allowed: true, next: null } : { allowed: false, next: "plans" };
}
```

Add `home` and `track-record` to `ViewName` and canonical routing. Make Home, Market, the AI Claw preview route, Radar, Track Record, and Plans non-blocking at the route level; actions inside those pages keep their own access checks. Make null and unknown routes resolve to `home`. Replace the hard-coded `BottomNav` item list with `mobilePrimaryItems`.

- [ ] **Step 4: Run focused tests**

Run the three commands from Step 2.

Expected: all print their `... tests passed` messages.

- [ ] **Step 5: Commit Task 1**

```powershell
git add apps/web/src/features/portal/portalNavigation.ts apps/web/src/features/portal/returnIntent.ts apps/web/src/features/portal/accessBoundary.ts apps/web/src/components/BottomNav.tsx apps/web/src/lib/viewRouting.ts apps/web/src/lib/planAccess.ts apps/web/tests/portal-routing.test.mjs apps/web/tests/view-routing.test.mjs apps/web/tests/plan-access.test.mjs apps/web/package.json
git commit -m "feat(web): add public portal routing model"
```

---

### Task 2: Responsive Primary Navigation and Context-Preserving Access

**Files:**
- Create: `apps/web/src/features/portal/ResponsivePrimaryNav.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/public-portal-source.test.mjs`
- Modify: `apps/web/tests/touch-targets.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `desktopPrimaryItems`, `mobilePrimaryItems`, `saveReturnIntent`, `consumeReturnIntent`.
- Produces: `<ResponsivePrimaryNav activeView currentUser onNavigate />`.
- Produces: `navigateWithRequirement(requirement, intent)` behavior inside `AppShell`.

- [ ] **Step 1: Write source and touch-target tests**

Create `apps/web/tests/public-portal-source.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const nav = src("src/features/portal/ResponsivePrimaryNav.tsx");
const shell = src("src/components/AppShell.tsx");

assert.match(nav, /desktopPrimaryItems/);
assert.match(nav, /aria-current/);
assert.match(nav, /onNavigate\("home"\)/);
assert.match(shell, /consumeReturnIntent/);
assert.match(shell, /saveReturnIntent/);
assert.match(shell, /ResponsivePrimaryNav/);
```

Extend `touch-targets.test.mjs`:

```js
assertMinHeightAtLeast(".portal-brand-button", 44);
assertMinHeightAtLeast(".desktop-primary-nav button", 44);
assertMinHeightAtLeast(".bottom-nav button", 44);
```

Add scripts:

```json
"test:portal-source": "node tests/public-portal-source.test.mjs"
```

- [ ] **Step 2: Verify tests fail**

Run:

```powershell
npm run test:portal-source -w apps/web
npm run test:touch-targets -w apps/web
```

Expected: source test fails because `ResponsivePrimaryNav.tsx` is absent.

- [ ] **Step 3: Implement responsive navigation**

Create the component with this contract:

```tsx
import type { ViewName } from "../../components/BottomNav";
import { desktopPrimaryItems } from "./portalNavigation";

export function ResponsivePrimaryNav({ activeView, currentUser, onNavigate }: {
  activeView: ViewName;
  currentUser: { id?: string; name?: string };
  onNavigate: (view: ViewName) => void;
}) {
  return (
    <header className="portal-primary-header">
      <button className="portal-brand-button" type="button" onClick={() => onNavigate("home")}>Yansir</button>
      <nav className="desktop-primary-nav" aria-label="主导航">
        {desktopPrimaryItems.map((item) => (
          <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => onNavigate(item.view)}>{item.label}</button>
        ))}
      </nav>
      <button className="portal-account-button" type="button" onClick={() => onNavigate(currentUser.id ? "account" : "login")}>{currentUser.id ? "我的" : "登录 / 注册"}</button>
    </header>
  );
}
```

In `AppShell`, render the header for all non-admin/non-lab views. Before redirecting a restricted action, save intent. After `handleLogin`, `handleRegister`, or successful entitlement refresh, consume and restore it. Do not consume intent on failed authentication.

Add explicit CSS blocks with `min-height: 44px`; hide `.desktop-primary-nav` below the existing desktop breakpoint and retain `.bottom-nav` on mobile. Hide `.bottom-nav` on desktop.

- [ ] **Step 4: Run focused tests and web build**

```powershell
npm run test:portal-source -w apps/web
npm run test:touch-targets -w apps/web
npm run build -w apps/web
```

Expected: tests pass and Vite build completes.

- [ ] **Step 5: Commit Task 2**

```powershell
git add apps/web/src/features/portal/ResponsivePrimaryNav.tsx apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/public-portal-source.test.mjs apps/web/tests/touch-targets.test.mjs apps/web/package.json
git commit -m "feat(web): add responsive portal navigation"
```

---

### Task 3: Public Performance Summary API

**Files:**
- Modify: `apps/api/src/modules/strategy/strategy.controller.ts`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `docs/API_CONTRACTS.md`

**Interfaces:**
- Produces: `GET /api/strategy/public-performance-summary`.
- Produces: `PublicPerformanceSummary` with a seven-day window and completed/pending counts.
- Consumes: existing `signal_events` and `signal_performance` tables.

- [ ] **Step 1: Write failing API contract tests**

Extend the test service factory to accept a database override, then add:

```js
async function testPublicPerformanceSummaryUsesDelayedSevenDayWindow() {
  let capturedSql = "";
  const database = {
    enabled: true,
    query: async (sql) => {
      capturedSql = sql;
      return [{ total_signals: "12", completed_24h_count: "9", pending_24h_count: "3", directional_hit_rate_1h: "0.666666", average_directional_return_1h: "0.0125" }];
    }
  };
  const { service } = createService(strategyResult, database);
  const summary = await service.getPublicPerformanceSummary();
  assert.match(capturedSql, /interval '8 hours'/);
  assert.match(capturedSql, /interval '7 days'/);
  assert.match(capturedSql, /direction in \('long', 'short'\)/);
  assert.match(capturedSql, /market_observation/);
  assert.deepEqual(summary, {
    windowDays: 7,
    generatedAt: summary.generatedAt,
    methodologyVersion: "fixed-window-v1",
    totalSignals: 12,
    completed24hCount: 9,
    pending24hCount: 3,
    directionalHitRate1h: 0.666666,
    averageDirectionalReturn1h: 0.0125
  });
}

async function testPublicPerformanceSummaryIsEmptyWithoutDatabase() {
  const { service } = createService();
  const summary = await service.getPublicPerformanceSummary();
  assert.equal(summary.totalSignals, 0);
  assert.equal(summary.directionalHitRate1h, null);
}
```

Call both tests in the existing `try` block.

Change the existing test factory at its declaration and database assignment:

```js
function createService(result = strategyResult, databaseOverride = null) {
  // keep the existing strategyClient, marketService, signalsService, and alertsService setup
  const database = databaseOverride ?? { enabled: false, query: async () => [] };
  return {
    service: new StrategyService(strategyClient, marketService, signalsService, alertsService, usersService(), database),
    savedSignals
  };
}
```

- [ ] **Step 2: Run the contract test and verify failure**

```powershell
npm run test:strategy-contract -w apps/api
```

Expected: fail because `getPublicPerformanceSummary` does not exist.

- [ ] **Step 3: Implement the service and controller endpoint**

Add to `StrategyService`:

```ts
async getPublicPerformanceSummary() {
  const empty = {
    windowDays: 7 as const,
    generatedAt: new Date().toISOString(),
    methodologyVersion: "fixed-window-v1",
    totalSignals: 0,
    completed24hCount: 0,
    pending24hCount: 0,
    directionalHitRate1h: null as number | null,
    averageDirectionalReturn1h: null as number | null
  };
  if (!this.database.enabled) return empty;
  const [row] = await this.database.query<Record<string, string | null>>(`
    select
      count(*)::text as total_signals,
      count(sp.return_24h)::text as completed_24h_count,
      (count(*) - count(sp.return_24h))::text as pending_24h_count,
      avg(case when sp.return_1h is null then null when se.direction = 'short' and sp.return_1h < 0 then 1 when se.direction <> 'short' and sp.return_1h > 0 then 1 else 0 end)::text as directional_hit_rate_1h,
      avg(case when sp.return_1h is null then null when se.direction = 'short' then -sp.return_1h else sp.return_1h end)::text as average_directional_return_1h
    from signal_events se
    left join signal_performance sp on sp.signal_event_id = se.id
    where se.emitted_at <= now() - interval '8 hours'
      and se.emitted_at >= now() - interval '7 days'
      and se.direction in ('long', 'short')
      and coalesce(se.signal_type, '') <> 'market_observation'
  `);
  return {
    ...empty,
    totalSignals: Number(row?.total_signals || 0),
    completed24hCount: Number(row?.completed_24h_count || 0),
    pending24hCount: Number(row?.pending_24h_count || 0),
    directionalHitRate1h: nullableNumber(row?.directional_hit_rate_1h),
    averageDirectionalReturn1h: nullableNumber(row?.average_directional_return_1h)
  };
}
```

Add to the controller:

```ts
@Get("public-performance-summary")
getPublicPerformanceSummary() {
  return this.strategyService.getPublicPerformanceSummary();
}
```

Document both anonymous endpoints and locked fields in `docs/API_CONTRACTS.md`.

- [ ] **Step 4: Run API tests and build**

```powershell
npm run test:strategy-contract -w apps/api
npm run build -w apps/api
```

Expected: contract test passes and TypeScript build succeeds.

- [ ] **Step 5: Commit Task 3**

```powershell
git add apps/api/src/modules/strategy/strategy.controller.ts apps/api/src/modules/strategy/strategy.service.ts apps/api/tests/strategy-contract.test.mjs docs/API_CONTRACTS.md
git commit -m "feat(api): add public performance summary"
```

---

### Task 4: Public Portal Data and Performance View Model

**Files:**
- Create: `apps/web/src/features/portal/publicPortalApi.ts`
- Create: `apps/web/src/features/portal/publicPerformance.ts`
- Create: `apps/web/tests/public-performance.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `PublicSignal`, `PublicSignalsResponse`, and `PublicPerformanceSummary` types.
- Produces: `getPublicSignals(query)` and `getPublicPerformanceSummary()`.
- Produces: `toTrackRecordRow`, `formatPublicPercent`, and `publicPerformanceState`.

- [ ] **Step 1: Write failing pure-function tests**

Create `public-performance.test.mjs` using the Task 1 bundle helper pattern:

```js
const performance = await bundle("src/features/portal/publicPerformance.ts", "public-performance");
const row = performance.toTrackRecordRow({
  id: "sig-1", symbol: "BTC", direction: "long", score: 82, time: "2026-07-18T00:00:00.000Z",
  performance: { returns: { "15m": 0.01, "1h": -0.005, "4h": null, "24h": null }, outcomeStatus: "pending", access: { previewOnly: true, lockedFields: ["4h", "24h"] } }
});
assert.equal(row.return15m, "+1.00%");
assert.equal(row.return1h, "-0.50%");
assert.equal(row.return24h, "会员解锁");
assert.equal(row.pending, true);
assert.deepEqual(performance.publicPerformanceState({ loading: false, error: null, staleAt: null, rows: [] }), { kind: "empty" });
assert.equal(performance.formatPublicPercent(null), "计算中");
```

Add:

```json
"test:public-performance": "node tests/public-performance.test.mjs"
```

- [ ] **Step 2: Verify failure**

```powershell
npm run test:public-performance -w apps/web
```

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement typed API and pure formatting**

`publicPortalApi.ts` must call only:

```ts
apiGet<PublicSignalsResponse>(`/api/strategy/public-signals?${params}`)
apiGet<PublicPerformanceSummary>("/api/strategy/public-performance-summary")
```

`publicPerformance.ts` must explicitly return `会员解锁` for locked values and `计算中` for absent unlocked values. It must not infer 24-hour results from 15-minute or one-hour values.

Use these types:

```ts
export type PublicSignal = { id: string; symbol: string; rawSymbol: string; direction: "long" | "short"; score: number; time: string; title: string; reason: string; engine?: string; performance: { returns: Record<string, number | null>; outcomeStatus?: string | null; access?: { previewOnly: boolean; lockedFields: string[] } } | null };
export type PublicSignalsResponse = { signals: PublicSignal[]; delayHours: 8; historyDays: 7; access: { performancePreviewOnly: true; lockedPerformanceFields: string[] }; pagination: { page: number; limit: number; total: number; hasMore: boolean; nextPage: number | null } };
export type PublicPerformanceSummary = { windowDays: 7; generatedAt: string; methodologyVersion: string; totalSignals: number; completed24hCount: number; pending24hCount: number; directionalHitRate1h: number | null; averageDirectionalReturn1h: number | null };
export type TrackRecordRow = { id: string; symbol: string; direction: string; score: number; time: string; return15m: string; return1h: string; return24h: "会员解锁" | string; pending: boolean };
```

- [ ] **Step 4: Run focused test and web typecheck**

```powershell
npm run test:public-performance -w apps/web
npm run lint -w apps/web
```

Expected: test passes and TypeScript reports no errors.

- [ ] **Step 5: Commit Task 4**

```powershell
git add apps/web/src/features/portal/publicPortalApi.ts apps/web/src/features/portal/publicPerformance.ts apps/web/tests/public-performance.test.mjs apps/web/package.json
git commit -m "feat(web): add public portal data model"
```

---

### Task 5: Public Home and Anonymous AI Claw Preview

**Files:**
- Create: `apps/web/src/features/portal/PublicHomeView.tsx`
- Create: `apps/web/src/features/portal/PublicClawPreview.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/public-portal-source.test.mjs`

**Interfaces:**
- Consumes: one eligible public signal, public summary, current user, and `onNavigate`.
- Produces: Home CTA flow to Radar and Track Record.
- Produces: anonymous AI Claw preview with no AI API side effect.

- [ ] **Step 1: Add failing source assertions**

Append:

```js
const home = src("src/features/portal/PublicHomeView.tsx");
const claw = src("src/features/portal/PublicClawPreview.tsx");
assert.match(home, /体验公开雷达/);
assert.match(home, /策略引擎/);
assert.match(home, /AI Claw/);
assert.match(home, /查看历史战绩/);
assert.doesNotMatch(home, /胜率\s*80|平均收益\s*65/);
assert.match(claw, /示例问题/);
assert.match(claw, /登录后使用 AI Claw/);
assert.doesNotMatch(claw, /apiPost|fetch\(/);
assert.match(shell, /currentUser\.id\s*\?\s*<ValueClawPage/);
assert.match(shell, /<PublicClawPreview/);
```

- [ ] **Step 2: Verify source test fails**

```powershell
npm run test:portal-source -w apps/web
```

Expected: fail because both components are absent.

- [ ] **Step 3: Implement the approved Home sequence**

`PublicHomeView` renders, in order:

1. hero and reassurance
2. three user questions
3. real public signal example or honest empty state
4. strategy → AI Claw → alert/review flow
5. Free/VIP/SVIP summary
6. final Radar CTA

Use props rather than fetching internally:

```tsx
export function PublicHomeView({ featuredSignal, onNavigate }: { featuredSignal: PublicSignal | null; onNavigate: (view: ViewName) => void })
```

The signal card must render `暂无可展示的延迟信号` when `featuredSignal` is null.

- [ ] **Step 4: Implement anonymous AI Claw branching**

In `AppShell` render:

```tsx
{view === "claw" && (currentUser.id
  ? <ValueClawPage /* existing props */ />
  : <PublicClawPreview onLogin={() => navigateWithRequirement("ai-claw", { view: "claw", action: "ai-claw" })} />)}
```

Do not call the existing Claw status or conversation APIs from the preview component.

- [ ] **Step 5: Run source test and web build**

```powershell
npm run test:portal-source -w apps/web
npm run build -w apps/web
```

Expected: both pass.

- [ ] **Step 6: Commit Task 5**

```powershell
git add apps/web/src/features/portal/PublicHomeView.tsx apps/web/src/features/portal/PublicClawPreview.tsx apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/public-portal-source.test.mjs
git commit -m "feat(web): add public home and AI Claw preview"
```

---

### Task 6: Public Track Record and Anonymous Portal Integration

**Files:**
- Create: `apps/web/src/features/portal/PublicTrackRecordView.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/tests/public-portal-source.test.mjs`
- Modify: `apps/web/tests/plan-access.test.mjs`

**Interfaces:**
- Consumes: `getPublicSignals`, `getPublicPerformanceSummary`, and `toTrackRecordRow`.
- Produces: Track Record summary, rows, methodology, locked values, filters, and failure states.
- Preserves: existing Market, Radar, Plans, and authenticated route behavior.

- [ ] **Step 1: Add failing Track Record assertions**

Append:

```js
const track = src("src/features/portal/PublicTrackRecordView.tsx");
assert.match(track, /fixed-window-v1|固定窗口/);
assert.match(track, /completed24hCount/);
assert.match(track, /pending24hCount/);
assert.match(track, /会员解锁/);
assert.match(track, /数据已过期/);
assert.match(track, /重新加载/);
assert.match(shell, /view === "track-record"/);
const portalApi = src("src/features/portal/publicPortalApi.ts");
assert.match(portalApi, /\/api\/strategy\/public-signals/);
```

- [ ] **Step 2: Verify failure**

```powershell
npm run test:portal-source -w apps/web
```

Expected: fail because `PublicTrackRecordView.tsx` is absent.

- [ ] **Step 3: Implement the Track Record state machine**

The component state is explicit:

```ts
type TrackRecordLoadState =
  | { kind: "loading" }
  | { kind: "ready"; summary: PublicPerformanceSummary; rows: TrackRecordRow[]; staleAt: string | null }
  | { kind: "empty"; summary: PublicPerformanceSummary }
  | { kind: "unavailable"; message: string; cached: TrackRecordRow[]; staleAt: string | null };
```

When a previous successful response exists, preserve it in session storage and render `数据已过期 · 最后成功更新时间 {time}` after a failed refresh. When no cache exists, render an unavailable state and retry button. Filters must survive retry.

- [ ] **Step 4: Integrate anonymous Market, Radar, Track Record, and Plans**

In `AppShell`:

- load `/api/strategy/public-signals` when no authenticated user is available;
- never call `/api/strategy/signals` or realtime start endpoints for Guest;
- pass Guest signals to Radar and Home;
- render Track Record from the public API module;
- keep Market public but route save-watchlist actions through `saveReturnIntent` and Login;
- keep Plans public and prevent anonymous order creation until Login;
- display the API-provided `delayHours` rather than a hard-coded client-only badge.

- [ ] **Step 5: Run portal, entitlement, radar, and build checks**

```powershell
npm run test:portal-source -w apps/web
npm run test:public-performance -w apps/web
npm run test:entitlements -w apps/web
npm run test:radar-live -w apps/web
npm run build -w apps/web
```

Expected: all pass.

- [ ] **Step 6: Commit Task 6**

```powershell
git add apps/web/src/features/portal/PublicTrackRecordView.tsx apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/tests/public-portal-source.test.mjs apps/web/tests/plan-access.test.mjs
git commit -m "feat(web): add public track record portal"
```

---

### Task 7: Metadata, Crawlability, Accessibility, and Production States

**Files:**
- Create: `apps/web/src/features/portal/publicMetadata.ts`
- Create: `apps/web/scripts/generate-public-metadata.mjs`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/index.html`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tests/public-portal-source.test.mjs`
- Modify: `apps/web/tests/touch-targets.test.mjs`
- Modify: `.env.example`
- Modify: `docs/PRODUCTION_CHECKLIST.md`

**Interfaces:**
- Produces: `syncPublicMetadata(view, location)`.
- Produces: build-generated `apps/web/public/robots.txt` and `apps/web/public/sitemap.xml`.
- Consumes: `PUBLIC_SITE_ORIGIN`, which includes the deployed `/yansir` base when applicable.

- [ ] **Step 1: Add failing metadata and accessibility assertions**

Append to the source test:

```js
const metadata = src("src/features/portal/publicMetadata.ts");
assert.match(metadata, /track-record/);
assert.match(metadata, /canonical/);
assert.match(metadata, /og:title/);
assert.match(shell, /syncPublicMetadata/);
```

Extend touch tests:

```js
assertMinHeightAtLeast(".portal-primary-action", 44);
assertMinHeightAtLeast(".track-record-filter button", 44);
assertMinHeightAtLeast(".portal-retry-button", 44);
```

- [ ] **Step 2: Verify failure**

```powershell
npm run test:portal-source -w apps/web
npm run test:touch-targets -w apps/web
```

Expected: fail because metadata module and CSS selectors are absent.

- [ ] **Step 3: Implement per-view metadata**

Use an explicit map:

```ts
const PUBLIC_METADATA = {
  home: { title: "Yansir | 可解释的加密策略信号", description: "实时扫描市场，由策略引擎生成信号，AI Claw 负责解释与复核。" },
  data: { title: "市场数据 | Yansir", description: "浏览公开加密市场概览与币种数据。" },
  radar: { title: "延迟策略雷达 | Yansir", description: "查看延迟八小时的真实 Yansir 策略信号。" },
  "track-record": { title: "历史战绩 | Yansir", description: "按固定窗口查看完整公开信号样本与计算方法。" },
  plans: { title: "套餐 | Yansir", description: "比较 Free、VIP 和 SVIP 的延迟、战绩、告警、API 与团队权益。" }
} as const;
```

Update title, description, canonical link, `og:title`, `og:description`, and `og:url` on canonical view changes. Use `document.documentElement.lang = "zh-CN"`.

- [ ] **Step 4: Generate robots and sitemap from one origin**

`generate-public-metadata.mjs` must:

- require `PUBLIC_SITE_ORIGIN` in production;
- default to `http://localhost:3200/yansir` outside production;
- write UTF-8 `robots.txt` pointing to `${origin}/sitemap.xml`;
- write absolute sitemap URLs only for Home, Market, Radar, Track Record, and Plans;
- exclude Account, Login, Admin, Team, Alerts, AI Claw conversation, and K-line Lab.

Add to `apps/web/package.json`:

```json
"prebuild": "node scripts/generate-public-metadata.mjs"
```

Add `PUBLIC_SITE_ORIGIN=http://localhost:3200/yansir` to `.env.example`, with production guidance in `docs/PRODUCTION_CHECKLIST.md`.

- [ ] **Step 5: Complete responsive and state styling**

Add explicit focus-visible styles, 44-pixel targets, mobile single-column reflow, desktop two-column content where approved, locked-value semantics without blur, `aria-live` status containers, and a 200% zoom check. Do not use color alone for pending, stale, positive, or unfavorable states.

- [ ] **Step 6: Run metadata, touch, build, and static-file checks**

```powershell
npm run test:portal-source -w apps/web
npm run test:touch-targets -w apps/web
$env:PUBLIC_SITE_ORIGIN='https://example.test/yansir'; npm run build -w apps/web
Get-Content -Raw apps/web/public/robots.txt
Get-Content -Raw apps/web/public/sitemap.xml
```

Expected: tests and build pass; generated files contain `https://example.test/yansir` and only the five public destinations.

- [ ] **Step 7: Commit Task 7**

```powershell
git add apps/web/src/features/portal/publicMetadata.ts apps/web/scripts/generate-public-metadata.mjs apps/web/src/components/AppShell.tsx apps/web/src/styles/app.css apps/web/index.html apps/web/package.json apps/web/tests/public-portal-source.test.mjs apps/web/tests/touch-targets.test.mjs apps/web/public/robots.txt apps/web/public/sitemap.xml .env.example docs/PRODUCTION_CHECKLIST.md
git commit -m "feat(web): finish public portal metadata and accessibility"
```

---

### Task 8: Full Regression and Handoff Verification

**Files:**
- Modify only if a verification failure requires a scoped fix: files from Tasks 1-7.
- Update: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: one verified public-portal release candidate with documented manual checks.

- [ ] **Step 1: Run the complete web test set**

```powershell
npm run test:portal-routing -w apps/web
npm run test:portal-source -w apps/web
npm run test:public-performance -w apps/web
npm run test:view-routing -w apps/web
npm run test:entitlements -w apps/web
npm run test:radar-live -w apps/web
npm run test:touch-targets -w apps/web
npm run test:kline-confirmation -w apps/web
npm run test:kline-realtime -w apps/web
npm run test:kline-strategy-source -w apps/web
npm run build -w apps/web
```

Expected: every test prints a pass message and the build completes.

- [ ] **Step 2: Run API and plan regression checks**

```powershell
npm run test:strategy-contract -w apps/api
npm run test:entitlements -w apps/api
npm run build -w apps/api
npm run test:ci-config
```

Expected: all pass.

- [ ] **Step 3: Run the local portal flow**

Start the existing services in hidden background processes and retain their process IDs for cleanup:

```powershell
$apiProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev:api') -WorkingDirectory 'D:\yansir' -WindowStyle Hidden -PassThru
$webProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev:web') -WorkingDirectory 'D:\yansir' -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3101/api/health' -TimeoutSec 2 | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3200/yansir/?view=home' -TimeoutSec 2 | Out-Null
    break
  } catch {
    if ($attempt -eq 29) { throw }
    Start-Sleep -Seconds 1
  }
}
```

In the local browser verify these exact routes and states:

- `/yansir/?view=home`: Home renders and CTA opens Radar.
- `/yansir/?view=data`: anonymous Market renders; save action requests Login.
- `/yansir/?view=claw`: anonymous preview renders and sends no network request to `/api/claw`.
- `/yansir/?view=radar`: response shows `delayHours: 8`; no realtime endpoint is called.
- `/yansir/?view=track-record`: summary and rows render; 4h/24h/MFE/MAE values remain locked.
- `/yansir/?view=plans`: plan comparison is public; order creation requires Login.
- Mobile navigation order matches the approved five items.
- Desktop top navigation order matches the approved six items.
- Login returns to the original route, filters, selected symbol, and requested action.

- [ ] **Step 4: Verify failure and accessibility states manually**

Using browser network blocking or a stopped API, verify:

- no-signal state differs from paused/degraded;
- pending performance is excluded from completed counts;
- stale cached data includes the last successful timestamp;
- unavailable state has a retry button;
- keyboard focus returns to the triggering control after a prompt closes;
- 200% zoom does not create horizontal scrolling for the Home, Radar, and Track Record core flows.

After the manual pass, stop only the two captured processes:

```powershell
Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue
Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
```

- [ ] **Step 5: Record the checks in the launch checklist**

Add a `Public Product Portal` section to `docs/LAUNCH_CHECKLIST.md` with checked commands and the six exact route checks from Step 3. Record failures as unchecked items with the exact failing command; do not mark them complete speculatively.

- [ ] **Step 6: Commit verification documentation and any scoped fixes**

```powershell
git add docs/LAUNCH_CHECKLIST.md
# If a verification fix was required, add only its exact reviewed path, for example:
# git add apps/web/src/features/portal/PublicTrackRecordView.tsx
git diff --cached --name-only
git commit -m "test: verify public product portal"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated pre-existing user changes.

---

## Plan Completion Gate

The implementation is complete only when:

- all eight task commits exist;
- the full verification commands in Task 8 pass;
- anonymous AI Claw produces no AI network request;
- public signals are delayed on the server by eight hours;
- anonymous responses contain no locked per-record performance values;
- the user can sign in or upgrade and return to the original context;
- mobile and desktop navigation match the approved order;
- the launch checklist contains evidence from the final run.
