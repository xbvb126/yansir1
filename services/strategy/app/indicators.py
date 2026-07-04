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
