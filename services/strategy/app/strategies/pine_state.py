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

    def entry(
        self,
        name: str,
        side: str,
        price: float,
        qty_pct: float,
        atr: float | None,
    ) -> PineOrderEvent:
        if (side == "long" and self.position_size < 0) or (side == "short" and self.position_size > 0):
            raise ValueError("opposite-side entry requires closing the current position first")
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
        is_loss = (side == "long" and exit_price < self.position_avg_price) or (
            side == "short" and exit_price > self.position_avg_price
        )
        self.consecutive_losses = self.consecutive_losses + 1 if is_loss else 0
        self.layers = []
        self.position_size = 0.0
        self.position_avg_price = 0.0
        self.position_peak_size = 0.0

    def reduce(self, action: str, side: str, price: float, reduce_pct: float) -> PineOrderEvent:
        if not 0 <= reduce_pct <= 100:
            raise ValueError("reduce_pct must be between 0 and 100")
        if side == "long":
            self.long_weak_reduce_done = True
        if side == "short":
            self.short_weak_reduce_done = True
        remaining_factor = 1.0 - reduce_pct / 100
        self.position_size *= remaining_factor
        self.layers = [
            PineLayer(
                name=layer.name,
                side=layer.side,
                price=layer.price,
                qty=layer.qty * remaining_factor,
                atr=layer.atr,
            )
            for layer in self.layers
            if layer.qty * remaining_factor > 0
        ]
        if self.position_size == 0:
            self.position_avg_price = 0.0
            self.position_peak_size = 0.0
        return PineOrderEvent(action=action, side=side, price=price, reduce_pct=reduce_pct)
