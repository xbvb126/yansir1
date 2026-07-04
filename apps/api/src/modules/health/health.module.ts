import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [BillingModule],
  controllers: [HealthController]
})
export class HealthModule {}
