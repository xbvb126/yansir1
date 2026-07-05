import { Controller, Get, MessageEvent, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { MarketService } from "./market.service";
import { MarketStreamService } from "./market-stream.service";

@Controller("api/market")
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketStreamService: MarketStreamService
  ) {}

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

  @Sse("kline-stream")
  streamKlines(
    @Query("symbol") symbol?: string,
    @Query("timeframe") timeframe?: string
  ): Observable<MessageEvent> {
    return this.marketStreamService.streamKlines(symbol, timeframe);
  }
}
