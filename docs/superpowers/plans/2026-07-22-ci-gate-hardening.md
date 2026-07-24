# CI Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing pull-request gate execute every core suite and prevent the plan E2E runner from reusing unrelated HTTP services.

**Architecture:** Extract API and Web identity checks into a small dependency-free ESM module, test it with real local HTTP servers, and inject those checks into the existing runner. Aggregate the repository's explicit API, Web, and Python commands at the root so the existing GitHub workflow remains the single auditable gate.

**Tech Stack:** Node.js ESM, native `fetch`, native `node:http`, npm workspaces, Python `unittest`, GitHub Actions.

## Global Constraints

- Do not alter production API behavior, strategy logic, page layouts, or deployment commands.
- Do not stage or modify the user's existing uncommitted Web and strategy parity files.
- A 404, invalid JSON, unrelated HTML, or timed-out request must never satisfy readiness.
- Use explicit test command lists; do not discover test files with globs.
- Keep the current `test:plans:ci` workflow entrypoint and plan E2E coverage.

---

### Task 1: Service identity checks

**Files:**
- Create: `infra/service-readiness.mjs`
- Create: `tests/ci-service-readiness.test.mjs`

**Interfaces:**
- Produces: `isExpectedApi(url, options?) -> Promise<boolean>`
- Produces: `isExpectedWeb(url, options?) -> Promise<boolean>`
- `options.timeoutMs` is an optional positive timeout in milliseconds.

- [ ] **Step 1: Write the failing readiness tests**

Create real HTTP fixtures in `tests/ci-service-readiness.test.mjs`. Cover an API health payload `{ status: "ok", database: { connected: false } }`, an unrelated JSON object, a 404 response, valid Vite-style HTML with `<script type="module" src="/assets/index.js">`, and unrelated successful HTML without a module asset. Import the wished-for functions from `../infra/service-readiness.mjs` and assert the expected booleans.

- [ ] **Step 2: Run the readiness test and verify RED**

Run: `node tests/ci-service-readiness.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `infra/service-readiness.mjs`.

- [ ] **Step 3: Implement the minimal readiness module**

Implement `infra/service-readiness.mjs` with one bounded request helper. `isExpectedApi` must require `response.ok`, JSON content, `payload.status === "ok"`, and an object-valued `payload.database`. `isExpectedWeb` must require `response.ok`, HTML content, and a module-script source ending in `.js` with an optional query string.

```js
export async function isExpectedApi(url, options = {}) {
  const response = await fetchWithTimeout(url, options.timeoutMs);
  if (!response?.ok) return false;
  try {
    const payload = await response.json();
    return payload?.status === 'ok' && payload.database !== null && typeof payload.database === 'object';
  } catch {
    return false;
  }
}

