# Yansir Pine V6 Strategy Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the provided Pine V6 EMD strategy the single source of truth for Yansir Crypto strategy signals, and make the hidden K-line lab display that backend strategy output.

**Architecture:** The Python strategy service will own a candle-by-candle Pine V6 port with stateful position emulation. The Nest API will keep the existing persistence and alert path, adding optional signal action and diagnostics fields. The React K-line lab will render backend strategy diagnostics and stop presenting the frontend candle helper as an independent signal source.

**Tech Stack:** Python 3 stdlib `unittest`, FastAPI/Pydantic strategy service, NestJS TypeScript API, React/Vite web app, existing Node `.mjs` tests.

---

## File Structure

- Create `services/strategy/tests/test_indicators.py`: indicator parity tests for RMA, EMA, ATR, RSI, DMI/ADX, Bollinger width, and pivots.
- Create `services/strategy/tests/test_pine_state.py`: state emulator tests for entries, adds, reduce orders, average price, and loss guards.
- Create `services/strategy/tests/test_emd_v6_strategy.py`: strategy replay tests for no-signal, trend long, trend short, reversal, add, and weak-reduce signals.
- Create `services/strategy/app/strategies/pine_state.py`: Pine-like position and order state emulator.
- Create `services/strategy/app/strategies/emd_v6.py`: focused Pine V6 indicator, signal, diagnostic, and replay logic.
- Modify `services/strategy/app/indicators.py`: add missing DMI/ADX, Bollinger, pivot, highest, and lowest helpers.
- Modify `services/strategy/app/models.py`: add strategy signal action fields and diagnostics models while preserving existing fields.
- Modify `services/strategy/app/strategies/emd_trend.py`: replace migration shell with a wrapper around `emd_v6.run_emd_v6_strategy`.
- Create `apps/api/tests/strategy-contract.test.mjs`: API-side contract tests for action fields, diagnostics, and reduce-label mapping.
- Modify `apps/api/src/modules/strategy/strategy.client.ts`: extend TypeScript result types.
- Modify `apps/api/src/modules/strategy/strategy.service.ts`: preserve persistence, dedupe, alert candidates, and map new signal actions safely.
- Create `apps/web/tests/kline-lab-strategy-source.test.mjs`: frontend tests proving K-line lab consumes backend strategy output and does not fabricate signals.
- Modify `apps/web/src/features/klineLab/KlineLabView.tsx`: fetch strategy run diagnostics for admin view and render them as the primary strategy panel.
- Modify `apps/web/src/features/klineLab/klineConfirmation.ts`: demote helper labels so it is displayed as candle quality only when still used.
- Modify `apps/web/src/features/radar/liveSignalModel.ts` and `apps/web/src/features/radar/LiveSignalCommand.tsx`: label add/reduce actions separately from fresh entries.

## Task 1: Strategy Test Harness

**Files:**
- Create: `services/strategy/tests/__init__.py`
- Create: `services/strategy/tests/fixtures.py`
- Create: `services/strategy/tests/test_indicators.py`

- [ ] **Step 1: Write the failing indicator tests**

```python
# services/strategy/tests/test_indicators.py
import unittest

from app.indicators import (
    atr_series,
    bollinger_width_pct_series,
    dmi_adx_series,
    ema_series,
    pivot_high_series,
    pivot_low_series,
    rma_series,
    rsi_series,
)


class IndicatorParityTest(unittest.TestCase):
    def test_rma_and_ema_seed_from_first_value(self):
        self.assertEqual(rma_series([10, 20, 30], 2), [10, 15, 22.5])
        self.assertEqual(ema_series([10, 20, 30], 3), [10, 15, 22.5])

    def test_dmi_adx_emits_pine_shaped_series(self):
        highs = [10, 11, 12, 13, 14, 14, 15]
        lows = [9, 9.5, 10, 11, 12, 12.5, 13]
        closes = [9.5, 10.5, 11.5, 12.5, 13, 13.2, 14]
        plus_di, minus_di, adx = dmi_adx_series(highs, lows, closes, 3, 3)
        self.assertEqual(len(plus_di), len(highs))
        self.assertEqual(len(minus_di), len(highs))
        self.assertEqual(len(adx), len(highs))
        self.assertGreater(plus_di[-1], minus_di[-1])
        self.assertGreater(adx[-1], 0)

    def test_bollinger_width_and_pivots_are_available(self):
        closes = [10, 11, 12, 13, 14]
        widths = bollinger_width_pct_series(closes, 3, 2)
        self.assertIsNone(widths[1])
        self.assertGreater(widths[-1], 0)
        self.assertEqual(pivot_high_series([1, 3, 2, 5, 4], 1), [None, 3, None, 5, None])
        self.assertEqual(pivot_low_series([5, 3, 4, 2, 3], 1), [None, 3, None, 2, None])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test and verify it fails because helpers are missing**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_indicators -v
```

