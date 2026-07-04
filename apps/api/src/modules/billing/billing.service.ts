import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { BillingWebhookDto } from "./dto/billing-webhook.dto";
import { BillingRepository } from "./billing.repository";
import { CreateOrderDto } from "./dto/create-order.dto";
import { PaymentProviders } from "./payment.providers";
import { verifyAuthHeader } from "../users/auth-tokens";

@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly paymentProviders: PaymentProviders
  ) {}

  async listPlans() {
    return { plans: await this.billingRepository.findPlans() };
  }

  async createOrder(dto: CreateOrderDto, identity?: string) {
    const session = resolveBillingSession(identity);
    const provider = this.paymentProviders.ensureProvider(dto.provider);
    const order = await this.billingRepository.createOrder({
      ...dto,
      userId: session.userId,
      provider
    });
    const checkout = await this.paymentProviders.createCheckout(order);
    const nextOrder = checkout.checkoutUrl === order.checkoutUrl
      ? order
      : await this.billingRepository.updateCheckoutUrl(order.id, checkout.checkoutUrl);
    return { order: nextOrder, checkout };
  }

  async listOrders(userId?: string, identity?: string) {
    const session = resolveBillingSession(identity);
    if (session.role !== "admin" && userId && userId !== session.userId) {
      throw new ForbiddenException("Cannot access another user's orders");
    }

    const scopedUserId = session.role === "admin" ? userId : session.userId;
    return { orders: await this.billingRepository.listOrders(scopedUserId) };
  }

  listPaymentProviders() {
    return {
      defaultProvider: this.paymentProviders.defaultProvider(),
      providers: this.paymentProviders.statuses()
    };
  }

  async markOrderPaid(orderId: string, identity?: string) {
    const session = resolveBillingSession(identity);
    if (process.env.NODE_ENV === "production" && this.paymentProviders.defaultProvider() !== "manual") {
      throw new ForbiddenException("Manual payment confirmation is disabled for non-manual billing providers in production");
    }

    if (process.env.NODE_ENV === "production" && session.role !== "admin") {
      throw new ForbiddenException("Manual payment confirmation requires an admin account");
    }

    const existingOrder = await this.billingRepository.findOrder(orderId);
    if (!existingOrder) {
      throw new NotFoundException("Order not found");
    }

    if (session.role !== "admin" && existingOrder.userId !== session.userId) {
      throw new ForbiddenException("Cannot pay another user's order");
    }

    const result = await this.billingRepository.markOrderPaid(orderId);
    return {
      accepted: true,
      ...result
    };
  }

  async handleWebhook(dto: BillingWebhookDto) {
    const user = await this.billingRepository.applySubscriptionEvent(dto);
    return {
      accepted: true,
      event: dto.event,
      user
    };
  }
}

function resolveBillingSession(identity?: string) {
  const tokenPayload = verifyAuthHeader(identity);
  if (tokenPayload?.sub) {
    return {
      userId: tokenPayload.sub,
      role: tokenPayload.role
    };
  }

  if (identity && !identity.startsWith("Bearer ")) {
    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Bearer token is required");
    }

    return {
      userId: identity,
      role: "member"
    };
  }

  throw new UnauthorizedException("Valid session is required");
}
