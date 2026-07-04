import { Controller, Get, Query } from "@nestjs/common";
import { MarketService } from "./market.service";

@Controller("api/market")
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get("overview")
  getOverview() {
    return this.marketService.getOverview();
  }

  @Get("ticker")
  getTicker(@Query("symbol") symbol?: string) {
    return this.marketService.getTicker(symbol);
  }

  @Get("klines")
  getKlines(
    @Query("symbol") symbol?: string,
    @Query("timeframe") timeframe?: string,
    @Query("limit") limit?: string
  ) {
    return this.marketService.getKlines(symbol, timeframe, Number(limit));
  }
}