Expected: FAIL or ERROR mentioning missing `dmi_adx_series`, `bollinger_width_pct_series`, `pivot_high_series`, or `pivot_low_series`.

- [ ] **Step 3: Add the missing indicator helpers**

Add these public helpers to `services/strategy/app/indicators.py`:

```python
def dmi_adx_series(highs, lows, closes, length: int, smooth: int):
    plus_dm = [0.0]
    minus_dm = [0.0]
    for index in range(1, len(highs)):
        up = highs[index] - highs[index - 1]
        down = lows[index - 1] - lows[index]
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)
    tr = true_ranges(highs, lows, closes)
    tr_rma = rma_series(tr, length)
    plus_rma = rma_series(plus_dm, length)
    minus_rma = rma_series(minus_dm, length)
    plus_di = []
    minus_di = []
    dx = []
    for tr_value, plus_value, minus_value in zip(tr_rma, plus_rma, minus_rma, strict=True):
        if not tr_value:
            plus_di.append(0.0)
            minus_di.append(0.0)
            dx.append(0.0)
            continue
        plus = 100 * (plus_value or 0.0) / tr_value
        minus = 100 * (minus_value or 0.0) / tr_value
        denom = plus + minus
        plus_di.append(plus)
        minus_di.append(minus)
        dx.append(0.0 if denom == 0 else 100 * abs(plus - minus) / denom)
    return plus_di, minus_di, rma_series(dx, smooth)


def bollinger_width_pct_series(values, length: int, mult: float):
    output = []
    for index in range(len(values)):
        window = values[max(0, index - length + 1): index + 1]
        if len(window) < length:
            output.append(None)
            continue
        basis = sum(window) / length
        variance = sum((item - basis) ** 2 for item in window) / length
        dev = variance ** 0.5 * mult
        output.append(None if basis == 0 else (2 * dev) / basis * 100)
    return output


def pivot_high_series(values, pivot_len: int):
    output = [None] * len(values)
    for index in range(pivot_len, len(values) - pivot_len):
        window = values[index - pivot_len:index + pivot_len + 1]
        if values[index] >= max(window):
            output[index] = values[index]
    return output


def pivot_low_series(values, pivot_len: int):
    output = [None] * len(values)
    for index in range(pivot_len, len(values) - pivot_len):
        window = values[index - pivot_len:index + pivot_len + 1]
        if values[index] <= min(window):
            output[index] = values[index]
    return output
```

- [ ] **Step 4: Run the indicator tests and verify they pass**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_indicators -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- services/strategy/app/indicators.py services/strategy/tests/__init__.py services/strategy/tests/test_indicators.py
git commit -m "test: cover pine indicator parity"
```

## Task 2: Strategy Models And Diagnostics Contract

**Files:**
- Modify: `services/strategy/app/models.py`
- Create: `services/strategy/tests/test_strategy_models.py`
- Modify: `apps/api/src/modules/strategy/strategy.client.ts`

- [ ] **Step 1: Write the failing model contract test**

```python
# services/strategy/tests/test_strategy_models.py
import unittest

from app.models import StrategyDiagnostics, StrategyRunResponse, StrategySignal


class StrategyModelContractTest(unittest.TestCase):
    def test_signal_action_and_diagnostics_are_optional_contract_fields(self):
        signal = StrategySignal(
            type="weak_reduce_long_signal",
            title="趋势转弱减多仓",
            engine="trend_weakness",
            side="long",
            action="reduce_long",
            price=100.0,
            reduce_pct=25.0,
            score_impact=10,
        )
        diagnostics = StrategyDiagnostics(
            market_state_text="趋势市场",
            risk_status="允许交易",
            active_engine="趋势",
            current_position="多单",
        )
        response = StrategyRunResponse(
            symbol="BTCUSDT",
            timeframe="5m",
            bar_time=1710000000000,
            market_state="weak_reduce_long_signal",
            signals=[signal],
            diagnostics=diagnostics,
            metrics={},
        )
        dumped = response.model_dump()
        self.assertEqual(dumped["signals"][0]["action"], "reduce_long")
        self.assertEqual(dumped["signals"][0]["reduce_pct"], 25.0)
        self.assertEqual(dumped["diagnostics"]["active_engine"], "趋势")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the model test and verify it fails**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_strategy_models -v
