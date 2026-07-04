# Yansir Internal K-Line Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an online hidden admin-only K-line lab that lets the owner review Yansir strategy signals against recent candle evidence without exposing the page to normal users.

**Architecture:** Add a new `kline-lab` view that is accepted by URL routing but excluded from bottom navigation. Keep signal authority in the existing strategy engine, and add a pure front-end confirmation helper that classifies candle evidence as confirmed, warning, watch-next, invalidated, or no-signal. Render a compact internal workbench using existing API calls for candles, market rows, and strategy signals.

**Tech Stack:** React 18, TypeScript, Vite, Node test scripts, existing `apiGet` helper, existing `routeAccessPrompt` access model, SVG/CSS for the candlestick panel.

---

## File Structure

- Create: `apps/web/src/features/klineLab/klineConfirmation.ts`
  - Pure candle confirmation model, symbol/timeframe normalization, band approximation, evidence labels.
- Create: `apps/web/src/features/klineLab/KlineLabView.tsx`
  - Hidden internal route view. Fetches candles and strategy signals, renders controls, SVG K-line chart, evidence panel, and multi-timeframe summary.
- Create: `apps/web/tests/kline-confirmation.test.mjs`
  - Node/esbuild tests for the pure helper.
- Modify: `apps/web/package.json`
  - Add `test:kline-confirmation` script.
- Modify: `apps/web/src/components/BottomNav.tsx`
  - Add `kline-lab` to `ViewName`, keeping it out of the nav item list.
- Modify: `apps/web/src/lib/viewRouting.ts`
  - Accept `view=kline-lab`.
- Modify: `apps/web/src/lib/planAccess.ts`
  - Guard `kline-lab` with the same admin-only access pattern as `admin`.
- Modify: `apps/web/src/components/AppShell.tsx`
  - Import and render `KlineLabView`, treat it as a sub page, pass current user, market rows, signals, navigation, and toast.
- Modify: `apps/web/src/styles/app.css`
  - Add dense internal lab layout, SVG chart styling, responsive evidence panels.
- Modify: `apps/web/tests/view-routing.test.mjs`
  - Assert `kline-lab` routes correctly.
- Modify: `apps/web/tests/plan-access.test.mjs`
  - Assert guest/member blocked and admin allowed.

---

### Task 1: K-Line Confirmation Helper

**Files:**
- Create: `apps/web/src/features/klineLab/klineConfirmation.ts`
- Create: `apps/web/tests/kline-confirmation.test.mjs`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the failing helper tests**

Create `apps/web/tests/kline-confirmation.test.mjs`:

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const webRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "klineConfirmation.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");

execFileSync(process.execPath, [
  esbuildBin,
  "src/features/klineLab/klineConfirmation.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--outfile=${outFile}`
], { cwd: webRoot, stdio: "inherit" });

const {
  classifyKlineSignal,
  normalizeLabSymbol,
  normalizeLabTimeframe
} = await import(pathToFileURL(outFile));

function candle(index, open, high, low, close) {
  return {
    open_time: 1700000000000 + index * 300000,
    close_time: 1700000000000 + (index + 1) * 300000 - 1,
    open,
    high,
    low,
    close,
    volume: 1000 + index
  };
}

function upCandles() {
  return [
    candle(0, 100, 101, 99, 100.4),
    candle(1, 100.4, 102, 100, 101.5),
    candle(2, 101.4, 103, 101, 102.4),
    candle(3, 102.5, 104, 102.2, 103.5),
    candle(4, 103.4, 105, 103.1, 104.6),
    candle(5, 104.8, 106.5, 104.5, 106.1),
    candle(6, 106.0, 107.2, 105.8, 106.9),
    candle(7, 107.0, 108.4, 106.9, 108.1),
    candle(8, 108.2, 109.8, 108, 109.4),
    candle(9, 109.5, 111.2, 109.3, 110.9),
    candle(10, 110.8, 112.5, 110.6, 112.1),
    candle(11, 112.0, 113.4, 111.9, 113.0),
    candle(12, 113.1, 114.5, 112.8, 114.2),
    candle(13, 114.3, 115.8, 114.1, 115.5),
    candle(14, 115.6, 117.4, 115.4, 117.0),
    candle(15, 117.1, 118.6, 116.9, 118.2),
    candle(16, 118.3, 120.2, 118.1, 119.8),
    candle(17, 119.9, 121.3, 119.6, 120.9),
    candle(18, 121.0, 122.8, 120.8, 122.4),
    candle(19, 122.5, 124.0, 122.2, 123.7)
  ];
}

