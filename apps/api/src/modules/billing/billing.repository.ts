import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { BillingOrderRecord, mockPlans, PlanRecord, UserRecord } from "../shared/mocks";
import { BillingWebhookDto } from "./dto/billing-webhook.dto";
import { BillingProvider } from "./dto/create-order.dto";

type PlanRow = {
  code: string;
  name: string;
  monthly_price_cents: number;
  daily_signal_quota: number;
  supports_feishu: boolean;
  supports_api: boolean;
  supports_team: boolean;
  supports_backtest: boolean;
  max_watchlist_symbols: number | null;
  allowed_timeframes: string[] | null;
  realtime_delay_hours: number | null;
  history_days: number | null;
  min_alert_score: number | null;
  max_push_per_day: number | null;
  supports_signal_outcomes: boolean | null;
};

type BillingOrderRow = {
  id: string;
  user_id: string;
  plan_code: string;
  plan_name: string;
  provider: BillingOrderRecord["provider"];
  amount_cents: number;
  status: BillingOrderRecord["status"];
  checkout_url: string | null;
  created_at: Date | string;
  paid_at: Date | string | null;
};

@Injectable()
export class BillingRepository {
  constructor(private readonly database: DatabaseService) {}

  async findPlans(): Promise<PlanRecord[]> {
    const rows = await this.database.query<PlanRow>(
      `
        select
          code,
          name,
          monthly_price_cents,
          daily_signal_quota,
          supports_feishu,
          supports_api,
          supports_team,
          supports_backtest,
          max_watchlist_symbols,
          allowed_timeframes,
          realtime_delay_hours,
          history_days,
          min_alert_score,
          max_push_per_day,
          supports_signal_outcomes
        from plans
        order by monthly_price_cents asc
      `
    );

    if (!rows.length) {
      return mockPlans;
    }

    return rows.map((row) => ({
      id: row.code,
      code: row.code,
      name: row.name,
      price: Number(row.monthly_price_cents) / 100,
      signalQuota: Number(row.daily_signal_quota),
      feishu: row.supports_feishu,
      apiAccess: row.supports_api,
      maxWatchlistSymbols: Number(row.max_watchlist_symbols ?? fallbackPlanValue(row.code, "maxWatchlistSymbols")),
      allowedTimeframes: normalizeTimeframes(row.allowed_timeframes ?? fallbackPlanValue(row.code, "allowedTimeframes")),
      realtimeDelayHours: Number(row.realtime_delay_hours ?? fallbackPlanValue(row.code, "realtimeDelayHours")),
      historyDays: Number(row.history_days ?? fallbackPlanValue(row.code, "historyDays")),
      minAlertScore: Number(row.min_alert_score ?? fallbackPlanValue(row.code, "minAlertScore")),
      maxPushPerDay: Number(row.max_push_per_day ?? fallbackPlanValue(row.code, "maxPushPerDay")),
      signalOutcomes: Boolean(row.supports_signal_outcomes ?? fallbackPlanValue(row.code, "signalOutcomes")),
      teamSeats: row.supports_team ? 5 : 0,
      features: buildFeatures(row)
    }));
  }

  async createOrder(input: { userId?: string; phone?: string; planCode?: string; provider?: BillingProvider }): Promise<BillingOrderRecord> {
    const planCode = normalizePlanCode(input.planCode ?? "vip");
    const provider = input.provider ?? "mock";
    const plans = await this.findPlans();
    const plan = plans.find((item) => item.id === planCode || item.name.toLowerCase() === planCode.toLowerCase());
    if (!plan || plan.id === "free") {
      throw new BadRequestException("A paid plan is required");
    }

    const rows = await this.database.query<BillingOrderRow>(
      `
        with selected_user as (
          select id
          from users
          where ($1::text is not null and id::text = $1)
             or ($2::text is not null and phone = $2)
          order by created_at asc
          limit 1
        ),
        fallback_user as (
          select id
          from users
          order by created_at asc
          limit 1
        ),
        selected_plan as (
          select id, code, name, monthly_price_cents
          from plans
          where code = $3
          limit 1
        ),
        inserted_order as (
          insert into billing_orders (user_id, plan_id, provider, amount_cents, status, checkout_url)
          select
            coalesce((select id from selected_user), (select id from fallback_user)),
            selected_plan.id,
            $4,
            selected_plan.monthly_price_cents,
            'pending',
            '/api/billing/orders/mock-checkout/' || selected_plan.code
          from selected_plan
          where selected_plan.monthly_price_cents > 0
          returning id::text, user_id::text, plan_id, provider, amount_cents, status, checkout_url, created_at, paid_at
        )
        select
          inserted_order.id,
          inserted_order.user_id,
          selected_plan.code as plan_code,
          selected_plan.name as plan_name,
          inserted_order.provider,
          inserted_order.amount_cents,
          inserted_order.status,
          inserted_order.checkout_url,
          inserted_order.created_at,
          inserted_order.paid_at
        from inserted_order
        join selected_plan on selected_plan.id = inserted_order.plan_id
      `,
      [input.userId ?? null, input.phone ? normalizePhone(input.phone) : null, planCode, provider]
    );

    if (rows[0]) {
      return mapOrderRow(rows[0]);
    }

    throw new ServiceUnavailableException("Database is required to create real billing orders");
  }