```

Expected: ERROR importing `StrategyDiagnostics` or passing `action`.

- [ ] **Step 3: Add optional fields without breaking existing response shape**

Add this model to `services/strategy/app/models.py`:

```python
class StrategyBandPoint(BaseModel):
    open_time: int
    avg: float | None = None
    upper: float | None = None
    lower: float | None = None
    direction: int = 0


class StrategyZone(BaseModel):
    top: float | None = None
    bottom: float | None = None
    strength: int = 0
    touched: bool = False


class StrategyDiagnostics(BaseModel):
    market_state_text: str = "unknown"
    risk_status: str = "unknown"
    active_engine: str = "无"
    current_position: str = "空仓"
    current_r: float | None = None
    remaining_position_pct: float | None = None
    bands: list[StrategyBandPoint] = Field(default_factory=list)
    support: StrategyZone = Field(default_factory=StrategyZone)
    resistance: StrategyZone = Field(default_factory=StrategyZone)
```

Extend `StrategySignal`:

```python
    action: str | None = None
    reduce_pct: float | None = None
```

Extend `StrategyRunResponse`:

```python
    diagnostics: StrategyDiagnostics = Field(default_factory=StrategyDiagnostics)
```

- [ ] **Step 4: Extend TypeScript strategy result types**

In `apps/api/src/modules/strategy/strategy.client.ts`, extend the existing types:

```ts
export type StrategyRunResult = {
  symbol: string;
  timeframe: string;
  bar_time: number | null;
  market_state: string;
  signals: Array<{
    type: string;
    title: string;
    engine: string;
    side: "long" | "short" | "flat";
    action?: string | null;
    reduce_pct?: number | null;
    price: number;
    stop_price?: number | null;
    take_profit_price?: number | null;
    score_impact: number;
  }>;
  metrics: Record<string, number | null>;
  diagnostics?: {
    market_state_text?: string;
    risk_status?: string;
    active_engine?: string;
    current_position?: string;
    current_r?: number | null;
    remaining_position_pct?: number | null;
    bands?: Array<{ open_time: number; avg?: number | null; upper?: number | null; lower?: number | null; direction?: number }>;
    support?: { top?: number | null; bottom?: number | null; strength?: number; touched?: boolean };
    resistance?: { top?: number | null; bottom?: number | null; strength?: number; touched?: boolean };
  };
};
```

- [ ] **Step 5: Run model test and API build**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_strategy_models -v
npm run build -w apps/api
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- services/strategy/app/models.py services/strategy/tests/test_strategy_models.py apps/api/src/modules/strategy/strategy.client.ts
git commit -m "feat: extend strategy signal diagnostics contract"
```

## Task 3: Pine-Like Position State Emulator

**Files:**
- Create: `services/strategy/app/strategies/pine_state.py`
- Create: `services/strategy/tests/test_pine_state.py`

- [ ] **Step 1: Write failing state emulator tests**

```python
# services/strategy/tests/test_pine_state.py
import unittest

from app.strategies.pine_state import PinePositionState


class PinePositionStateTest(unittest.TestCase):
    def test_entries_update_position_size_average_price_and_open_trades(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        state.entry("趋势加仓买入", "long", price=110.0, qty_pct=10.0, atr=2.5)
        self.assertGreater(state.position_size, 0)
        self.assertEqual(state.open_trades, 2)
        self.assertAlmostEqual(state.position_avg_price, 105.0)
        self.assertEqual(state.current_position, "多单")

    def test_reverse_entry_closes_opposite_side_before_new_entry(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        state.close_side("long", exit_price=98.0)
        state.entry("趋势开空", "short", price=98.0, qty_pct=10.0, atr=2.0)
        self.assertLess(state.position_size, 0)
        self.assertEqual(state.consecutive_losses, 1)
        self.assertEqual(state.current_position, "空单")

    def test_reduce_order_marks_weak_reduce_once(self):
        state = PinePositionState()
        state.entry("趋势买入", "long", price=100.0, qty_pct=10.0, atr=2.0)
        reduce_event = state.reduce("reduce_long", side="long", price=106.0, reduce_pct=25.0)
        self.assertEqual(reduce_event.action, "reduce_long")
        self.assertEqual(reduce_event.reduce_pct, 25.0)
        self.assertTrue(state.long_weak_reduce_done)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the state tests and verify they fail**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_pine_state -v
```

