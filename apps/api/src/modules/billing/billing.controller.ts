import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { BillingWebhookDto } from "./dto/billing-webhook.dto";
import { BillingService } from "./billing.service";
import { CreateOrderDto } from "./dto/create-order.dto";

@Controller("api/billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("plans")
  getPlans() {
    return this.billingService.listPlans();
  }

  @Get("orders")
  getOrders(@Query("userId") userId?: string, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") fallbackUserId?: string) {
    return this.billingService.listOrders(userId, authorization || fallbackUserId);
  }

  @Get("providers")
  getProviders() {
    return this.billingService.listPaymentProviders();
  }

  @Post("orders")
  createOrder(@Body() dto: CreateOrderDto, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") fallbackUserId?: string) {
    return this.billingService.createOrder(dto, authorization || fallbackUserId);
  }

  @Post("orders/:orderId/pay")
  markOrderPaid(@Param("orderId") orderId: string, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") fallbackUserId?: string) {
    return this.billingService.markOrderPaid(orderId, authorization || fallbackUserId);
  }

  @Post("webhook")
  handleWebhook(@Body() dto: BillingWebhookDto, @Headers("x-billing-webhook-secret") secret?: string) {
    const expectedSecret = process.env.BILLING_WEBHOOK_SECRET;
    if (!expectedSecret && process.env.NODE_ENV === "production") {
      throw new ForbiddenException("Billing webhook secret is required");
    }

    if (expectedSecret && secret !== expectedSecret) {
      throw new ForbiddenException("Invalid billing webhook secret");
    }

    return this.billingService.handleWebhook(dto);
  }
}
