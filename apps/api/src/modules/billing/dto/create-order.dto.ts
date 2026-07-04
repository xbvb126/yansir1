export type BillingProvider = "mock" | "manual" | "stripe" | "wechat" | "alipay";

export class CreateOrderDto {
  userId?: string;
  phone?: string;
  planCode?: string;
  provider?: BillingProvider;
}