Expected: ERROR importing `app.strategies.pine_state`.

- [ ] **Step 3: Implement the minimal emulator**

Create `services/strategy/app/strategies/pine_state.py`:

```python
from dataclasses import dataclass


@dataclass
class PineOrderEvent:
    action: str
    side: str
    price: float
    reduce_pct: float | None = None


@dataclass
class PineLayer:
    name: str
    side: str
    price: float
    qty: float
    atr: float | None


class PinePositionState:
    def __init__(self) -> None:
        self.layers: list[PineLayer] = []
        self.position_size = 0.0
        self.position_avg_price = 0.0
        self.consecutive_losses = 0
        self.last_loss_bar: int | None = None
        self.long_weak_reduce_done = False
        self.short_weak_reduce_done = False
        self.position_peak_size = 0.0

    @property
    def open_trades(self) -> int:
        return len(self.layers)

    @property
    def current_position(self) -> str:
        if self.position_size > 0:
            return "多单"
        if self.position_size < 0:
            return "空单"
        return "空仓"

    def entry(self, name: str, side: str, price: float, qty_pct: float, atr: float | None) -> PineOrderEvent:
        qty = abs(qty_pct)
        signed_qty = qty if side == "long" else -qty
        previous_abs = abs(self.position_size)
        next_abs = previous_abs + qty
        if previous_abs == 0:
            self.position_avg_price = price
            self.long_weak_reduce_done = False
            self.short_weak_reduce_done = False
        else:
            self.position_avg_price = ((self.position_avg_price * previous_abs) + (price * qty)) / next_abs
        self.position_size += signed_qty
        self.position_peak_size = max(self.position_peak_size, abs(self.position_size))
        self.layers.append(PineLayer(name=name, side=side, price=price, qty=qty, atr=atr))
        return PineOrderEvent(action="open_long" if side == "long" else "open_short", side=side, price=price)

    def close_side(self, side: str, exit_price: float) -> None:
        if not self.layers:
            return
        is_loss = (side == "long" and exit_price < self.position_avg_price) or (side == "short" and exit_price > self.position_avg_price)
        self.consecutive_losses = self.consecutive_losses + 1 if is_loss else 0
        self.layers = []
        self.position_size = 0.0
        self.position_avg_price = 0.0
        self.position_peak_size = 0.0

    def reduce(self, action: str, side: str, price: float, reduce_pct: float) -> PineOrderEvent:
        if side == "long":
            self.long_weak_reduce_done = True
        if side == "short":
            self.short_weak_reduce_done = True
        self.position_size *= max(0.0, 1.0 - reduce_pct / 100)
        return PineOrderEvent(action=action, side=side, price=price, reduce_pct=reduce_pct)
```

- [ ] **Step 4: Run state tests and verify they pass**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_pine_state -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- services/strategy/app/strategies/pine_state.py services/strategy/tests/test_pine_state.py
git commit -m "feat: add pine strategy state emulator"
```

## Task 4: Pine V6 Strategy Replay Core

**Files:**
- Create: `services/strategy/app/strategies/emd_v6.py`
- Modify: `services/strategy/app/strategies/emd_trend.py`
- Create: `services/strategy/tests/fixtures.py`
- Create: `services/strategy/tests/test_emd_v6_strategy.py`

- [ ] **Step 1: Write failing strategy replay tests**

```python
# services/strategy/tests/test_emd_v6_strategy.py
import unittest

from app.models import Candle, StrategyRunRequest
from app.strategies.emd_trend import run_emd_trend_strategy


def candles_from_closes(closes):
    output = []
    for index, close in enumerate(closes):
        open_price = closes[index - 1] if index else close
        high = max(open_price, close) + 1
        low = min(open_price, close) - 1
        output.append(Candle(open_time=1710000000000 + index * 300000, open=open_price, high=high, low=low, close=close, volume=1000))
    return output