  async listOrders(userId?: string): Promise<BillingOrderRecord[]> {
    const rows = await this.database.query<BillingOrderRow>(
      `
        select
          bo.id::text,
          bo.user_id::text,
          p.code as plan_code,
          p.name as plan_name,
          bo.provider,
          bo.amount_cents,
          bo.status,
          bo.checkout_url,
          bo.created_at,
          bo.paid_at
        from billing_orders bo
        join plans p on p.id = bo.plan_id
        where ($1::text is null or bo.user_id::text = $1)
        order by bo.created_at desc
        limit 50
      `,
      [userId ?? null]
    );

    if (rows.length) {
      return rows.map(mapOrderRow);
    }

    return [];
  }

  async findOrder(orderId: string): Promise<BillingOrderRecord | null> {
    const rows = await this.database.query<BillingOrderRow>(
      `
        select
          bo.id::text,
          bo.user_id::text,
          p.code as plan_code,
          p.name as plan_name,
          bo.provider,
          bo.amount_cents,
          bo.status,
          bo.checkout_url,
          bo.created_at,
          bo.paid_at
        from billing_orders bo
        join plans p on p.id = bo.plan_id
        where bo.id::text = $1
        limit 1
      `,
      [orderId]
    );

    if (rows[0]) {
      return mapOrderRow(rows[0]);
    }

    return null;
  }

  async updateCheckoutUrl(orderId: string, checkoutUrl: string): Promise<BillingOrderRecord> {
    const rows = await this.database.query<BillingOrderRow>(
      `
        update billing_orders
        set checkout_url = $2
        where id::text = $1
        returning
          id::text,
          user_id::text,
          (select code from plans where id = billing_orders.plan_id) as plan_code,
          (select name from plans where id = billing_orders.plan_id) as plan_name,
          provider,
          amount_cents,
          status,
          checkout_url,
          created_at,
          paid_at
      `,
      [orderId, checkoutUrl]
    );

    if (rows[0]) {
      return mapOrderRow(rows[0]);
    }

    throw new NotFoundException("Order not found");
  }

  async markOrderPaid(orderId: string): Promise<{ order: BillingOrderRecord; user: UserRecord }> {
    const rows = await this.database.query<BillingOrderRow>(
      `
        with paid_order as (
          update billing_orders
          set status = 'paid', paid_at = coalesce(paid_at, now())
          where id::text = $1 and status = 'pending'
          returning id::text, user_id::text, plan_id, provider, amount_cents, status, checkout_url, created_at, paid_at
        )
        select
          paid_order.id,
          paid_order.user_id,
          p.code as plan_code,
          p.name as plan_name,
          paid_order.provider,
          paid_order.amount_cents,
          paid_order.status,
          paid_order.checkout_url,
          paid_order.created_at,
          paid_order.paid_at
        from paid_order
        join plans p on p.id = paid_order.plan_id
      `,
      [orderId]
    );

    if (rows[0]) {
      const order = mapOrderRow(rows[0]);
      const user = await this.applySubscriptionEvent({
        event: "subscription.activated",
        userId: order.userId,
        planCode: normalizePlanCode(order.planCode),
        provider: order.provider,
        externalOrderId: order.id
      });
      return { order, user };
    }

    throw new NotFoundException("Order not found");
  }

