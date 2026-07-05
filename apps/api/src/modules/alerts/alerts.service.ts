import { BadRequestException, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { UsersService } from "../users/users.service";
import { FeishuAlertDto } from "./dto/feishu-alert.dto";
import { FeishuConfigDto } from "./dto/feishu-config.dto";

type FeishuTextPayload = {
  msg_type: "text";
  content: {
    text: string;
  };
};

type AlertResult = {
  sent?: boolean;
  skipped?: boolean;
  failed?: boolean;
  status?: number;
  reason?: string;
};

type AlertHistoryRecord = {
  id: string;
  channel: "feishu";
  symbol: string;
  direction: FeishuAlertDto["direction"];
  score: number;
  title?: string;
  sent: boolean;
  skipped: boolean;
  failed: boolean;
  status?: number;
  reason?: string;
  createdAt: string;
};

type FeishuBindingRow = {
  webhook_url: string;
  status: string;
};

type UserPushSettingRow = {
  enabled: boolean;
  target_encrypted: string | null;
  target_masked: string | null;
  min_score: number | null;
  cooldown_minutes: number | null;
};

type AlertDeliveryRow = {
  id: string;
  channel: "feishu";
  symbol: string;
  direction: FeishuAlertDto["direction"];
  score: number;
  title: string | null;
  status: "sent" | "skipped" | "failed";
  http_status: number | null;
  reason: string | null;
  created_at: Date | string;
};

@Injectable()
export class AlertsService {
  private history: AlertHistoryRecord[] = [];
  private webhookUrlByUserId = new Map<string, string>();
  private webhookEnabledByUserId = new Map<string, boolean>();
  private pushSettingsByUserId = new Map<string, { minScore: number; cooldownMinutes: number }>();
  private historyByUserId = new Map<string, AlertHistoryRecord[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly usersService: UsersService
  ) {}

  async getFeishuConfig(userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;

    if (this.database.enabled && !process.env.FEISHU_WEBHOOK_URL) {
      const rows = await this.database.query<UserPushSettingRow & { binding_webhook_url: string | null }>(
        `
          select
            coalesce(ups.enabled, false)::boolean as enabled,
            ups.target_encrypted,
            ups.target_masked,
            coalesce(ups.min_score, $2::integer)::integer as min_score,
            coalesce(ups.cooldown_minutes, 15)::integer as cooldown_minutes,
            (
              select webhook_url
              from feishu_bindings fb
              where fb.user_id = $1::uuid and fb.status = 'active'
              order by updated_at desc
              limit 1
            ) as binding_webhook_url
          from users u
          left join user_push_settings ups on ups.user_id = u.id and ups.channel = 'feishu'
          where u.id = $1::uuid
          limit 1
        `,
        [currentUserId, entitlements.minAlertScore]
      );
      const setting = rows[0];
      const configuredWebhook = setting?.target_encrypted || setting?.binding_webhook_url || "";
      const minScore = Math.max(Number(setting?.min_score ?? entitlements.minAlertScore), entitlements.minAlertScore);
      const cooldownMinutes = Number(setting?.cooldown_minutes ?? 15);
      return {
        enabled: Boolean(setting?.enabled),
        minScore,
        cooldownMinutes,
        config: {
          enabled: Boolean(setting?.enabled),
          configured: Boolean(configuredWebhook),
          webhookMasked: setting?.target_masked || maskWebhook(configuredWebhook),
          minScore,
          cooldownMinutes,
          minAllowedScore: entitlements.minAlertScore,
          maxPushPerDay: entitlements.maxPushPerDay,
          feishuAllowed: entitlements.feishuAlerts,
          source: "database"
        }
      };
    }

    const activeWebhookUrl = await this.activeWebhookUrl(currentUserId);
    const savedSetting = this.pushSettingsByUserId.get(currentUserId);
    const minScore = savedSetting?.minScore ?? entitlements.minAlertScore;
    const cooldownMinutes = savedSetting?.cooldownMinutes ?? 15;

    return {
      enabled: Boolean(activeWebhookUrl),
      minScore,
      cooldownMinutes,
      config: {
        enabled: Boolean(activeWebhookUrl),
        configured: Boolean(activeWebhookUrl),
        webhookMasked: maskWebhook(activeWebhookUrl),
        minScore,
        cooldownMinutes,
        minAllowedScore: entitlements.minAlertScore,
        maxPushPerDay: entitlements.maxPushPerDay,
        feishuAllowed: entitlements.feishuAlerts,
        source: process.env.FEISHU_WEBHOOK_URL ? "env" : this.database.enabled ? "database" : "app"
      }
    };
  }

  async updateFeishuConfig(dto: FeishuConfigDto, userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    if (dto.enabled === true && (!entitlements.feishuAlerts || entitlements.maxPushPerDay <= 0)) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持实时飞书推送，请升级会员后再开启。`);
    }

    if (this.database.enabled) {
      await this.saveFeishuConfigToDatabase(dto, currentUserId);
    }

    const minScore = Math.max(Number.isFinite(Number(dto.minScore)) ? Math.round(Number(dto.minScore)) : entitlements.minAlertScore, entitlements.minAlertScore);
    const cooldownMinutes = Math.max(0, Math.min(Number.isFinite(Number(dto.cooldownMinutes)) ? Math.round(Number(dto.cooldownMinutes)) : 15, 1440));
    this.pushSettingsByUserId.set(currentUserId, { minScore, cooldownMinutes });

    const nextWebhookUrl = typeof dto.webhookUrl === "string" ? dto.webhookUrl.trim() : this.webhookUrlByUserId.get(currentUserId) ?? "";

    if (typeof dto.webhookUrl === "string") {
      this.webhookUrlByUserId.set(currentUserId, nextWebhookUrl);
    }

    if (typeof dto.enabled === "boolean") {
      this.webhookEnabledByUserId.set(currentUserId, dto.enabled);
    } else if (nextWebhookUrl) {
      this.webhookEnabledByUserId.set(currentUserId, true);
    }

    return this.getFeishuConfig(userId);
  }

  async getHistory(userId?: string) {
    if (this.database.enabled) {
      const rows = await this.database.query<AlertDeliveryRow>(
        `
          select
            id::text,
            channel,
            symbol,
            direction,
            score,
            title,
            status,
            http_status,
            reason,
            created_at
          from alert_deliveries
          where user_id = $1
          order by created_at desc
          limit 20
        `,
        [await this.currentUserId(userId)]
      );

      if (rows.length) {
        return {
          history: rows.map(mapDeliveryRow)
        };
      }
    }

    return {
      history: (this.historyByUserId.get(await this.currentUserId(userId)) ?? this.history).slice(0, 20)
    };
  }

  async sendFeishu(signal: FeishuAlertDto, userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    if (!entitlements.feishuAlerts || entitlements.maxPushPerDay <= 0) {
      const result = {
        skipped: true,
        reason: `当前套餐 ${entitlements.plan} 不支持实时飞书推送。`,
        signal
      };
      await this.recordHistory(signal, result, buildFeishuPayload(signal), currentUserId);
      return result;
    }
    if (this.database.enabled) {
      const sentRows = await this.database.query<{ sent_count: string | number }>(
        `
          select count(*)::text as sent_count
          from alert_deliveries
          where user_id = $1::uuid
            and channel = 'feishu'
            and status = 'sent'
            and coalesce(sent_at, created_at) >= date_trunc('day', now())
            and coalesce(sent_at, created_at) < date_trunc('day', now()) + interval '1 day'
        `,
        [currentUserId]
      );
      const sentToday = Number(sentRows[0]?.sent_count ?? 0);
      if (sentToday >= entitlements.maxPushPerDay) {
        const result = {
          skipped: true,
          reason: `今日推送次数已达套餐上限 ${entitlements.maxPushPerDay} 条。`,
          signal
        };
        await this.recordHistory(signal, result, buildFeishuPayload(signal), currentUserId);
        return result;
      }
    }

    const payload = buildFeishuPayload(signal);
    const webhookUrl = await this.activeWebhookUrl(currentUserId);

    if (!webhookUrl) {
      const result = {
        skipped: true,
        reason: "飞书 Webhook 未配置。",
        signal,
        payload,
        config: (await this.getFeishuConfig(userId)).config
      };
      await this.recordHistory(signal, result, payload, userId);
      return result;
    }

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const result = {
        sent: false,
        failed: true,
        reason: (error as Error).message,
        signal,
        payload
      };
      await this.recordHistory(signal, result, payload, userId);
      return result;
    }

    const responseText = await response.text();
    if (!response.ok) {
      const result = {
        sent: false,
        failed: true,
        status: response.status,
        reason: responseText || `飞书返回 HTTP ${response.status}`,
        signal,
        payload
      };
      await this.recordHistory(signal, result, payload, userId);
      return result;
    }

    const result = {
      sent: true,
      status: response.status,
      signal,
      payload
    };
    await this.recordHistory(signal, result, payload, userId);
    return result;
  }

  async testFeishu(userId?: string) {
    const now = new Date();
    return this.sendFeishu(
      {
        symbol: "TEST",
        direction: "flat",
        price: "0.00",
        score: 100,
        title: "飞书机器人测试消息",
        reason: "如果你在群里看到这条消息，说明 ValueScan AI 的飞书告警通道已经配置成功。",
        oiChange: "test",
        funding: "test",
        time: now.toLocaleString("zh-CN", { hour12: false })
      },
      userId
    );
  }

  private async activeWebhookUrl(userId?: string) {
    if (process.env.FEISHU_WEBHOOK_URL) {
      return process.env.FEISHU_WEBHOOK_URL;
    }

    if (this.database.enabled) {
      const currentUserId = await this.currentUserId(userId);
      const settingRows = await this.database.query<UserPushSettingRow>(
        `
          select enabled, target_encrypted, target_masked, min_score, cooldown_minutes
          from user_push_settings
          where user_id = $1::uuid and channel = 'feishu'
          limit 1
        `,
        [currentUserId]
      );
      const setting = settingRows[0];
      if (setting && !setting.enabled) return "";
      if (setting?.target_encrypted) return setting.target_encrypted;

      const rows = await this.database.query<FeishuBindingRow>(
        `
          select webhook_url, status
          from feishu_bindings
          where user_id = $1::uuid and status = 'active'
          order by updated_at desc
          limit 1
        `,
        [currentUserId]
      );
      const binding = rows[0];
      return binding?.status === "active" ? binding.webhook_url : "";
    }

    const currentUserId = await this.currentUserId(userId);
    const enabled = this.webhookEnabledByUserId.get(currentUserId) ?? false;
    const webhookUrl = this.webhookUrlByUserId.get(currentUserId) ?? "";
    return enabled ? webhookUrl : "";
  }

  private async saveFeishuConfigToDatabase(dto: FeishuConfigDto, requestUserId?: string) {
    const userId = await this.currentUserId(requestUserId);
    const existingRows = await this.database.query<{ target_encrypted: string | null; binding_webhook_url: string | null }>(
      `
        select
          ups.target_encrypted,
          (
            select webhook_url
            from feishu_bindings fb
            where fb.user_id = $1::uuid
            order by updated_at desc
            limit 1
          ) as binding_webhook_url
        from users u
        left join user_push_settings ups on ups.user_id = u.id and ups.channel = 'feishu'
        where u.id = $1::uuid
        limit 1
      `,
      [userId]
    );
    const existingWebhook = existingRows[0]?.target_encrypted || existingRows[0]?.binding_webhook_url || this.webhookUrlByUserId.get(userId) || "";
    const submittedWebhook = typeof dto.webhookUrl === "string" ? dto.webhookUrl.trim() : "";
    const webhookUrl = submittedWebhook || existingWebhook;
    const enabled = typeof dto.enabled === "boolean" ? dto.enabled : Boolean(webhookUrl);
    const status = !enabled || !webhookUrl ? "disabled" : "active";
    const entitlements = (await this.usersService.getCurrentEntitlements(userId)).entitlements;
    const minScore = Math.max(Number.isFinite(Number(dto.minScore)) ? Math.round(Number(dto.minScore)) : entitlements.minAlertScore, entitlements.minAlertScore);
    const cooldownMinutes = Math.max(0, Math.min(Number.isFinite(Number(dto.cooldownMinutes)) ? Math.round(Number(dto.cooldownMinutes)) : 15, 1440));

    if (webhookUrl) {
      await this.database.query(
        `
          insert into feishu_bindings (user_id, name, webhook_url, status)
          values ($1::uuid, 'default', $2::text, $3::varchar)
          on conflict (user_id, name) do update set
            webhook_url = excluded.webhook_url,
            status = excluded.status,
            updated_at = now()
        `,
        [userId, webhookUrl, status]
      );
    }

    await this.database.query(
      `
        insert into user_push_settings (user_id, channel, enabled, target_encrypted, target_masked, min_score, cooldown_minutes)
        values ($1::uuid, 'feishu', $2::boolean, $3::text, $4::varchar, $5::integer, $6::integer)
        on conflict (user_id, channel) do update set
          enabled = excluded.enabled,
          target_encrypted = excluded.target_encrypted,
          target_masked = excluded.target_masked,
          min_score = excluded.min_score,
          cooldown_minutes = excluded.cooldown_minutes,
          updated_at = now()
      `,
      [userId, status === "active", webhookUrl || null, maskWebhook(webhookUrl), minScore, cooldownMinutes]
    );
  }

  private async recordHistory(signal: FeishuAlertDto, result: AlertResult, payload: FeishuTextPayload, requestUserId?: string) {
    const status = result.sent ? "sent" : result.failed ? "failed" : "skipped";
    const currentUserId = await this.currentUserId(requestUserId);
    const record: AlertHistoryRecord = {
      id: `alert_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      channel: "feishu",
      symbol: signal.symbol,
      direction: signal.direction,
      score: signal.score,
      title: signal.title,
      sent: Boolean(result.sent),
      skipped: Boolean(result.skipped),
      failed: Boolean(result.failed),
      status: result.status,
      reason: result.reason,
      createdAt: new Date().toISOString()
    };

    this.history = [record, ...this.history].slice(0, 50);
    const userHistory = this.historyByUserId.get(currentUserId) ?? [];
    this.historyByUserId.set(currentUserId, [record, ...userHistory].slice(0, 50));

    if (this.database.enabled) {
      await this.database.query(
        `
          insert into alert_deliveries (
            user_id,
            signal_event_id,
            channel,
            symbol,
            timeframe,
            direction,
            signal_type,
            score,
            title,
            status,
            http_status,
            reason,
            skip_reason,
            payload
          )
          values ($1, $2, 'feishu', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
          on conflict (user_id, signal_event_id, channel) where signal_event_id is not null do update set
            status = case when alert_deliveries.status = 'sent' and excluded.status <> 'sent' then alert_deliveries.status else excluded.status end,
            http_status = case when alert_deliveries.status = 'sent' and excluded.status <> 'sent' then alert_deliveries.http_status else excluded.http_status end,
            reason = case when alert_deliveries.status = 'sent' and excluded.status <> 'sent' then alert_deliveries.reason else excluded.reason end,
            skip_reason = case when alert_deliveries.status = 'sent' and excluded.status <> 'sent' then alert_deliveries.skip_reason else excluded.skip_reason end,
            payload = case when alert_deliveries.status = 'sent' and excluded.status <> 'sent' then alert_deliveries.payload else excluded.payload end,
            sent_at = case when excluded.status = 'sent' then now() else alert_deliveries.sent_at end
        `,
        [
          currentUserId,
          signal.signalEventId ?? null,
          signal.symbol,
          signal.timeframe ?? null,
          signal.direction,
          signal.signalType ?? null,
          signal.score,
          signal.title ?? null,
          status,
          result.status ?? null,
          result.reason ?? null,
          status === "skipped" ? result.reason ?? null : null,
          JSON.stringify(payload)
        ]
      );
    }
  }

  private async currentUserId(userId?: string) {
    const response = await this.usersService.getCurrentUser(userId);
    if (response.user.id) return response.user.id;
    if (this.database.enabled) {
      const rows = await this.database.query<{ id: string }>(`select id::text from users order by created_at asc limit 1`);
      if (rows[0]?.id) return rows[0].id;
    }
    return "00000000-0000-0000-0000-000000000000";
  }
}