class EmdV6StrategyReplayTest(unittest.TestCase):
    def test_no_signal_for_short_history(self):
        request = StrategyRunRequest(symbol="BTCUSDT", timeframe="5m", candles=candles_from_closes([100, 101, 102]))
        response = run_emd_trend_strategy(request)
        self.assertEqual(response.signals, [])
        self.assertIn(response.market_state, {"insufficient_data", "transition_observation", "long_trend_no_signal"})

    def test_trend_long_signal_uses_pine_signal_family(self):
        closes = [100, 99, 98, 97, 96, 97, 98, 100, 103, 106, 110, 114, 118, 122, 126, 130, 135, 140, 146, 152, 158, 164, 170, 176, 182, 188, 194, 200, 208, 216, 224, 232, 240, 248, 256]
        candles = candles_from_closes(closes)
        request = StrategyRunRequest(symbol="BTCUSDT", timeframe="5m", candles=candles, mtf_candles=candles, htf_candles=candles)
        response = run_emd_trend_strategy(request)
        signal_types = [signal.type for signal in response.signals]
        self.assertIn("trend_long_signal", signal_types)
        self.assertEqual(response.diagnostics.active_engine, "趋势")

    def test_weak_reduce_signal_is_reduce_action_not_new_short(self):
        closes = [100, 99, 98, 97, 96, 98, 101, 105, 110, 116, 123, 131, 140, 150, 161, 173, 186, 200, 214, 226, 236, 244, 250, 253, 255, 254, 252, 249, 245, 240, 234, 229, 225, 222, 220, 219]
        candles = candles_from_closes(closes)
        request = StrategyRunRequest(symbol="BTCUSDT", timeframe="5m", candles=candles, mtf_candles=candles, htf_candles=candles)
        response = run_emd_trend_strategy(request)
        reduce_signals = [signal for signal in response.signals if signal.type == "weak_reduce_long_signal"]
        if reduce_signals:
            self.assertEqual(reduce_signals[0].action, "reduce_long")
            self.assertEqual(reduce_signals[0].side, "long")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run strategy tests and verify at least one fails against the shell implementation**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_emd_v6_strategy -v
```

Expected: FAIL because diagnostics are absent or the current shell does not emit the Pine signal families consistently.

- [ ] **Step 3: Implement `emd_v6.py` with a focused public entrypoint**

Create `services/strategy/app/strategies/emd_v6.py` with these public functions and keep internal helpers small. The first committed version of this file must contain working replay logic in `run`; do not commit stubs.

```python
from app.indicators import atr_series, bollinger_width_pct_series, dmi_adx_series, ema_series, pivot_high_series, pivot_low_series, rma_series, rsi_series
from app.models import StrategyDiagnostics, StrategyRunRequest, StrategyRunResponse, StrategySignal
from app.scoring import score_strategy_signal
from app.strategies.pine_state import PinePositionState


def run_emd_v6_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    engine = EmdV6Engine(payload)
    return engine.run()


class EmdV6Engine:
    def __init__(self, payload: StrategyRunRequest) -> None:
        self.payload = payload
        self.state = PinePositionState()

    def run(self) -> StrategyRunResponse:
        if len(self.payload.candles) < max(35, self.payload.config.length):
            return StrategyRunResponse(
                symbol=self.payload.symbol,
                timeframe=self.payload.timeframe,
                bar_time=self.payload.candles[-1].open_time if self.payload.candles else None,
                market_state="insufficient_data",
                signals=[],
                metrics={},
            )
        series = self.build_series()
        latest_signals = self.replay(series)
        return self.make_response(series, latest_signals)
```

Implement `build_series`, `replay`, and `make_response` by porting these Pine blocks in order:

```text
2 current timeframe EMD trend
3 HTF direction with confirmed HTF candle
4 MTF trend health
5 base indicators
6 market state engine
7 risk guards
8 support/resistance zones
9 trend engine
10 pullback add engine
11 break retest add engine
12 reversal engine
13 position management state records
14 active engine
15 reverse close logic
16 entry logic
17 exit/reduce risk lines as diagnostics
```

Signal creation must use exact type/action mapping:

```python
SIGNAL_DEFS = {
    "trend_long_signal": ("open_long", "trend", "long", "趋势买入"),
    "trend_short_signal": ("open_short", "trend", "short", "趋势开空"),
    "resume_long": ("add_long", "trend_pullback_add", "long", "趋势回踩加仓买入"),
    "resume_short": ("add_short", "trend_pullback_add", "short", "趋势反抽加仓开空"),
    "break_retest_long_add": ("add_long", "break_retest_add", "long", "突破回踩加仓买入"),
    "break_retest_short_add": ("add_short", "break_retest_add", "short", "跌破反抽加仓开空"),
    "reversal_long_signal": ("open_long", "reversal_support", "long", "支撑反转买入"),
    "reversal_short_signal": ("open_short", "reversal_resistance", "short", "压力反转开空"),
    "weak_reduce_long_signal": ("reduce_long", "trend_weakness", "long", "趋势转弱减多仓"),
    "weak_reduce_short_signal": ("reduce_short", "trend_weakness", "short", "趋势转弱减空仓"),
}
```

- [ ] **Step 4: Make `emd_trend.py` a compatibility wrapper**

Replace `services/strategy/app/strategies/emd_trend.py` with:

```python
from app.models import StrategyRunRequest, StrategyRunResponse
from app.strategies.emd_v6 import run_emd_v6_strategy