const confirmedLong = classifyKlineSignal({
  candles: upCandles(),
  signal: { direction: "long", price: 121.5, timeframe: "5m" }
});
assert.equal(confirmedLong.state, "confirmed");
assert.equal(confirmedLong.direction, "long");
assert.ok(confirmedLong.score >= 75);
assert.ok(confirmedLong.evidence.some((item) => item.key === "close-stability" && item.status === "pass"));

const noSignal = classifyKlineSignal({ candles: upCandles(), signal: null });
assert.equal(noSignal.state, "no-signal");
assert.equal(noSignal.score, 0);

const weakLong = classifyKlineSignal({
  candles: [
    ...upCandles().slice(0, 17),
    candle(17, 119.8, 122.8, 119.7, 120.1),
    candle(18, 120.2, 123.5, 120.0, 120.4),
    candle(19, 120.4, 124.0, 120.2, 120.6)
  ],
  signal: { direction: "long", price: 120.4, timeframe: "5m" }
});
assert.equal(weakLong.state, "warning");
assert.ok(weakLong.evidence.some((item) => item.key === "body-quality" && item.status === "fail"));

const waitingLong = classifyKlineSignal({
  candles: upCandles().slice(0, 4),
  signal: { direction: "long", price: 103.2, timeframe: "5m" }
});
assert.equal(waitingLong.state, "watch-next");

const invalidShort = classifyKlineSignal({
  candles: upCandles(),
  signal: { direction: "short", price: 116.2, timeframe: "5m" }
});
assert.equal(invalidShort.state, "invalidated");

assert.equal(normalizeLabSymbol("btcusdt"), "BTC");
assert.equal(normalizeLabSymbol(" eth "), "ETH");
assert.equal(normalizeLabTimeframe("15m"), "15m");
assert.equal(normalizeLabTimeframe("bad"), "5m");

