# Unified Page Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every standard Yansir page use the data page's centered `430px` maximum width while retaining the K-line laboratory as an `1180px` workbench.

**Architecture:** Add a final, explicit page-shell width contract after the legacy CSS cascade so old page-specific overrides cannot win. Keep track-record content inside the shared shell and express the K-line laboratory as the only wide-shell exception.

**Tech Stack:** React 18, TypeScript, Vite, CSS, Node.js source-contract tests.

## Global Constraints

- The shared application shell uses `width: min(100vw, 430px)`.
- Data, AIClaw, Radar, Track Record, Account, Alert, authentication, plans, and team pages inherit the shared shell width.
- The fixed bottom navigation matches the shared shell width.
- The K-line laboratory remains the only `1180px` wide application view.
- Dialogs, sheets, tables, charts, and other content inside a page keep their existing responsive constraints.
- No page may introduce horizontal scrolling.

---

### Task 1: Lock The Shared Width Contract

**Files:**
- Create: `apps/web/tests/page-width-contract.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: final CSS cascade in `src/styles/app.css` and `src/styles/track-record.css`.
- Produces: `npm run test:page-width`, a source contract that prevents page-specific shells from widening again.

- [ ] **Step 1: Write the failing source-contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const appCss = src("src/styles/app.css");
const trackCss = src("src/styles/track-record.css");

assert.match(appCss, /--standard-page-width:\s*430px/);
assert.match(appCss, /\.app-shell\s*\{[^}]*width:\s*min\(100vw,\s*var\(--standard-page-width\)\)/s);
assert.match(appCss, /\.app-shell\.view-kline-lab\s*\{[^}]*width:\s*min\(100vw,\s*1180px\)/s);
assert.doesNotMatch(trackCss, /\.app-shell:has\(\.public-track-record-view\)/);
assert.match(trackCss, /\.public-track-record-view\s*\{[^}]*width:\s*100%/s);

console.log("page width contract passed");
```

Add the package script:

```json
"test:page-width": "node tests/page-width-contract.test.mjs"
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
npm.cmd run test:page-width
```

Working directory: `D:\yansir\apps\web`

Expected: FAIL because the final shared width variable and explicit exception do not exist yet.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add apps/web/tests/page-width-contract.test.mjs apps/web/package.json
git commit -m "test(web): define shared page width contract"
```

---

### Task 2: Apply The Final Shell Width Rules

**Files:**
- Modify: `apps/web/src/styles/app.css`
- Modify: `apps/web/src/styles/track-record.css`
- Test: `apps/web/tests/page-width-contract.test.mjs`

**Interfaces:**
- Consumes: `--standard-page-width` and the source contract from Task 1.
- Produces: one centered standard shell width and one explicit workbench exception.

- [ ] **Step 1: Add the final width contract at the end of `app.css`**

```css
:root {
  --standard-page-width: 430px;
}

.app-shell,
.app-shell.view-claw,
.app-shell.view-radar,
.app-shell.view-signal,
.app-shell.view-account,
.app-shell.view-login,
.app-shell.view-register,
.app-shell.view-plans,
.app-shell.view-team,
.app-shell.view-track-record {
  width: min(100vw, var(--standard-page-width));
  max-width: var(--standard-page-width);
  margin-inline: auto;
}

.app-shell.view-kline-lab {
  width: min(100vw, 1180px);
  max-width: 1180px;
}
```

Keep this block after all legacy page-specific width rules so it owns the final cascade.

- [ ] **Step 2: Keep track-record content inside the shell**

Replace the widening rules in `track-record.css`:

```css
.public-track-record-view {
  width: 100%;
  margin: 0;
}
```

Delete the obsolete selector:

```css
.app-shell:has(.public-track-record-view) {
  width: min(100vw, 1180px);
}
```

In the mobile media rule, keep `.public-track-record-view { width: 100%; }` and preserve its existing padding.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd run test:page-width
```

Expected: `page width contract passed`.

- [ ] **Step 4: Run all web contracts and build**

Run:

```powershell
npm.cmd run test:entitlements
npm.cmd run test:kline-confirmation
npm.cmd run test:kline-realtime
npm.cmd run test:kline-strategy-source
npm.cmd run test:radar-live
npm.cmd run test:claw-layout
npm.cmd run test:track-record
npm.cmd run test:page-width
npm.cmd run test:touch-targets
npm.cmd run test:view-routing
npm.cmd run build
```

Expected: every test prints its pass message and Vite exits with code `0`.

- [ ] **Step 5: Commit the CSS implementation**

```powershell
git add apps/web/src/styles/app.css apps/web/src/styles/track-record.css
git commit -m "style(web): unify standard page widths"
```

---

### Task 3: Verify Responsive Rendering

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the running Vite application at `http://127.0.0.1:3200/yansir/`.
- Produces: browser evidence that all standard views share the same rendered shell width.

- [ ] **Step 1: Inspect standard views at desktop width**

Open each route at a viewport wider than `430px`:

```text
?view=data
?view=claw
?view=radar
?view=track-record
?view=account
```

For each route, evaluate:

```js
({
  shellWidth: document.querySelector(".app-shell")?.getBoundingClientRect().width,
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth
})
```

Expected: `shellWidth === 430` for every standard view and `scrollWidth <= clientWidth`.

- [ ] **Step 2: Inspect mobile width**

Set the viewport to `390 x 844` and repeat the route checks.

Expected: every standard shell is `390px` wide or narrower, with no horizontal overflow and no clipped fixed controls.

- [ ] **Step 3: Verify the K-line exception**

Open `?view=kline-lab` at a desktop viewport.

Expected: its shell may expand up to `1180px`; at mobile width it still fits the viewport without horizontal page overflow.

- [ ] **Step 4: Record the QA result**

Append a `Unified Page Width QA` section to `design-qa.md` containing the tested routes, viewport sizes, measured widths, overflow results, and:

```text
final result: passed
```

- [ ] **Step 5: Commit QA evidence**

```powershell
git add design-qa.md
git commit -m "docs: verify unified page widths"
```