  async applySubscriptionEvent(dto: BillingWebhookDto): Promise<UserRecord> {
    if (!dto.userId && !dto.phone && !dto.externalOrderId) {
      throw new BadRequestException("userId, phone, or externalOrderId is required");
    }

    const nextPlanCode = dto.planCode ?? null;
    const nextStatus = statusForEvent(dto.event);
    const expiresAt = dto.expiresAt ?? defaultExpiresAt(dto.event);
    const orderStatus = orderStatusForEvent(dto.event);
    const rows = await this.database.query<UserRow>(
      `
        with matched_order as (
          select bo.id, bo.user_id, bo.plan_id
          from billing_orders bo
          where $8::text is not null
            and (bo.id::text = $8::text or bo.external_order_id = $8::text)
          limit 1
        ),
        selected_user as (
          select id, phone from users
          where ($1::text is not null and id::text = $1)
             or ($2::text is not null and phone = $2)
             or id in (select user_id from matched_order)
          limit 1
        ),
        requested_plan as (
          select id, name, monthly_price_cents, daily_signal_quota, supports_team
          from plans
          where code = coalesce($3, (select p.code from matched_order mo join plans p on p.id = mo.plan_id))
          limit 1
        ),
        current_active_plan as (
          select p.id, p.name, p.monthly_price_cents, p.daily_signal_quota, p.supports_team
          from subscriptions s
          join plans p on p.id = s.plan_id
          where s.user_id in (select id from selected_user)
            and s.status = 'active'
          order by p.monthly_price_cents desc
          limit 1
        ),
        selected_plan as (
          select id, name, daily_signal_quota, supports_team
          from (
            select * from requested_plan
            union all
            select * from current_active_plan
          ) candidates
          order by monthly_price_cents desc
          limit 1
        ),
        updated_order as (
          update billing_orders
          set
            status = $9::text,
            paid_at = case when $9::text = 'paid' then coalesce(paid_at, now()) else paid_at end,
            closed_at = case when $9::text = 'closed' then coalesce(closed_at, now()) else closed_at end,
            external_order_id = coalesce(external_order_id, $8::text)
          where id in (select id from matched_order)
          returning id
        ),
        updated_user as (
          update users
          set status = $4::text, updated_at = now()
          where id in (select id from selected_user)
          returning id::text, name, phone, role, status
        ),
        closed_subscriptions as (
          update subscriptions
          set status = case when $4::text = 'active' then 'expired' else $4::text end
          where user_id in (select id from selected_user)
            and status = 'active'
          returning user_id
        ),
        inserted_subscription as (
          insert into subscriptions (user_id, plan_id, status, starts_at, expires_at, renews_at)
          select selected_user.id, selected_plan.id, $4::text, now(), $5::timestamptz, $5::timestamptz
          from selected_user, selected_plan
          where $4::text = 'active'
          returning user_id
        ),
        upsert_quota as (
          insert into usage_quotas (user_id, quota_key, used_count, quota_limit, period_start, period_end)
          select selected_user.id, 'daily_signals', 0, selected_plan.daily_signal_quota, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day'
          from selected_user, selected_plan
          on conflict (user_id, quota_key, period_start) do update set
            quota_limit = excluded.quota_limit,
            period_end = excluded.period_end
          returning user_id
        ),
        audit as (
          insert into audit_logs (action, target_type, target_id, payload)
          select 'billing.webhook', 'user', selected_user.id::text, jsonb_build_object(
            'event', $6::text,
            'planCode', $3::text,
            'provider', $7::text,
            'externalOrderId', $8::text,
            'orderStatus', $9::text
          )
          from selected_user
          returning id
        )
        select
          u.id,
          u.name,
          u.phone,
          u.role,
          u.status,
          coalesce(p.name, 'Free') as plan,
          s.expires_at,
          uq.used_count,
          uq.quota_limit,
          exists (
            select 1 from feishu_bindings fb
            where fb.user_id = u.id::uuid and fb.status = 'active'
          ) as feishu_enabled,
          (
            select count(*)::int from team_members tm
            where tm.owner_user_id = u.id::uuid and tm.status = 'active'
          ) as team_members,
          case when coalesce(p.supports_team, false) then 5 else 0 end as team_limit
        from updated_user u
        left join subscriptions s on s.user_id::text = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        left join usage_quotas uq on uq.user_id::text = u.id and uq.quota_key = 'daily_signals'
      `,
      [
        dto.userId ?? null,
        dto.phone ? normalizePhone(dto.phone) : null,
        nextPlanCode,
        nextStatus,
        expiresAt,
        dto.event,
        dto.provider ?? null,
        dto.externalOrderId ?? null,
        orderStatus
      ]
    );

    if (rows[0]) {
      return mapUserRow(rows[0]);
    }

    throw new NotFoundException("Billing webhook user not found");
  }
}

