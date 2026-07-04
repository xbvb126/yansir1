import { Controller, Get } from "@nestjs/common";
import { PaymentProviders } from "../billing/payment.providers";
import { DatabaseService } from "../database/database.service";
import { getAuthTokenSecretStatus } from "../users/auth-tokens";

@Controller("api/health")
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly paymentProviders: PaymentProviders
  ) {}

  @Get()
  async getHealth() {
    return {
      status: "ok",
      database: await this.database.health()
    };
  }

  @Get("readiness")
  async getReadiness() {
    const database = await this.database.health();
    const authSecret = getAuthTokenSecretStatus();
    const strategy = await checkStrategyHealth(process.env.STRATEGY_SERVICE_URL || "http://127.0.0.1:8000");
    const checks = {
      database,
      authSecret,
      feishu: {
        defaultWebhookConfigured: Boolean(process.env.FEISHU_WEBHOOK_URL)
      },
      billing: {
        webhookSecretConfigured: Boolean(process.env.BILLING_WEBHOOK_SECRET),
        defaultProvider: this.paymentProviders.defaultProvider(),
        providers: this.paymentProviders.statuses()
      },
      strategy,
      runtime: {
        nodeEnv: process.env.NODE_ENV || "development",
        apiPort: Number(process.env.API_PORT || 3101)
      }
    };
    const blockers = [
      database.connected ? null : "Postgres is not connected; persisted user, billing, team, and stored signal data are unavailable.",
      authSecret.usingDefault ? "AUTH_TOKEN_SECRET is missing or still using the development default." : null,
      process.env.BILLING_WEBHOOK_SECRET ? null : "BILLING_WEBHOOK_SECRET is missing; billing webhooks are open for local demo mode.",
      this.paymentProviders.defaultProvider() === "mock" ? "BILLING_PROVIDER is mock; configure a real payment provider before launch." : null,
      strategy.connected ? null : "Strategy service is not reachable."
    ].filter(Boolean);

    return {
      status: blockers.length ? "not_ready" : "ready",
      blockers,
      checks
    };
  }
}

async function checkStrategyHealth(serviceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/strategy/health`, {
      signal: controller.signal
    });
    return {
      serviceUrl,
      connected: response.ok,
      status: response.ok ? "ok" : `http_${response.status}`
    };
  } catch (error) {
    return {
      serviceUrl,
      connected: false,
      status: "error",
      error: (error as Error).message
    };
  } finally {
    clearTimeout(timeout);
  }
}
