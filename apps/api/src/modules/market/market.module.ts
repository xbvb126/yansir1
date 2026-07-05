import { Module } from "@nestjs/common";
import { MarketController } from "./market.controller";
import { MarketService } from "./market.service";
import { MarketStreamService } from "./market-stream.service";

@Module({
  controllers: [MarketController],
  providers: [MarketService, MarketStreamService],
  exports: [MarketService, MarketStreamService]
})
export class MarketModule {}
