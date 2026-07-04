import { Module } from "@nestjs/common";
import { MarketModule } from "../market/market.module";
import { SignalsController } from "./signals.controller";
import { SignalsRepository } from "./signals.repository";
import { SignalsService } from "./signals.service";

@Module({
  imports: [MarketModule],
  controllers: [SignalsController],
  providers: [SignalsRepository, SignalsService],
  exports: [SignalsService]
})
export class SignalsModule {}
