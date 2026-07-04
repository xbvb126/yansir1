export type BillingEventType =
  | "subscription.activated"
  | "subscription.renewed"
  | "subscription.canceled"
  | "subscription.expired"
  | "payment.failed";

export class BillingWebhookDto {
  event!: BillingEventType;
  userId?: string;
  phone?: string;
  planCode?: "free" | "vip" | "svip";
  expiresAt?: string;
  externalOrderId?: string;
  provider?: string;
}