function buildFeishuPayload(signal: FeishuAlertDto): FeishuTextPayload {
  const directionLabel = {
    long: "利多",
    short: "利空",
    flat: "观察"
  }[signal.direction];

  const lines = [
    `[AI 信号告警] ${signal.symbol} ${directionLabel}`,
    `价格：${signal.price}`,
    `评分：${signal.score}`,
    signal.title ? `信号：${signal.title}` : null,
    signal.reason ? `原因：${signal.reason}` : null,
    signal.oiChange ? `OI：${signal.oiChange}` : null,
    signal.funding ? `Funding：${signal.funding}` : null,
    signal.time ? `时间：${signal.time}` : null
  ].filter(Boolean);

  return {
    msg_type: "text",
    content: {
      text: lines.join("\n")
    }
  };
}

function mapDeliveryRow(row: AlertDeliveryRow): AlertHistoryRecord {
  return {
    id: row.id,
    channel: row.channel,
    symbol: row.symbol,
    direction: row.direction,
    score: Number(row.score),
    title: row.title ?? undefined,
    sent: row.status === "sent",
    skipped: row.status === "skipped",
    failed: row.status === "failed",
    status: row.http_status ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function maskWebhook(webhookUrl: string) {
  if (!webhookUrl) {
    return "";
  }

  if (webhookUrl.length <= 18) {
    return "********";
  }

  return `${webhookUrl.slice(0, 12)}...${webhookUrl.slice(-6)}`;
}