export async function isExpectedWeb(url, options = {}) {
  const response = await fetchWithTimeout(url, options.timeoutMs);
  if (!response?.ok) return false;
  const html = await response.text();
  return /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+\.js(?:\?[^"']*)?["'][^>]*>/i.test(html)
    || /<script\b[^>]*\bsrc=["'][^"']+\.js(?:\?[^"']*)?["'][^>]*\btype=["']module["'][^>]*>/i.test(html);
}
```

The private fetch helper must abort after `timeoutMs ?? 1500`, clear its timer, and return `null` on request errors.

- [ ] **Step 4: Verify GREEN**

Run: `node tests/ci-service-readiness.test.mjs`

Expected: `CI service readiness tests passed`.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- infra/service-readiness.mjs tests/ci-service-readiness.test.mjs
git commit -m "test(ci): validate E2E service identity"
```

### Task 2: Use identity checks in the E2E runner

**Files:**
- Modify: `infra/run-plan-e2e-ci.mjs:1-50`
- Modify: `tests/ci-service-readiness.test.mjs`

**Interfaces:**
- Consumes: `isExpectedApi` and `isExpectedWeb` from Task 1.
- Preserves: existing environment variables, start/stop behavior, and 30-second readiness deadline.

- [ ] **Step 1: Extend the failing test with runner wiring assertions**

Read `infra/run-plan-e2e-ci.mjs` as text and assert that it imports both readiness functions, calls `isExpectedApi(healthUrl)`, and calls `isExpectedWeb(webBaseUrl)`. Assert that the old generic `isReachable` function is absent.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/ci-service-readiness.test.mjs`

Expected: FAIL because the runner still calls `isReachable`.

- [ ] **Step 3: Inject the readiness checks**

Import the functions at the top of `infra/run-plan-e2e-ci.mjs`. In `ensureApi`, use `isExpectedApi(healthUrl)` both before reuse and inside `waitFor`. In `ensureWeb`, use `isExpectedWeb(webBaseUrl)` both before reuse and inside `waitFor`. Change `waitFor` to accept an async predicate and remove the generic `isReachable` function.

```js
async function waitFor(check, url, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await check(url)) return;
    await delay(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node tests/ci-service-readiness.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- infra/run-plan-e2e-ci.mjs tests/ci-service-readiness.test.mjs
git commit -m "fix(ci): reject unrelated E2E services"
```

### Task 3: Connect every core suite to the CI gate

**Files:**
- Modify: `tests/ci-plan-permissions.test.mjs`
- Create: `infra/run-strategy-tests.mjs`
- Modify: `package.json:29-36`
- Modify: `.github/workflows/plan-permissions-ci.yml:23-33`

**Interfaces:**
- Produces root scripts: `test:api:core`, `test:web:core`, and `test:strategy`.
- Produces a cross-platform Python launcher that prefers `PYTHON_BIN`, then the repository virtual environment, then platform Python commands.
- Preserves `test:plans:ci` as the GitHub workflow and predeploy entrypoint.

- [ ] **Step 1: Add failing CI wiring assertions**

In `tests/ci-plan-permissions.test.mjs`, require `test:api:core` to contain all eight API scripts, `test:web:core` to contain all ten Web scripts, and `test:strategy` to invoke `node infra/run-strategy-tests.mjs`. Require the workflow to contain `actions/setup-python@v5` and `pip install -r services/strategy/requirements.txt`.

Add a launcher test mode by running:

```text
node infra/run-strategy-tests.mjs --print-command
```

Assert its output contains `-m unittest discover services/strategy/tests -t services/strategy -v`.

Require `test:plans:ci` to invoke the three grouped scripts, `test:ci-service-readiness`, both builds, and `test:e2e:plans:ci`.

- [ ] **Step 2: Run the wiring test and verify RED**

Run: `node tests/ci-plan-permissions.test.mjs`

Expected: FAIL because the grouped scripts do not exist.

- [ ] **Step 3: Add explicit grouped scripts**

Create `infra/run-strategy-tests.mjs`. It must choose `process.env.PYTHON_BIN` when present; otherwise choose `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on POSIX when the file exists, then fall back to `py -3` on Windows or `python3` on POSIX. `--print-command` prints the resolved executable and arguments without spawning. Normal execution uses `spawnSync(..., { stdio: 'inherit' })` and exits with the child's status.

Add the following root scripts without changing deployment commands:

```json
"test:ci-service-readiness": "node tests/ci-service-readiness.test.mjs",
"test:api:core": "npm run test:market-stream -w apps/api && npm run test:market-symbol-discovery -w apps/api && npm run test:alerts-delivery -w apps/api && npm run test:strict-persistence -w apps/api && npm run test:global-scan-schedule -w apps/api && npm run test:aligned-global-scanner -w apps/api && npm run test:strategy-contract -w apps/api && npm run test:entitlements -w apps/api",
"test:web:core": "npm run test:entitlements -w apps/web && npm run test:kline-confirmation -w apps/web && npm run test:kline-realtime -w apps/web && npm run test:kline-strategy-source -w apps/web && npm run test:radar-live -w apps/web && npm run test:claw-layout -w apps/web && npm run test:page-width -w apps/web && npm run test:track-record -w apps/web && npm run test:touch-targets -w apps/web && npm run test:view-routing -w apps/web",
"test:strategy": "node infra/run-strategy-tests.mjs"
```

Update `test:plans:ci` to run the wiring test, readiness test, grouped suites, builds, and plan E2E in that order.

Update the workflow before `npm ci` with:

```yaml
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install strategy dependencies
        run: pip install -r services/strategy/requirements.txt
```

- [ ] **Step 4: Verify GREEN**

Run: `node tests/ci-plan-permissions.test.mjs`

Expected: `CI plan permission wiring tests passed`.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- package.json tests/ci-plan-permissions.test.mjs
git commit -m "test(ci): gate on all core suites"
```

### Task 4: Full verification and PR update

**Files:**
- Verify only; do not stage unrelated worktree files.

**Interfaces:**
- Consumes all commands introduced by Tasks 1-3.

- [ ] **Step 1: Run focused CI tests**

Run:

```powershell
npm.cmd run test:ci-config
npm.cmd run test:ci-service-readiness
```

Expected: both pass.

- [ ] **Step 2: Run grouped suites and builds**

Run:

```powershell
npm.cmd run test:api:core
npm.cmd run test:web:core
npm.cmd run test:strategy
npm.cmd run build:api
npm.cmd run build:web
```

Expected: all commands exit 0; Python reports 42 or more passing tests.

- [ ] **Step 3: Verify patch hygiene**

Run:

```powershell
git diff --check HEAD~3..HEAD
git status --short
```

Expected: no whitespace errors in the new commits; existing unrelated modified/untracked files remain unstaged.

- [ ] **Step 4: Push the implementation commits**

Run: `git push origin feature/yansir-crypto-live-signal-command`

Expected: remote branch advances without force push and PR #1 updates.
