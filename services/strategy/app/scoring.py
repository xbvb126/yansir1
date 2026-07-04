def score_strategy_signal(signal_type: str) -> int:
    score_map = {
        "trend_long_signal": 18,
        "trend_short_signal": 18,
        "break_resistance": 12,
        "break_support": 12,
        "reversal_long_signal": 28,
        "reversal_short_signal": 28,
        "kline_reversal_long_signal": 35,
        "kline_reversal_short_signal": 35,
        "weak_reduce_long_signal": -8,
        "weak_reduce_short_signal": -8,
    }
    return score_map.get(signal_type, 0)