def run_emd_trend_strategy(payload: StrategyRunRequest) -> StrategyRunResponse:
    return run_emd_v6_strategy(payload)
```

- [ ] **Step 5: Run strategy replay tests**

Run:

```powershell
.venv\Scripts\python.exe -m unittest services.strategy.tests.test_emd_v6_strategy -v
```

Expected: PASS.

- [ ] **Step 6: Run all strategy service tests**

Run:

```powershell
.venv\Scripts\python.exe -m unittest discover services/strategy/tests -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- services/strategy/app/strategies/emd_v6.py services/strategy/app/strategies/emd_trend.py services/strategy/tests/fixtures.py services/strategy/tests/test_emd_v6_strategy.py
git commit -m "feat: port pine v6 emd strategy core"
```

## Task 5: API Signal Mapping And Persistence Contract

**Files:**
- Create: `apps/api/tests/strategy-contract.test.mjs`
- Modify: `apps/api/src/modules/strategy/strategy.service.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write failing API contract tests**

```js
// apps/api/tests/strategy-contract.test.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const serviceSource = readFileSync(new URL("../src/modules/strategy/strategy.service.ts", import.meta.url), "utf8");

assert.match(serviceSource, /action:\s*signal\.action\s*\?\?/);
assert.match(serviceSource, /reduce_pct|reducePct/);
assert.match(serviceSource, /diagnostics:\s*result\.diagnostics/);
assert.match(serviceSource, /reduce_long|reduce_short/);

console.log("strategy contract mapping assertions passed");
```

- [ ] **Step 2: Add npm script and verify test fails**

In `apps/api/package.json` add:

```json
"test:strategy-contract": "node tests/strategy-contract.test.mjs"
```

Run:

```powershell
npm run test:strategy-contract -w apps/api
```

Expected: FAIL because `strategy.service.ts` does not map `action` or diagnostics yet.

- [ ] **Step 3: Preserve new strategy fields in persistence payload**

In `mapStrategySignals(result)` inside `apps/api/src/modules/strategy/strategy.service.ts`, include action fields:

```ts
payload: {
  engine: signal.engine,
  action: signal.action ?? null,
  reducePct: signal.reduce_pct ?? null,
  marketState: result.market_state,
  diagnostics: result.diagnostics ?? null,
  metrics: result.metrics,
  stopPrice: signal.stop_price ?? null,
  takeProfitPrice: signal.take_profit_price ?? null
}
```

Update the dedupe key:

```ts
signal.action ?? signal.side
```

as an additional key part after `signal.side`.

- [ ] **Step 4: Preserve diagnostics in `runStrategy` response**

No special wrapping is needed if `StrategyClient` returns diagnostics. Verify `runStrategy()` returns `result` unchanged:

```ts
return {
  result,
  marketData: {
    source: enrichedPayload.market_data_source ?? "request",
    candles: enrichedPayload.candles?.length ?? 0
  },
  persistence
};
```

- [ ] **Step 5: Label reduce/add alert candidates safely**

In `extractAlertCandidates`, include action metadata:

```ts
action: signal.action ?? undefined,
signalType: signal.type,
```

In `buildReason`, branch action text:

```ts
const action = signal.action ?? "";
const directionText = action.startsWith("reduce_")
  ? (signal.side === "short" ? "策略提示减空，不是新做多信号" : "策略提示减多，不是新做空信号")
  : signal.side === "short"
    ? "策略触发做空方向"
    : "策略触发做多方向";
```

- [ ] **Step 6: Run API contract and build**

Run:

```powershell
npm run test:strategy-contract -w apps/api
npm run build -w apps/api
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- apps/api/src/modules/strategy/strategy.service.ts apps/api/package.json apps/api/tests/strategy-contract.test.mjs
git commit -m "feat: map pine strategy actions through api"
```

