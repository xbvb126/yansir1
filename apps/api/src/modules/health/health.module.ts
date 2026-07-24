import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { StrategyModule } from "../strategy/strategy.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [BillingModule, StrategyModule],
  controllers: [HealthController]
})
export class HealthModule {}