rmSync(outDir, { recursive: true, force: true });
console.log("kline confirmation tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm.cmd run test:kline-confirmation -w apps/web
```

Expected: the script is missing or the module path cannot be resolved because `klineConfirmation.ts` does not exist.

- [ ] **Step 3: Add the test script**

Modify `apps/web/package.json` scripts:

```json
"test:kline-confirmation": "node tests/kline-confirmation.test.mjs"
```

Keep the existing scripts unchanged.

- [ ] **Step 4: Create the helper implementation**

Create `apps/web/src/features/klineLab/klineConfirmation.ts`:

```ts
export type KlineDirection = "long" | "short" | "flat";
export type KlineConfirmationState = "confirmed" | "watch-next" | "warning" | "invalidated" | "no-signal";
export type KlineEvidenceStatus = "pass" | "warn" | "fail" | "neutral";

export type KlineCandle = {
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time?: number;
};

export type KlineSignalInput = {
  direction: KlineDirection;
  price?: number | string | null;
  timeframe?: string | null;
  time?: string | null;
  receivedAt?: string | null;
} | null;

export type KlineBandPoint = {
  time: number;
  mid: number;
  upper: number;
  lower: number;
};

export type KlineEvidence = {
  key: string;
  label: string;
  status: KlineEvidenceStatus;
  value: string;
  detail: string;
};

export type KlineConfirmationResult = {
  state: KlineConfirmationState;
  direction: KlineDirection;
  score: number;
  label: string;
  summary: string;
  evidence: KlineEvidence[];
  bands: KlineBandPoint[];
};

const VALID_TIMEFRAMES = new Set(["5m", "15m", "1h", "4h"]);

export function normalizeLabSymbol(value: string | null | undefined) {
  const clean = String(value || "BTC").trim().toUpperCase().replace(/USDT$/, "");
  return clean || "BTC";
}

export function normalizeLabTimeframe(value: string | null | undefined) {
  const clean = String(value || "5m").trim().toLowerCase();
  return VALID_TIMEFRAMES.has(clean) ? clean : "5m";
}

export function classifyKlineSignal(input: { candles: KlineCandle[]; signal: KlineSignalInput }): KlineConfirmationResult {
  const candles = input.candles.filter(isValidCandle).sort((left, right) => left.open_time - right.open_time);
  const bands = buildBandSeries(candles);
  const direction = input.signal?.direction || "flat";

  if (!input.signal || direction === "flat") {
    return {
      state: "no-signal",
      direction: "flat",
      score: 0,
      label: "暂无策略命中",
      summary: "当前币种/周期没有策略引擎命中，K线只作为观察背景。",
      evidence: [
        { key: "signal-source", label: "策略来源", status: "neutral", value: "未命中", detail: "没有策略事件时不从K线生成新信号。" }
      ],
      bands
    };
  }

  if (candles.length < 8 || bands.length < 3) {
    return {
      state: "watch-next",
      direction,
      score: 35,
      label: "等待下一根",
      summary: "K线数量不足，先保留策略信号但不做强确认。",
      evidence: [
        { key: "sample-size", label: "样本数量", status: "warn", value: `${candles.length} 根`, detail: "至少需要 8 根K线才能计算基础趋势带和最近结构。" }
      ],
      bands
    };
  }

  const recentCandles = candles.slice(-5);
  const recentBands = bands.slice(-5);
  const latest = recentCandles[recentCandles.length - 1];
  const latestBand = recentBands[recentBands.length - 1];
  const atr = averageTrueRange(candles.slice(-14));
  const bodyRatio = candleBodyRatio(latest);
  const oppositeWick = oppositeWickRatio(latest, direction);
  const closeStableCount = recentCandles.filter((candle, index) => closesBeyondBand(candle.close, recentBands[index], direction)).length;
  const lastBeyondBand = closesBeyondBand(latest.close, latestBand, direction);
  const invalidCloseCount = recentCandles.slice(-2).filter((candle, index) => {
    const band = recentBands[recentBands.length - 2 + index];
    return direction === "long" ? candle.close < band.mid : candle.close > band.mid;
  }).length;
  const distanceAtr = atr > 0 ? Math.abs(latest.close - latestBand.mid) / atr : 0;

  const evidence: KlineEvidence[] = [
    {
      key: "close-stability",
      label: "收盘稳定性",
      status: closeStableCount >= 3 && lastBeyondBand ? "pass" : lastBeyondBand ? "warn" : "fail",
      value: `${closeStableCount}/5`,
      detail: direction === "long" ? "做多需要多根收盘站在趋势带上方。" : "做空需要多根收盘压在趋势带下方。"
    },
    {
      key: "body-quality",
      label: "实体质量",
      status: bodyRatio >= 0.35 ? "pass" : bodyRatio >= 0.2 ? "warn" : "fail",
      value: `${Math.round(bodyRatio * 100)}%`,
      detail: "实体太小容易是假突破或犹豫K线。"
    },
    {
      key: "wick-risk",
      label: "反向影线",
      status: oppositeWick <= 0.35 ? "pass" : oppositeWick <= 0.55 ? "warn" : "fail",
      value: `${Math.round(oppositeWick * 100)}%`,
      detail: "反向影线越长，说明突破后被快速打回的风险越高。"
    },
    {
      key: "atr-distance",
      label: "ATR距离",
      status: distanceAtr >= 0.15 && distanceAtr <= 2.2 ? "pass" : distanceAtr > 2.2 ? "warn" : "fail",
      value: `${distanceAtr.toFixed(2)} ATR`,
      detail: "距离太近代表噪音，距离太远代表可能追高或追空。"
    }
  ];

  if (invalidCloseCount >= 2 || !lastBeyondBand) {
    return {
      state: "invalidated",
      direction,
      score: 25,
      label: "信号失效",
      summary: "最新K线已经回到确认区域内侧，暂不把该信号作为重点。",
      evidence,
      bands
    };
  }

  const passCount = evidence.filter((item) => item.status === "pass").length;
  const failCount = evidence.filter((item) => item.status === "fail").length;
  if (passCount >= 3 && failCount === 0) {
    return {
      state: "confirmed",
      direction,
      score: Math.min(95, 70 + passCount * 6),
      label: "K线确认",
      summary: "策略方向与最近K线结构基本一致，可作为重点复核信号。",
      evidence,
      bands
    };
  }

  if (failCount >= 2) {
    return {
      state: "warning",
      direction,
      score: 50,
      label: "结构预警",
      summary: "策略已命中，但K线实体、影线或ATR距离偏弱，需要降低优先级。",
      evidence,
      bands
    };
  }

  return {
    state: "watch-next",
    direction,
    score: 62,
    label: "等待下一根",
    summary: "策略方向已有支撑，但最近结构还没有完成确认。",
    evidence,
    bands
  };
}

function isValidCandle(candle: KlineCandle) {
  return [candle.open_time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) && candle.high >= candle.low;
}

function closesBeyondBand(close: number, band: KlineBandPoint, direction: KlineDirection) {
  if (direction === "long") return close > band.upper;
  if (direction === "short") return close < band.lower;
  return false;
}

function candleBodyRatio(candle: KlineCandle) {
  const range = Math.max(0.00000001, candle.high - candle.low);
  return Math.abs(candle.close - candle.open) / range;
}

function oppositeWickRatio(candle: KlineCandle, direction: KlineDirection) {
  const range = Math.max(0.00000001, candle.high - candle.low);
  if (direction === "long") return (candle.high - Math.max(candle.open, candle.close)) / range;
  if (direction === "short") return (Math.min(candle.open, candle.close) - candle.low) / range;
  return 0;
}

function averageTrueRange(candles: KlineCandle[]) {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const prevClose = candles[index].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - prevClose), Math.abs(candle.low - prevClose));
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function buildBandSeries(candles: KlineCandle[]): KlineBandPoint[] {
  const closes = candles.map((candle) => candle.close);
  const mid = ema(closes, 21);
  const deviations = closes.map((close, index) => Math.abs(close - mid[index]));
  const dev = ema(deviations, 21);
  return candles.map((candle, index) => {
    const buffer = dev[index] * 0.72;
    return {
      time: candle.open_time,
      mid: mid[index],
      upper: mid[index] + buffer,
      lower: mid[index] - buffer
    };
  });
}