## Task 6: Hidden K-Line Lab Uses Backend Strategy Output

**Files:**
- Create: `apps/web/tests/kline-lab-strategy-source.test.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/features/klineLab/KlineLabView.tsx`
- Modify: `apps/web/src/features/klineLab/klineConfirmation.ts`

- [ ] **Step 1: Write failing frontend source-of-truth test**

```js
// apps/web/tests/kline-lab-strategy-source.test.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const view = readFileSync(new URL("../src/features/klineLab/KlineLabView.tsx", import.meta.url), "utf8");
const confirmation = readFileSync(new URL("../src/features/klineLab/klineConfirmation.ts", import.meta.url), "utf8");

assert.match(view, /\/api\/strategy\/run/);
assert.match(view, /diagnostics/);
assert.match(view, /StrategyDiagnostics/);
assert.match(view, /策略输出/);
assert.doesNotMatch(view, /formatConfirmationLabel\(confirmation\).*aria-label="K线验证确认"/s);
assert.match(confirmation, /candle quality|蜡烛质量|K线质量/);

console.log("kline lab strategy source assertions passed");
```

- [ ] **Step 2: Add npm script and verify it fails**

In `apps/web/package.json` add:

```json
"test:kline-strategy-source": "node tests/kline-lab-strategy-source.test.mjs"
```

Run:

```powershell
npm run test:kline-strategy-source -w apps/web
```

Expected: FAIL because K-line lab does not call `/api/strategy/run` for diagnostics yet.

- [ ] **Step 3: Add strategy run fetch state to KlineLabView**

In `KlineLabView.tsx`, add response types:

```ts
type StrategyDiagnostics = {
  market_state_text?: string;
  risk_status?: string;
  active_engine?: string;
  current_position?: string;
  current_r?: number | null;
  remaining_position_pct?: number | null;
  bands?: KlineBandPoint[];
  support?: { top?: number | null; bottom?: number | null; strength?: number; touched?: boolean };
  resistance?: { top?: number | null; bottom?: number | null; strength?: number; touched?: boolean };
};

type StrategyRunResponse = {
  result?: {
    symbol: string;
    timeframe: string;
    market_state: string;
    signals: StrategyInboxSignal[];
    diagnostics?: StrategyDiagnostics;
  };
};
```

Add state:

```ts
const [strategyDiagnostics, setStrategyDiagnostics] = useState<StrategyDiagnostics | null>(null);
const [strategyRunSignals, setStrategyRunSignals] = useState<StrategyInboxSignal[]>([]);
const [strategyRunState, setStrategyRunState] = useState<LoadState>("idle");
```

- [ ] **Step 4: Fetch backend strategy run when candles are ready**

Add an effect:

```ts
useEffect(() => {
  if (!canRequestInbox || candles.length < 35) return;
  let alive = true;
  setStrategyRunState("loading");
  apiPost<StrategyRunResponse>("/api/strategy/run", {
    symbol,
    timeframe,
    candles,
    limit: candles.length
  })
    .then((response) => {
      if (!alive) return;
      setStrategyDiagnostics(response.result?.diagnostics ?? null);
      setStrategyRunSignals(response.result?.signals ?? []);
      setStrategyRunState("ready");
    })
    .catch(() => {
      if (!alive) return;
      setStrategyDiagnostics(null);
      setStrategyRunSignals([]);
      setStrategyRunState("error");
    });
  return () => {
    alive = false;
  };
}, [canRequestInbox, candles, symbol, timeframe, refreshNonce]);
```

If `apiPost` is not exported from `apps/web/src/lib/api.ts`, add it next to `apiGet` with the same error behavior.

- [ ] **Step 5: Render strategy output as the primary panel**

Replace the current primary confirmation wording with a panel titled `策略输出`:

```tsx
<StrategyOutputPanel
  diagnostics={strategyDiagnostics}
  signals={strategyRunSignals.length ? strategyRunSignals : inboxSignals}
  status={strategyRunState}
/>
```

Keep the existing candle helper only below it with text `K线质量参考`, and do not use it to decide whether a strategy signal exists.

- [ ] **Step 6: Run frontend source test and existing K-line tests**

Run:

