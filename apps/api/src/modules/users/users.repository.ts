import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { mockUsers, UserRecord } from "../shared/mocks";
import { PlanEntitlementRecord } from "./entitlements";
import { UpdateUserDto } from "./dto/update-user.dto";

type UserRow = {
  id: string;
  name: string;
  phone: string | null;
  password_hash?: string | null;
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

export type AuthUserRecord = UserRecord & {
  passwordHash?: string | null;
};

export type CreateUserInput = {
  phone: string;
  name: string;
  passwordHash: string;
};

export type DailyPushUsage = {
  sent: number;
  skipped: number;
  failed: number;
  total: number;
  periodStart: string;
  periodEnd: string;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findCurrentUser(userId?: string): Promise<UserRecord | null> {
    const users = await this.findAll();
    return users.find((user) => user.id === userId) ?? users[0] ?? null;
  }

  async findByPhone(phone: string): Promise<AuthUserRecord | null> {
    const normalizedPhone = normalizePhone(phone);
    const rows = await this.database.query<UserRow>(
      `
        select
          u.id::text,
          u.name,
          u.phone,
          u.password_hash,
          u.role,
          u.status,
          coalesce(p.name, 'Free') as plan,
          s.expires_at,
          uq.used_count,
          uq.quota_limit,
          exists (
            select 1 from feishu_bindings fb
            where fb.user_id = u.id and fb.status = 'active'
          ) as feishu_enabled,
          (
            select count(*)::int from team_members tm
            where tm.owner_user_id = u.id and tm.status = 'active'
          ) as team_members,
          case when coalesce(p.supports_team, false) then 5 else 0 end as team_limit
        from users u
        left join subscriptions s on s.user_id = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        left join usage_quotas uq on uq.user_id = u.id and uq.quota_key = 'daily_signals'
        where u.phone = $1
        limit 1
      `,
      [normalizedPhone]
    );

    if (rows[0]) {
      return {
        ...mapUserRow(rows[0]),
        passwordHash: rows[0].password_hash
      };
    }

    if (!this.database.enabled) {
      const user = mockUsers.find((item) => normalizePhone(item.phone) === normalizedPhone);
      return user ? { ...user, passwordHash: null } : null;
    }

    return null;
  }

  async findAuthUserById(userId: string): Promise<AuthUserRecord | null> {
    const rows = await this.database.query<UserRow>(
      `
        select
          u.id::text,
          u.name,
          u.phone,
          u.password_hash,
          u.role,
          u.status,
          coalesce(p.name, 'Free') as plan,
          s.expires_at,
          uq.used_count,
          uq.quota_limit,
          exists (
            select 1 from feishu_bindings fb
            where fb.user_id = u.id and fb.status = 'active'
          ) as feishu_enabled,
          (
            select count(*)::int from team_members tm
            where tm.owner_user_id = u.id and tm.status = 'active'
          ) as team_members,
          case when coalesce(p.supports_team, false) then 5 else 0 end as team_limit
        from users u
        left join subscriptions s on s.user_id = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        left join usage_quotas uq on uq.user_id = u.id and uq.quota_key = 'daily_signals'
        where u.id::text = $1
        limit 1
      `,
      [userId]
    );

    if (rows[0]) {
      return {
        ...mapUserRow(rows[0]),
        passwordHash: rows[0].password_hash
      };
    }

    if (!this.database.enabled) {
      const user = mockUsers.find((item) => item.id === userId);
      return user ? { ...user, passwordHash: null } : null;
    }

    return null;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const normalizedPhone = normalizePhone(input.phone);
    const rows = await this.database.query<UserRow>(
      `
        with new_user as (
          insert into users (phone, name, password_hash, role, status)
          values ($1, $2, $3, 'member', 'active')
          returning id::text, name, phone, password_hash, role, status
        ),
        free_plan as (
          select id from plans where code = 'free' limit 1
        ),
        new_subscription as (
          insert into subscriptions (user_id, plan_id, status, starts_at, expires_at, renews_at)
          select new_user.id::uuid, free_plan.id, 'active', now(), now() + interval '14 days', now() + interval '14 days'
          from new_user, free_plan
          returning user_id
        ),
        new_quota as (
          insert into usage_quotas (user_id, quota_key, used_count, quota_limit, period_start, period_end)
          select new_user.id::uuid, 'daily_signals', 0, 10, date_trunc('day', now()), date_trunc('day', now()) + interval '1 day'
          from new_user
          returning user_id
        )
        select
          new_user.id,
          new_user.name,
          new_user.phone,
          new_user.password_hash,
          new_user.role,
          new_user.status,
          'Free' as plan,
          (now() + interval '14 days') as expires_at,
          0 as used_count,
          10 as quota_limit,
          false as feishu_enabled,
          0 as team_members,
          0 as team_limit
        from new_user
      `,
      [normalizedPhone, input.name, input.passwordHash]
    );

    if (rows[0]) {
      return mapUserRow(rows[0]);
    }

    throw new ServiceUnavailableException("Database is required to register real users");
  }

  async getPlanEntitlements(userId: string): Promise<PlanEntitlementRecord | null> {
    const rows = await this.database.query<{
      plan: string | null;
      daily_signal_quota: number | null;
      supports_feishu: boolean | null;
      supports_api: boolean | null;
      supports_team: boolean | null;
      max_watchlist_symbols: number | null;
      allowed_timeframes: string[] | null;
      realtime_delay_hours: number | null;
      history_days: number | null;
      min_alert_score: number | null;
      max_push_per_day: number | null;
      supports_signal_outcomes: boolean | null;
    }>(
      `
        select
          coalesce(p.name, 'Free') as plan,
          p.daily_signal_quota,
          p.supports_feishu,
          p.supports_api,
          p.supports_team,
          p.max_watchlist_symbols,
          p.allowed_timeframes,
          p.realtime_delay_hours,
          p.history_days,
          p.min_alert_score,
          p.max_push_per_day,
          p.supports_signal_outcomes
        from users u
        left join subscriptions s on s.user_id = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        where u.id::text = $1
        limit 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      plan: row.plan,
      dailySignalQuota: row.daily_signal_quota,
      supportsFeishu: row.supports_feishu,
      supportsApi: row.supports_api,
      supportsTeam: row.supports_team,
      maxWatchlistSymbols: row.max_watchlist_symbols,
      allowedTimeframes: row.allowed_timeframes,
      realtimeDelayHours: row.realtime_delay_hours,
      historyDays: row.history_days,
      minAlertScore: row.min_alert_score,
      maxPushPerDay: row.max_push_per_day,
      supportsSignalOutcomes: row.supports_signal_outcomes
    };
  }

  async getDailyPushUsage(userId: string): Promise<DailyPushUsage> {
    const rows = await this.database.query<{
      sent: number | null;
      skipped: number | null;
      failed: number | null;
      total: number | null;
      period_start: Date | string;
      period_end: Date | string;
    }>(
      `
        select
          count(*) filter (where status = 'sent')::int as sent,
          count(*) filter (where status = 'skipped')::int as skipped,
          count(*) filter (where status = 'failed')::int as failed,
          count(*)::int as total,
          date_trunc('day', now()) as period_start,
          date_trunc('day', now()) + interval '1 day' as period_end
        from alert_deliveries
        where user_id::text = $1
          and channel = 'feishu'
          and created_at >= date_trunc('day', now())
          and created_at < date_trunc('day', now()) + interval '1 day'
      `,
      [userId]
    );
    const row = rows[0];
    return {
      sent: Number(row?.sent ?? 0),
      skipped: Number(row?.skipped ?? 0),
      failed: Number(row?.failed ?? 0),
      total: Number(row?.total ?? 0),
      periodStart: row?.period_start ? new Date(row.period_start).toISOString() : new Date().toISOString(),
      periodEnd: row?.period_end ? new Date(row.period_end).toISOString() : new Date().toISOString()
    };
  }

  async updatePassword(userId: string, passwordHash: string) {
    const rows = await this.database.query<{ id: string }>(
      `
        update users
        set password_hash = $2, updated_at = now()
        where id::text = $1
        returning id::text
      `,
      [userId, passwordHash]
    );

    if (!rows.length) {
      throw new NotFoundException("User not found");
    }
  }

  async findAll(): Promise<UserRecord[]> {
    const rows = await this.database.query<UserRow>(
      `
        select
          u.id::text,
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
            where fb.user_id = u.id and fb.status = 'active'
          ) as feishu_enabled,
          (
            select count(*)::int from team_members tm
            where tm.owner_user_id = u.id and tm.status = 'active'
          ) as team_members,
          case when coalesce(p.supports_team, false) then 5 else 0 end as team_limit
        from users u
        left join subscriptions s on s.user_id = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        left join usage_quotas uq on uq.user_id = u.id and uq.quota_key = 'daily_signals'
        order by u.created_at asc
        limit 50
      `
    );

    if (!rows.length && !this.database.enabled) {
      return mockUsers;
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
      role: row.role,
      plan: row.plan ?? "Free",
      status: row.status,
      expiresAt: formatDate(row.expires_at),
      signalUsed: Number(row.used_count ?? 0),
      signalQuota: Number(row.quota_limit ?? 10),
      feishuEnabled: Boolean(row.feishu_enabled),
      teamSeats: `${Number(row.team_members ?? 0)}/${Number(row.team_limit ?? 0)}`
    }));
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserRecord> {
    const rows = await this.database.query<UserRow>(
      `
        with selected_plan as (
          select id, daily_signal_quota, supports_team
          from plans
          where name = coalesce($2, name)
          limit 1
        ),
        updated_user as (
          update users
          set status = coalesce($3, status)
          where id::text = $1
          returning id::text, name, phone, role, status
        ),
        updated_subscription as (
          update subscriptions
          set
            plan_id = coalesce((select id from selected_plan), plan_id),
            expires_at = coalesce($4::timestamptz, expires_at),
            updated_at = now()
          where user_id::text = $1 and status = 'active'
          returning user_id
        ),
        upsert_feishu as (
          insert into feishu_bindings (user_id, name, status, webhook_url)
          select $1::uuid, 'default', case when $5::boolean then 'active' else 'disabled' end, ''
          where $5 is not null
          on conflict (user_id, name) do update set
            status = excluded.status,
            updated_at = now()
          returning user_id
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
      [userId, dto.plan ?? null, dto.status ?? null, dto.expiresAt ?? null, dto.feishuEnabled ?? null]
    );

    if (!rows.length) {
      throw new NotFoundException("User not found");
    }

    return mapUserRow(rows[0]);
  }
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