function ema(values: number[], length: number) {
  if (!values.length) return [];
  const alpha = 2 / (length + 1);
  const result: number[] = [];
  values.forEach((value, index) => {
    result[index] = index === 0 ? value : value * alpha + result[index - 1] * (1 - alpha);
  });
  return result;
}
```

- [ ] **Step 5: Run the helper test**

Run:

```bash
npm.cmd run test:kline-confirmation -w apps/web
```

Expected:

```text
kline confirmation tests passed
```

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web/package.json apps/web/src/features/klineLab/klineConfirmation.ts apps/web/tests/kline-confirmation.test.mjs
git commit -m "feat: add kline confirmation model"
```

---

### Task 2: Hidden Route and Admin Access

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx`
- Modify: `apps/web/src/lib/viewRouting.ts`
- Modify: `apps/web/src/lib/planAccess.ts`
- Modify: `apps/web/tests/view-routing.test.mjs`
- Modify: `apps/web/tests/plan-access.test.mjs`

- [ ] **Step 1: Write routing and access test expectations**

In `apps/web/tests/view-routing.test.mjs`, add:

```js
assert.equal(module.normalizeViewParam("kline-lab"), "kline-lab");
assert.equal(module.normalizeViewParam("KLINE-LAB"), "kline-lab");
```

In `apps/web/tests/plan-access.test.mjs`, add near the admin assertions:

```js
assert.equal(routeAccessPrompt('kline-lab', guest, freeEntitlements)?.targetView, 'login');
assert.equal(routeAccessPrompt('kline-lab', vipUser, vipEntitlements)?.title, '当前账号无内部验信权限');
assert.equal(routeAccessPrompt('kline-lab', adminUser, svipEntitlements), null);
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:entitlements -w apps/web
```

Expected: `test:view-routing` fails because `kline-lab` is normalized to `data`, and `test:entitlements` fails because `kline-lab` is not guarded.

- [ ] **Step 3: Extend the view type without adding a nav item**

Modify the first line of `apps/web/src/components/BottomNav.tsx` view type:

```ts
export type ViewName = "data" | "claw" | "radar" | "signal" | "account" | "login" | "register" | "admin" | "plans" | "team" | "kline-lab";
```

Do not add `kline-lab` to the `items` array. The current `Extract<ViewName, "data" | "claw" | "radar" | "signal" | "account">` type keeps the bottom nav limited to public app tabs.

- [ ] **Step 4: Accept the hidden route**

Add `"kline-lab"` to `canonicalViews` in `apps/web/src/lib/viewRouting.ts`:

```ts
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
  "kline-lab",
]);
```

- [ ] **Step 5: Guard the route as admin-only**

In `apps/web/src/lib/planAccess.ts`, update the admin block to cover `kline-lab` with internal page copy:

```ts
  if ((view === "admin" || view === "kline-lab") && user.role !== "admin") {
    const isKlineLab = view === "kline-lab";
    return {
      title: signedIn ? (isKlineLab ? "当前账号无内部验信权限" : "当前账号无后台权限") : (isKlineLab ? "登录管理员账号" : "登录管理员账号"),
      desc: signedIn
        ? isKlineLab
          ? "K线验信室仅管理员可访问。请切换管理员账号，或返回账户中心。"
          : "后台运营页面仅管理员可访问。请切换管理员账号，或返回账户中心。"
        : isKlineLab
          ? "K线验信室是内部页面，仅管理员账号可访问，请先登录。"
          : "后台运营页面仅管理员账号可访问，请先登录。",
      targetView: (signedIn ? "account" : "login") as View,
      fallbackView: "account" as View,
      actionLabel: signedIn ? "返回我的" : "去登录"
    };
  }
```

Keep the existing public route list unchanged so `kline-lab` is not public.

- [ ] **Step 6: Run route and access tests**

Run:

```bash
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:entitlements -w apps/web
```

Expected:

```text
view routing tests passed
frontend entitlement tests passed
```

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/web/src/components/BottomNav.tsx apps/web/src/lib/viewRouting.ts apps/web/src/lib/planAccess.ts apps/web/tests/view-routing.test.mjs apps/web/tests/plan-access.test.mjs
git commit -m "feat: hide kline lab behind admin route"
```

---

### Task 3: K-Line Lab View

