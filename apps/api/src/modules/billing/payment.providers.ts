import { BadRequestException, Injectable } from "@nestjs/common";
import { BillingOrderRecord } from "../shared/mocks";
import { BillingProvider } from "./dto/create-order.dto";

export type PaymentProviderStatus = {
  provider: BillingProvider;
  enabled: boolean;
  mode: "mock" | "manual" | "external";
  message: string;
};

export type CheckoutSession = {
  provider: BillingProvider;
  checkoutUrl: string;
  externalCheckoutId?: string;
};

@Injectable()
export class PaymentProviders {
  statuses(): PaymentProviderStatus[] {
    return [
      {
        provider: "mock",
        enabled: true,
        mode: "mock",
        message: "Local demo payment is available."
      },
      {
        provider: "manual",
        enabled: true,
        mode: "manual",
        message: "Manual billing is enabled; orders require offline payment confirmation."
      },
      {
        provider: "stripe",
        enabled: Boolean(process.env.STRIPE_SECRET_KEY),
        mode: "external",
        message: process.env.STRIPE_SECRET_KEY
          ? "Stripe key is configured; wire Checkout Sessions in this adapter before production."
          : "STRIPE_SECRET_KEY is missing."
      },
      {
        provider: "wechat",
        enabled: Boolean(process.env.WECHAT_PAY_MCH_ID && process.env.WECHAT_PAY_API_KEY),
        mode: "external",
        message: process.env.WECHAT_PAY_MCH_ID && process.env.WECHAT_PAY_API_KEY
          ? "WeChat Pay credentials are configured."
          : "WECHAT_PAY_MCH_ID or WECHAT_PAY_API_KEY is missing."
      },
      {
        provider: "alipay",
        enabled: Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY),
        mode: "external",
        message: process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY
          ? "Alipay credentials are configured."
          : "ALIPAY_APP_ID or ALIPAY_PRIVATE_KEY is missing."
      }
    ];
  }

  defaultProvider(): BillingProvider {
    return normalizeProvider(process.env.BILLING_PROVIDER || "mock");
  }

  ensureProvider(provider?: BillingProvider) {
    const selected = normalizeProvider(provider || this.defaultProvider());
    if (selected === "mock" && process.env.NODE_ENV === "production") {
      throw new BadRequestException("Mock payment provider is disabled in production");
    }

    const status = this.statuses().find((item) => item.provider === selected);
    if (!status?.enabled) {
      throw new BadRequestException(`${selected} payment provider is not configured`);
    }

    return selected;
  }

  async createCheckout(order: BillingOrderRecord): Promise<CheckoutSession> {
    const provider = this.ensureProvider(order.provider);
    if (provider === "mock") {
      return {
        provider,
        checkoutUrl: `/api/billing/orders/${order.id}/mock-checkout`,
        externalCheckoutId: `mock_${order.id}`
      };
    }

    if (provider === "manual") {
      return {
        provider,
        checkoutUrl: `/yansir/?view=plans&order=${order.id}&payment=manual`,
        externalCheckoutId: `manual_${order.id}`
      };
    }

    if (provider === "stripe") {
      throw new BadRequestException("Stripe Checkout Sessions adapter is not connected yet");
    }

    if (provider === "wechat") {
      throw new BadRequestException("WeChat Pay adapter is not connected yet");
    }

    throw new BadRequestException("Alipay adapter is not connected yet");
  }
}

function normalizeProvider(value: string): BillingProvider {
  const normalized = value.toLowerCase();
  if (normalized === "manual") return "manual";
  if (normalized === "stripe") return "stripe";
  if (normalized === "wechat") return "wechat";
  if (normalized === "alipay") return "alipay";
  return "mock";
}
