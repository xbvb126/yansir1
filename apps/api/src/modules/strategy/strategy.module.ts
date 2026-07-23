import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { MarketModule } from "../market/market.module";
import { SignalsModule } from "../signals/signals.module";
import { UsersModule } from "../users/users.module";
import { CloseEvaluationRepository } from "./close-evaluation.repository";
import { StrategyClient } from "./strategy.client";
import { StrategyController } from "./strategy.controller";
import { StrategyService } from "./strategy.service";

@Module({
  imports: [AlertsModule, MarketModule, SignalsModule, UsersModule],
  controllers: [StrategyController],
  providers: [CloseEvaluationRepository, StrategyClient, StrategyService],
  exports: [CloseEvaluationRepository, StrategyClient, StrategyService]
})
export class StrategyModule {}
