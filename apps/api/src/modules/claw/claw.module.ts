import { Module } from "@nestjs/common";
import { ClawController } from "./claw.controller";
import { ClawService } from "./claw.service";
import { MarketModule } from "../market/market.module";
import { SignalsModule } from "../signals/signals.module";

@Module({
  imports: [MarketModule, SignalsModule],
  controllers: [ClawController],
  providers: [ClawService]
})
export class ClawModule {}