```powershell
npm run test:kline-strategy-source -w apps/web
npm run test:kline-realtime -w apps/web
npm run test:kline-confirmation -w apps/web
npm run build -w apps/web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- apps/web/src/features/klineLab/KlineLabView.tsx apps/web/src/features/klineLab/klineConfirmation.ts apps/web/src/lib/api.ts apps/web/package.json apps/web/tests/kline-lab-strategy-source.test.mjs
git commit -m "feat: show pine strategy output in kline lab"
```

## Task 7: Radar Labels For Add And Reduce Signals

**Files:**
- Modify: `apps/web/tests/live-signal-command.test.mjs`
- Modify: `apps/web/src/features/radar/liveSignalModel.ts`
- Modify: `apps/web/src/features/radar/LiveSignalCommand.tsx`

- [ ] **Step 1: Add failing radar label assertions**

In `apps/web/tests/live-signal-command.test.mjs`, add assertions that source contains the labels:

```js
assert.match(source, /加多|加空/);
assert.match(source, /减多|减空/);
assert.match(source, /reduce_long|reduce_short/);
```

- [ ] **Step 2: Run radar test and verify it fails**

Run:

```powershell
npm run test:radar-live -w apps/web
```

Expected: FAIL if reduce/add labels are absent.

- [ ] **Step 3: Preserve action in normalized live signals**

In `liveSignalModel.ts`, add optional `action` to `RawRadarSignal` and `LiveSignal`, then map it:

```ts
action: signal.action ?? signal.payload?.action,
```

If `payload` is not typed on `RawRadarSignal`, add:

```ts
payload?: { action?: string | null; reducePct?: number | null };
```

- [ ] **Step 4: Format add/reduce labels distinctly**

In `LiveSignalCommand.tsx`, update `formatSignalKind(signal)`:

```ts
if (signal.source === "market") return formatMarketMovementType(signal);
if (signal.action === "add_long") return "加多";
if (signal.action === "add_short") return "加空";
if (signal.action === "reduce_long") return "减多";
if (signal.action === "reduce_short") return "减空";
return isWaitingStrategySignal(signal) ? "等待信号" : "命中策略";
```

- [ ] **Step 5: Run radar test and build**

Run:

```powershell
npm run test:radar-live -w apps/web
npm run build -w apps/web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- apps/web/src/features/radar/liveSignalModel.ts apps/web/src/features/radar/LiveSignalCommand.tsx apps/web/tests/live-signal-command.test.mjs
git commit -m "feat: distinguish add and reduce radar signals"
```

## Task 8: Full Verification

**Files:**
- No new files.
- Run verification commands against the completed branch.

- [ ] **Step 1: Run Python strategy tests**

```powershell
.venv\Scripts\python.exe -m unittest discover services/strategy/tests -v
```

Expected: PASS.

- [ ] **Step 2: Run API tests and build**

```powershell
npm run test:strategy-contract -w apps/api
npm run test:market-stream -w apps/api
npm run test:entitlements -w apps/api
npm run build -w apps/api
```

Expected: PASS.

- [ ] **Step 3: Run web tests and build**

```powershell
npm run test:kline-strategy-source -w apps/web
npm run test:kline-realtime -w apps/web
npm run test:kline-confirmation -w apps/web
npm run test:radar-live -w apps/web
npm run test:view-routing -w apps/web
npm run test:entitlements -w apps/web
npm run build -w apps/web
```

Expected: PASS.

- [ ] **Step 4: Manual local smoke**

Use the existing local web server or start one on a free port. Open:

```text
http://127.0.0.1:3201/yansir/?view=kline-lab&symbol=BTC&tf=5m
```

Expected:

- Page is admin-only.
- K-line price continues updating.
- Primary panel is `策略输出`.
- The latest strategy signal, engine, risk state, and bands come from backend diagnostics.
- The page does not present frontend candle quality as the source of the signal.

- [ ] **Step 5: Commit verification notes if docs changed**

If verification requires documentation edits, commit only those files:

```powershell
git add -- docs/superpowers/plans/2026-07-05-yansir-pine-v6-strategy-source-implementation-plan.md
git commit -m "docs: record pine strategy verification plan"
```

## Self-Review

Spec coverage:

- Pine V6 as canonical source: Tasks 1 through 5.
- Stateful add/reduce/cooldown behavior: Tasks 3 and 4.
- API additive contract and persistence: Task 5.
- Hidden K-line lab as internal strategy panel: Task 6.
- Radar add/reduce distinction: Task 7.
- Verification across Python, API, and web: Task 8.

No unresolved scope gaps found.