**Files:**
- Create: `apps/web/src/features/klineLab/KlineLabView.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

- [ ] **Step 1: Create the route-level view**

Create `apps/web/src/features/klineLab/KlineLabView.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { classifyKlineSignal, KlineBandPoint, KlineCandle, KlineDirection, KlineEvidence, normalizeLabSymbol, normalizeLabTimeframe } from "./klineConfirmation";

type CurrentUserLike = {
  id: string;
  role: string;
};

type MarketRowLike = {
  symbol: string;
  price: string;
  change: string;
  state: string;
  score: number;
};

type SignalLike = {
  symbol: string;
  price?: string;
  score: number;
  direction?: KlineDirection;
  title: string;
  reason: string;
  time?: string;
};

type StrategyInboxSignal = {
  id: string;
  signalEventId: string;
  symbol: string;
  timeframe: string;
  direction: KlineDirection;
  signalType?: string;
  engine?: string;
  price: number;
  score: number;
  title: string;
  reason: string;
  time: string;
  receivedAt: string;
  status: string;
};

type StrategySignalListResponse = {
  signals?: StrategyInboxSignal[];
};

type KlineLabViewProps = {
  currentUser: CurrentUserLike;
  rows: MarketRowLike[];
  signals: SignalLike[];
  onNavigate: (view: "account" | "radar" | "data") => void;
  onToast: (message: string) => void;
};

const timeframes = ["5m", "15m", "1h", "4h"] as const;

