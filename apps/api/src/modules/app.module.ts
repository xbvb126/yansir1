import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AlertsModule } from "./alerts/alerts.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ClawModule } from "./claw/claw.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { MarketModule } from "./market/market.module";
import { SignalsModule } from "./signals/signals.module";
import { StrategyModule } from "./strategy/strategy.module";
import { TeamModule } from "./team/team.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    UsersModule,
    BillingModule,
    MarketModule,
    SignalsModule,
    AlertsModule,
    ClawModule,
    StrategyModule,
    TeamModule
  ]
})
export class AppModule {}