function buildFeatures(plan: PlanRow) {
  const maxWatchlistSymbols = Number(plan.max_watchlist_symbols ?? fallbackPlanValue(plan.code, "maxWatchlistSymbols"));
  const allowedTimeframes = normalizeTimeframes(plan.allowed_timeframes ?? fallbackPlanValue(plan.code, "allowedTimeframes"));
  const historyDays = Number(plan.history_days ?? fallbackPlanValue(plan.code, "historyDays"));
  const delayHours = Number(plan.realtime_delay_hours ?? fallbackPlanValue(plan.code, "realtimeDelayHours"));
  const maxPushPerDay = Number(plan.max_push_per_day ?? fallbackPlanValue(plan.code, "maxPushPerDay"));
  const minAlertScore = Number(plan.min_alert_score ?? fallbackPlanValue(plan.code, "minAlertScore"));
  const signalOutcomes = Boolean(plan.supports_signal_outcomes ?? fallbackPlanValue(plan.code, "signalOutcomes"));
  const features = [
    maxPushPerDay > 0 ? `每日 ${maxPushPerDay} 条实时推送` : `全市场信号延迟 ${delayHours} 小时`,
    `自选 ${maxWatchlistSymbols} 个币`,
    `周期 ${allowedTimeframes.join(" / ")}`,
    `最低推送分 ${minAlertScore}`,
    `历史 ${historyDays} 天`
  ];

  if (plan.supports_feishu) {
    features.push("飞书告警");
  }

  if (plan.supports_api) {
    features.push("API 订阅");
  }

  if (plan.supports_team) {
    features.push("团队子账号");
  }

  if (plan.supports_backtest) {
    features.push("回测分析");
  }

  if (signalOutcomes) {
    features.push("完整战绩回看");
  } else {
    features.push("基础战绩预览");
  }

  return features;
}

function normalizeTimeframes(value: string[] | string | unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return ["5m"];
}

function fallbackPlanValue(planCode: string, key: keyof typeof PLAN_FALLBACKS.free) {
  const normalized = planCode.toLowerCase() as keyof typeof PLAN_FALLBACKS;
  return (PLAN_FALLBACKS[normalized] ?? PLAN_FALLBACKS.free)[key];
}

const PLAN_FALLBACKS = {
  free: {
    maxWatchlistSymbols: 5,
    allowedTimeframes: ["5m"],
    realtimeDelayHours: 8,
    historyDays: 7,
    minAlertScore: 80,
    maxPushPerDay: 0,
    signalOutcomes: false
  },
  vip: {
    maxWatchlistSymbols: 50,
    allowedTimeframes: ["5m", "15m"],
    realtimeDelayHours: 0,
    historyDays: 30,
    minAlertScore: 65,
    maxPushPerDay: 300,
    signalOutcomes: true
  },
  svip: {
    maxWatchlistSymbols: 200,
    allowedTimeframes: ["5m", "15m", "30m", "1h", "4h"],
    realtimeDelayHours: 0,
    historyDays: 180,
    minAlertScore: 65,
    maxPushPerDay: 2000,
    signalOutcomes: true
  }
};

type UserRow = {
  id: string;
  name: string;
  phone: string | null;
  role: UserRecord["role"];
  status: UserRecord["status"];
  plan: string | null;
  expires_at: Date | string | null;
  used_count: number | null;
  quota_limit: number | null;
  feishu_enabled: boolean | null;
  team_members: number | null;
  team_limit: number | null;
};

function statusForEvent(event: BillingWebhookDto["event"]): UserRecord["status"] {
  if (event === "subscription.activated" || event === "subscription.renewed") {
    return "active";
  }

  if (event === "subscription.canceled" || event === "subscription.expired") {
    return "trial";
  }

  return "disabled";
}

function orderStatusForEvent(event: BillingWebhookDto["event"]): BillingOrderRecord["status"] {
  if (event === "subscription.activated" || event === "subscription.renewed") {
    return "paid";
  }

  if (event === "payment.failed" || event === "subscription.canceled" || event === "subscription.expired") {
    return "closed";
  }

  return "pending";
}

function defaultExpiresAt(event: BillingWebhookDto["event"]) {
  if (event === "subscription.activated" || event === "subscription.renewed") {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date().toISOString();
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    role: row.role,
    plan: row.plan ?? "Free",
    status: row.status,
    expiresAt: formatDate(row.expires_at),
    signalUsed: Number(row.used_count ?? 0),
    signalQuota: Number(row.quota_limit ?? quotaForPlan(row.plan ?? "Free")),
    feishuEnabled: Boolean(row.feishu_enabled),
    teamSeats: `${Number(row.team_members ?? 0)}/${Number(row.team_limit ?? 0)}`
  };
}

function mapOrderRow(row: BillingOrderRow): BillingOrderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    provider: row.provider,
    amount: Number(row.amount_cents) / 100,
    status: row.status,
    checkoutUrl: row.checkout_url ?? "",
    createdAt: new Date(row.created_at).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined
  };
}

function formatDate(value: Date | string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function quotaForPlan(plan: string) {
  if (plan === "SVIP") return 2000;
  if (plan === "VIP") return 300;
  return 10;
}


function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizePlanCode(planCode: string): "free" | "vip" | "svip" {
  const normalized = planCode.toLowerCase();
  if (normalized === "svip") return "svip";
  if (normalized === "vip") return "vip";
  return "free";
}