export function KlineLabView({ currentUser, onNavigate, onToast, rows, signals }: KlineLabViewProps) {
  const initialSymbol = normalizeLabSymbol(new URLSearchParams(window.location.search).get("symbol"));
  const initialTimeframe = normalizeLabTimeframe(new URLSearchParams(window.location.search).get("tf"));
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [candles, setCandles] = useState<KlineCandle[]>([]);
  const [strategySignals, setStrategySignals] = useState<StrategyInboxSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const marketRow = rows.find((row) => normalizeLabSymbol(row.symbol) === symbol);
  const latestStrategySignal = useMemo(() => {
    const exact = strategySignals.find((item) => normalizeLabSymbol(item.symbol) === symbol && normalizeLabTimeframe(item.timeframe) === timeframe);
    if (exact) return exact;
    const sameSymbol = strategySignals.find((item) => normalizeLabSymbol(item.symbol) === symbol);
    if (sameSymbol) return sameSymbol;
    const fallback = signals.find((item) => normalizeLabSymbol(item.symbol) === symbol && item.direction && item.direction !== "flat");
    return fallback
      ? {
          id: `${symbol}-fallback`,
          signalEventId: `${symbol}-fallback`,
          symbol,
          timeframe,
          direction: fallback.direction || "flat",
          price: Number(fallback.price || marketRow?.price || 0),
          score: fallback.score,
          title: fallback.title,
          reason: fallback.reason,
          time: fallback.time || "",
          receivedAt: fallback.time || "",
          status: "client-cache"
        }
      : null;
  }, [marketRow?.price, signals, strategySignals, symbol, timeframe]);

  const confirmation = useMemo(
    () =>
      classifyKlineSignal({
        candles,
        signal: latestStrategySignal
          ? {
              direction: latestStrategySignal.direction,
              price: latestStrategySignal.price,
              timeframe: latestStrategySignal.timeframe,
              time: latestStrategySignal.time,
              receivedAt: latestStrategySignal.receivedAt
            }
          : null
      }),
    [candles, latestStrategySignal]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "kline-lab");
    params.set("symbol", symbol);
    params.set("tf", timeframe);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [symbol, timeframe]);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      setLoading(true);
      setError("");
      try {
        const [klineResult, signalResult] = await Promise.allSettled([
          apiGet<{ candles: KlineCandle[] }>(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=180`),
          apiGet<StrategySignalListResponse>(`/api/strategy/inbox?mode=all&limit=20&page=1&symbol=${encodeURIComponent(symbol)}`)
        ]);
        if (!alive) return;
        if (klineResult.status === "fulfilled") {
          setCandles(klineResult.value.candles || []);
        } else {
          setCandles([]);
          setError("K线数据加载失败");
        }
        if (signalResult.status === "fulfilled") {
          setStrategySignals(signalResult.value.signals || []);
        } else {
          setStrategySignals([]);
        }
        setUpdatedAt(formatClock(Date.now()));
      } catch {
        if (!alive) return;
        setCandles([]);
        setStrategySignals([]);
        setError("内部验信数据加载失败");
        onToast("K线验信室数据加载失败");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void refresh();
    return () => {
      alive = false;
    };
  }, [onToast, symbol, timeframe]);

  return (
    <section className="view active-view kline-lab-view">
      <header className="kline-lab-head">
        <button className="kline-lab-back" type="button" onClick={() => onNavigate("radar")}>返回</button>
        <div>
          <span>Yansir Internal</span>
          <h1>K线验信室</h1>
        </div>
        <strong className={`kline-lab-state ${confirmation.state}`}>{confirmation.label}</strong>
      </header>

      <section className="kline-lab-toolbar">
        <label>
          <span>币种</span>
          <select value={symbol} onChange={(event) => setSymbol(normalizeLabSymbol(event.target.value))}>
            {buildSymbolOptions(rows, symbol).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="kline-lab-timeframes" aria-label="周期">
          {timeframes.map((item) => (
            <button key={item} className={timeframe === item ? "active" : ""} type="button" onClick={() => setTimeframe(item)}>{item}</button>
          ))}
        </div>
        <button type="button" onClick={() => setTimeframe((current) => current)}>刷新</button>
      </section>

      <section className="kline-lab-grid">
        <article className="kline-lab-chart-card">
          <div className="kline-lab-card-head">
            <div>
              <strong>{symbol} / {timeframe}</strong>
              <span>{marketRow?.price || "-"} · 24H {marketRow?.change || "--"} · {updatedAt || "等待同步"}</span>
            </div>
            {loading && <em>同步中</em>}
          </div>
          {error ? <div className="kline-lab-empty">{error}</div> : <KlineSvg candles={candles} bands={confirmation.bands} direction={latestStrategySignal?.direction || "flat"} />}
        </article>

        <aside className="kline-lab-evidence-card">
          <div className="kline-lab-decision">
            <span>{confirmation.label}</span>
            <strong>{confirmation.score}/100</strong>
            <p>{confirmation.summary}</p>
          </div>
          <EvidenceList evidence={confirmation.evidence} />
        </aside>
      </section>

      <section className="kline-lab-bottom-grid">
        <article>
          <h2>策略信号</h2>
          {latestStrategySignal ? (
            <div className="kline-lab-signal">
              <strong>{latestStrategySignal.title}</strong>
              <span>{latestStrategySignal.direction === "short" ? "做空" : "做多"} · {latestStrategySignal.score}/100 · {latestStrategySignal.timeframe}</span>
              <p>{latestStrategySignal.reason}</p>
            </div>
          ) : (
            <div className="kline-lab-empty">暂无策略命中，当前页面不从K线生成新信号。</div>
          )}
        </article>
        <article>
          <h2>多周期复核</h2>
          <div className="kline-lab-mtf">
            {timeframes.map((item) => (
              <span key={item} className={item === timeframe ? "active" : ""}>
                <strong>{item}</strong>
                <em>{item === timeframe ? confirmation.label : "待同步"}</em>
              </span>
            ))}
          </div>
        </article>
      </section>

      <footer className="kline-lab-foot">
        仅管理员可见 · 当前账号 {currentUser.id || "未登录"} · K线验信只做复核，不改变策略信号来源
      </footer>
    </section>
  );
}

function KlineSvg({ bands, candles, direction }: { bands: KlineBandPoint[]; candles: KlineCandle[]; direction: KlineDirection }) {
  if (!candles.length) return <div className="kline-lab-empty">暂无K线数据</div>;
  const width = 720;
  const height = 320;
  const pad = 24;
  const values = candles.flatMap((candle) => [candle.high, candle.low]);
  bands.forEach((band) => values.push(band.upper, band.lower, band.mid));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (width - pad * 2) / Math.max(candles.length - 1, 1);
  const xAt = (index: number) => pad + index * xStep;
  const yAt = (value: number) => pad + (1 - (value - min) / range) * (height - pad * 2);
  const bandPath = (selector: "upper" | "mid" | "lower") =>
    bands.map((band, index) => `${index ? "L" : "M"} ${xAt(index).toFixed(2)} ${yAt(band[selector]).toFixed(2)}`).join(" ");

  return (
    <svg className={`kline-lab-chart ${direction}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="K线验信图">
      <path className="band upper" d={bandPath("upper")} />
      <path className="band mid" d={bandPath("mid")} />
      <path className="band lower" d={bandPath("lower")} />
      {candles.map((candle, index) => {
        const rising = candle.close >= candle.open;
        const x = xAt(index);
        const yHigh = yAt(candle.high);
        const yLow = yAt(candle.low);
        const yOpen = yAt(candle.open);
        const yClose = yAt(candle.close);
        const top = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
        return (
          <g key={`${candle.open_time}-${index}`} className={rising ? "up" : "down"}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} />
            <rect x={x - 3.5} y={top} width="7" height={bodyHeight} rx="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

function EvidenceList({ evidence }: { evidence: KlineEvidence[] }) {
  return (
    <div className="kline-lab-evidence-list">
      {evidence.map((item) => (
        <article key={item.key} className={item.status}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function buildSymbolOptions(rows: MarketRowLike[], current: string) {
  const symbols = rows.map((row) => normalizeLabSymbol(row.symbol)).filter(Boolean);
  return Array.from(new Set([current, "BTC", "ETH", "SOL", "BNB", ...symbols])).slice(0, 80);
}

function formatClock(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Wire the view into AppShell**

Modify imports in `apps/web/src/components/AppShell.tsx`:

```ts
import { KlineLabView } from "../features/klineLab/KlineLabView";
```

Update subpage detection:

```ts
  const isSubPage = ["plans", "team", "admin", "login", "register", "kline-lab"].includes(view);
```

Add the render branch before the account branch:

```tsx
      {dataStatus !== "loading" && !showSymbolDetail && view === "kline-lab" && (
        <KlineLabView currentUser={currentUser} rows={rows} signals={safeSignals} onNavigate={navigate} onToast={showToast} />
      )}
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm.cmd run lint -w apps/web
```

Expected: TypeScript passes. If it reports that `onNavigate` is too narrow, change `KlineLabViewProps` to use the imported `ViewName` type from `../../components/BottomNav`.

- [ ] **Step 4: Commit Task 3**

```bash
git add apps/web/src/features/klineLab/KlineLabView.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat: add internal kline lab view"
```

---

### Task 4: Internal Workbench Styling

**Files:**
- Modify: `apps/web/src/styles/app.css`

- [ ] **Step 1: Add K-line lab CSS**

Append this block to `apps/web/src/styles/app.css`:

```css
.kline-lab-view {
  min-height: 100vh;
  padding: 18px 16px 32px;
  background: #f5f8fc;
  color: #112238;
}

.kline-lab-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.kline-lab-back,
.kline-lab-toolbar button,
.kline-lab-toolbar select {
  min-height: 42px;
  border: 1px solid #d5e0ee;
  border-radius: 8px;
  background: #ffffff;
  color: #12345c;
  font-weight: 800;
}

.kline-lab-head span {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.kline-lab-head h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1;
}

.kline-lab-state {
  padding: 9px 11px;
  border-radius: 8px;
  background: #e8eef8;
  color: #23405f;
  font-size: 13px;
}

.kline-lab-state.confirmed { background: #dcfce7; color: #166534; }
.kline-lab-state.warning { background: #fef3c7; color: #92400e; }
.kline-lab-state.watch-next { background: #dbeafe; color: #1d4ed8; }
.kline-lab-state.invalidated { background: #fee2e2; color: #b91c1c; }
.kline-lab-state.no-signal { background: #e5e7eb; color: #374151; }

.kline-lab-toolbar {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 14px;
}

.kline-lab-toolbar label span {
  display: block;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.kline-lab-toolbar select {
  width: 100%;
  padding: 0 10px;
}

.kline-lab-timeframes {
  display: grid;
  grid-template-columns: repeat(4, minmax(54px, 1fr));
  gap: 8px;
}

.kline-lab-timeframes button.active {
  border-color: #2f6df6;
  background: #eaf1ff;
  color: #1557d8;
}

.kline-lab-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(260px, .8fr);
  gap: 14px;
}

.kline-lab-chart-card,
.kline-lab-evidence-card,
.kline-lab-bottom-grid article {
  border: 1px solid #dce5f0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(30, 58, 96, .06);
}

.kline-lab-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #edf2f7;
}

.kline-lab-card-head strong {
  display: block;
  font-size: 17px;
}

.kline-lab-card-head span,
.kline-lab-card-head em {
  color: #64748b;
  font-size: 12px;
  font-style: normal;
}

.kline-lab-chart {
  width: 100%;
  min-height: 310px;
  display: block;
  background: linear-gradient(#ffffff, #f8fbff);
}

.kline-lab-chart .band {
  fill: none;
  stroke-width: 1.4;
}

.kline-lab-chart .band.upper,
.kline-lab-chart .band.lower {
  stroke: #9db4d0;
  stroke-dasharray: 5 5;
}

.kline-lab-chart .band.mid {
  stroke: #2f6df6;
}

.kline-lab-chart g line {
  stroke: currentColor;
  stroke-width: 1.2;
}

.kline-lab-chart g rect {
  fill: currentColor;
}

.kline-lab-chart g.up { color: #16a34a; }
.kline-lab-chart g.down { color: #dc2626; }

.kline-lab-evidence-card {
  padding: 14px;
}

.kline-lab-decision span {
  color: #64748b;
  font-size: 12px;
  font-weight: 900;
}

.kline-lab-decision strong {
  display: block;
  margin-top: 4px;
  font-size: 34px;
  line-height: 1;
}

.kline-lab-decision p {
  margin: 10px 0 12px;
  color: #334155;
  font-size: 13px;
  line-height: 1.55;
}

.kline-lab-evidence-list {
  display: grid;
  gap: 9px;
}

.kline-lab-evidence-list article {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-left-width: 4px;
  border-radius: 8px;
}

.kline-lab-evidence-list article.pass { border-left-color: #16a34a; }
.kline-lab-evidence-list article.warn { border-left-color: #f59e0b; }
.kline-lab-evidence-list article.fail { border-left-color: #dc2626; }
.kline-lab-evidence-list article.neutral { border-left-color: #94a3b8; }

.kline-lab-evidence-list span {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.kline-lab-evidence-list strong {
  display: block;
  margin-top: 3px;
  color: #0f172a;
}

.kline-lab-evidence-list p {
  margin: 5px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
}

.kline-lab-bottom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 14px;
}

.kline-lab-bottom-grid article {
  padding: 14px;
}

.kline-lab-bottom-grid h2 {
  margin: 0 0 10px;
  font-size: 18px;
}

.kline-lab-signal strong,
.kline-lab-signal span {
  display: block;
}

.kline-lab-signal span {
  margin-top: 4px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.kline-lab-signal p {
  margin: 9px 0 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.55;
}

.kline-lab-mtf {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.kline-lab-mtf span {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.kline-lab-mtf span.active {
  border-color: #2f6df6;
  background: #eaf1ff;
}

.kline-lab-mtf strong,
.kline-lab-mtf em {
  display: block;
}

.kline-lab-mtf em {
  margin-top: 4px;
  color: #64748b;
  font-size: 12px;
  font-style: normal;
}

.kline-lab-empty {
  padding: 24px;
  color: #64748b;
  font-weight: 700;
}

.kline-lab-foot {
  margin-top: 14px;
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 760px) {
  .kline-lab-view {
    padding: 14px 12px 24px;
  }

  .kline-lab-head {
    grid-template-columns: auto 1fr;
  }

  .kline-lab-state {
    grid-column: 1 / -1;
  }

  .kline-lab-toolbar,
  .kline-lab-grid,
  .kline-lab-bottom-grid {
    grid-template-columns: 1fr;
  }

  .kline-lab-mtf {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 2: Run build**

Run:

```bash
npm.cmd run build:web
```

Expected: build succeeds and emits `apps/web/dist`.

- [ ] **Step 3: Commit Task 4**

```bash
git add apps/web/src/styles/app.css
git commit -m "style: polish internal kline lab"
```

---

### Task 5: Verification and Browser Smoke Test

**Files:**
- No planned source changes unless verification reveals a bug.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm.cmd run test:kline-confirmation -w apps/web
npm.cmd run test:view-routing -w apps/web
npm.cmd run test:entitlements -w apps/web
npm.cmd run test:radar-live -w apps/web
```

Expected:

```text
kline confirmation tests passed
view routing tests passed
frontend entitlement tests passed
live signal command tests passed
```

- [ ] **Step 2: Run full front-end build**

Run:

```bash
npm.cmd run build:web
```

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 3: Start or reuse the dev server**

If no server is already running, run:

```bash
npm.cmd run dev -w apps/web -- --host 127.0.0.1 --port 3201
```

Expected: Vite serves the app at `http://127.0.0.1:3201/yansir/`.

- [ ] **Step 4: Browser smoke test**

Open:

```text
http://127.0.0.1:3201/yansir/?view=kline-lab&symbol=BTC&tf=5m
```

Expected for admin login:

- Page title `K线验信室` is visible.
- Bottom nav is not visible.
- Symbol selector, timeframe buttons, K-line chart, evidence panel, strategy signal panel, and multi-timeframe panel are visible.
- No visible text overlap at mobile width.

Expected for guest/member login:

- Route access prompt appears.
- Normal users cannot see the K-line lab content.

- [ ] **Step 5: Commit any verification fixes**

If verification required fixes:

```bash
git add apps/web/src
git commit -m "fix: verify internal kline lab access"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage:
  - Hidden online route: Task 2 and Task 3.
  - Admin-only access: Task 2 tests and `routeAccessPrompt`.
  - No bottom nav exposure: Task 2 keeps `items` unchanged and Task 5 checks it visually.
  - Strategy engine remains signal source: Task 1 no-signal state and Task 3 strategy signal panel copy.
  - K-line confirmation states: Task 1 helper and tests cover all five states.
  - Mobile/internal UI: Task 4 responsive CSS and Task 5 browser smoke test.
- Completeness scan: no incomplete markers are used.
- Type consistency:
  - `KlineDirection` matches existing `Direction` string values.
  - `KlineCandle` matches API `Candle` fields.
  - `kline-lab` is added to `ViewName`, routing, and access checks together.
