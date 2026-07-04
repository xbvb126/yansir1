import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { PaymentProviders } from "./payment.providers";

@Module({
  controllers: [BillingController],
  providers: [BillingRepository, BillingService, PaymentProviders],
  exports: [BillingService, PaymentProviders]
})
export class BillingModule {}
