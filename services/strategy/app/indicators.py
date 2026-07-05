from collections.abc import Sequence


def sma(values: Sequence[float], length: int) -> float | None:
    if len(values) < length or length <= 0:
        return None
    return sum(values[-length:]) / length


def ema_series(values: Sequence[float], length: int) -> list[float | None]:
    if not values:
        return []
    alpha = 2 / (length + 1)
    result: list[float | None] = []
    current: float | None = None
    for value in values:
        current = value if current is None else alpha * value + (1 - alpha) * current
        result.append(current)
    return result


def rma_series(values: Sequence[float], length: int) -> list[float | None]:
    if not values:
        return []
    result: list[float | None] = []
    current: float | None = None
    alpha = 1 / length
    for value in values:
        current = value if current is None else alpha * value + (1 - alpha) * current
        result.append(current)
    return result


def true_ranges(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]) -> list[float]:
    ranges: list[float] = []
    for index, high in enumerate(highs):
        low = lows[index]
        prev_close = closes[index - 1] if index > 0 else closes[index]
        ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
    return ranges


def atr_series(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], length: int) -> list[float | None]:
    return rma_series(true_ranges(highs, lows, closes), length)


def rsi_series(closes: Sequence[float], length: int) -> list[float | None]:
    gains: list[float] = [0.0]
    losses: list[float] = [0.0]
    for index in range(1, len(closes)):
        change = closes[index] - closes[index - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gains = rma_series(gains, length)
    avg_losses = rma_series(losses, length)
    output: list[float | None] = []
    for gain, loss in zip(avg_gains, avg_losses, strict=True):
        if gain is None or loss is None:
            output.append(None)
        elif loss == 0:
            output.append(100.0)
        else:
            rs = gain / loss
            output.append(100 - (100 / (1 + rs)))
    return output


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
