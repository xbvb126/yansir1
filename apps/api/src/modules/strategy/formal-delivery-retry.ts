const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_STALE_SENDING_SECONDS = 300;

export type DeliveryRetryStatus = {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  picked: number;
  sent: number;
  failed: number;
  exhausted: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
};

export type FormalDeliveryRetryCandidate = {
  deliveryId: string;
  userId: string;
  signalEventId: string;
  event: {
    id: string;
    dedupe_key: string;
    symbol: string;
    timeframe: string;
    direction: "long" | "short";
    signal_type: string | null;
    title: string | null;
    reason: string | null;
    engine: string | null;
    price: string;
    score: number;
    emitted_at: Date | string;
    payload: Record<string, unknown> | string | null;
  };
  watchlist: {
    id: string;
    user_id: string;
    symbol: string;
    timeframes: string[];
    enabled: boolean;
    min_score: number;
    signal_scope: string;
    push_enabled: boolean;
    created_at: Date | string;
    updated_at: Date | string;
    disabled_at: Date | string | null;
  };
};

export type FormalDeliveryRetryResult = {
  sent?: boolean;
  failed?: boolean;
  skipped?: boolean;
};

type RetryDatabase = {
  enabled: boolean;
  queryStrict<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransaction<T>(operation: (transaction: RetryTransaction) => Promise<T>): Promise<T>;
};

type RetryTransaction = {
  query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

type RetryDeliveryRow = {
  delivery_id: string;
  user_id: string;
  signal_event_id: string;
  event_id?: string;
  event_dedupe_key?: string;
  event_symbol?: string;
  event_timeframe?: string;
  event_direction?: "long" | "short";
  event_signal_type?: string | null;
  event_title?: string | null;
  event_reason?: string | null;
  event_engine?: string | null;
  event_price?: string;
  event_score?: number;
  event_emitted_at?: Date | string;
  event_payload?: Record<string, unknown> | string | null;
  watchlist_id?: string;
  watchlist_symbol?: string;
  watchlist_timeframes?: string[];
  watchlist_enabled?: boolean;
  watchlist_min_score?: number;
  watchlist_signal_scope?: string;
  watchlist_push_enabled?: boolean;
  watchlist_created_at?: Date | string;
  watchlist_updated_at?: Date | string;
  watchlist_disabled_at?: Date | string | null;
};

export type FormalDeliveryRetryOptions = {
  database: RetryDatabase;
  retryDelivery: (candidate: FormalDeliveryRetryCandidate) => Promise<FormalDeliveryRetryResult>;
  intervalSeconds?: number;
  batchSize?: number;
  maxRetries?: number;
  staleSendingSeconds?: number;
  now?: () => Date;
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
};

export class FormalDeliveryRetry {
  private readonly intervalSeconds: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly staleSendingSeconds: number;
  private readonly now: () => Date;
  private readonly setIntervalFn: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (timer: ReturnType<typeof setInterval>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: DeliveryRetryStatus;

  constructor(private readonly options: FormalDeliveryRetryOptions) {
    this.intervalSeconds = positiveInteger(options.intervalSeconds, DEFAULT_INTERVAL_SECONDS);
    this.batchSize = positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
    this.maxRetries = positiveInteger(options.maxRetries, DEFAULT_MAX_RETRIES);
    this.staleSendingSeconds = positiveInteger(options.staleSendingSeconds, DEFAULT_STALE_SENDING_SECONDS);
    this.now = options.now ?? (() => new Date());
    this.setIntervalFn = options.setInterval ?? ((callback, delayMs) => setInterval(callback, delayMs));
    this.clearIntervalFn = options.clearInterval ?? ((timer) => clearInterval(timer));
    this.status = {
      enabled: false,
      running: false,
      intervalSeconds: this.intervalSeconds,
      picked: 0,
      sent: 0,
      failed: 0,
      exhausted: 0,
      lastRunAt: null,
      nextRunAt: null,
      lastError: null
    };
  }

  start(): void {
    if (this.timer) return;
    const now = this.now();
    this.status = {
      ...this.status,
      enabled: true,
      nextRunAt: new Date(now.getTime() + this.intervalSeconds * 1000).toISOString()
    };
    this.timer = this.setIntervalFn(() => { void this.runOnce(); }, this.intervalSeconds * 1000);
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) this.clearIntervalFn(this.timer);
    this.timer = null;
    this.status = { ...this.status, enabled: false, nextRunAt: null };
  }

  async runOnce(runAt = this.now()): Promise<DeliveryRetryStatus> {
    if (this.status.running) return this.getStatus();
    const startedAt = new Date(runAt);
    this.status = {
      ...this.status,
      running: true,
      picked: 0,
      sent: 0,
      failed: 0,
      exhausted: 0,
      lastRunAt: startedAt.toISOString(),
      lastError: null
    };

    if (!this.options.database.enabled) {
      return this.finish(startedAt, "database_unavailable");
    }

    try {
      await this.recoverStaleReservations(startedAt);
      await this.skipDeliveriesWithoutCurrentWatchlist();
      const rows = await this.pickDueDeliveries();
      let sent = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          const result = await this.options.retryDelivery(toCandidate(row));
          if (result.sent) sent += 1;
          else if (result.failed) failed += 1;
        } catch {
          failed += 1;
        }
      }
      const exhausted = await this.countExhaustedDeliveries();
      this.status = { ...this.status, picked: rows.length, sent, failed, exhausted };
      return this.finish(startedAt);
    } catch (error) {
      return this.finish(startedAt, error instanceof Error ? error.message : String(error));
    }
  }

  getStatus(): DeliveryRetryStatus {
    return { ...this.status };
  }

  private async recoverStaleReservations(now: Date) {
    await this.options.database.queryStrict(
      `
        update alert_deliveries
        set status = 'failed',
            reason = 'stale_delivery_reservation',
            next_retry_at = now()
        where status = 'sending'
          and channel = 'feishu'
          and signal_event_id is not null
          and coalesce(last_attempt_at, created_at) <= $1::timestamptz - ($2::integer * interval '1 second')
      `,
      [now.toISOString(), this.staleSendingSeconds]
    );
  }

  private async pickDueDeliveries(): Promise<RetryDeliveryRow[]> {
    return this.options.database.withTransaction((transaction) => transaction.query<RetryDeliveryRow>(
      `
        with due as (
          select ad.id
          from alert_deliveries ad
          where ad.channel = 'feishu'
            and ad.status = 'failed'
            and ad.retry_count < $1::integer
            and coalesce(ad.next_retry_at, now()) <= now()
            and exists (
              select 1
              from signal_events se
              join watchlists w on w.user_id = ad.user_id
                and w.symbol = se.symbol
                and se.timeframe = any(w.timeframes)
                and w.enabled = true
                and w.min_score <= se.score
                and (
                  w.signal_scope not in ('trend_only', 'reversal_only')
                  or (w.signal_scope = 'trend_only' and coalesce(se.signal_type, '') like '%trend%')
                  or (w.signal_scope = 'reversal_only' and coalesce(se.signal_type, '') like '%reversal%')
                )
              where se.id = ad.signal_event_id
                and se.is_formal = true
            )
          order by ad.next_retry_at nulls first, ad.created_at
          limit $2::integer
          for update skip locked
        ), claimed as (
          update alert_deliveries ad
          set status = 'sending',
              retry_count = ad.retry_count + 1,
              last_attempt_at = now(),
              next_retry_at = null,
              reason = null,
              skip_reason = null
          from due
          where ad.id = due.id
          returning ad.id, ad.user_id, ad.signal_event_id
        )
        select
          ad.id::text as delivery_id,
          ad.user_id::text as user_id,
          ad.signal_event_id::text as signal_event_id,
          se.id::text as event_id,
          se.dedupe_key as event_dedupe_key,
          se.symbol as event_symbol,
          se.timeframe as event_timeframe,
          se.direction as event_direction,
          se.signal_type as event_signal_type,
          se.title as event_title,
          se.reason as event_reason,
          se.engine as event_engine,
          se.price::text as event_price,
          se.score as event_score,
          se.emitted_at as event_emitted_at,
          se.payload as event_payload,
          w.id::text as watchlist_id,
          w.symbol as watchlist_symbol,
          w.timeframes as watchlist_timeframes,
          w.enabled as watchlist_enabled,
          w.min_score as watchlist_min_score,
          w.signal_scope as watchlist_signal_scope,
          w.push_enabled as watchlist_push_enabled,
          w.created_at as watchlist_created_at,
          w.updated_at as watchlist_updated_at,
          w.disabled_at as watchlist_disabled_at
        from claimed c
        join alert_deliveries ad on ad.id = c.id
        join signal_events se on se.id = c.signal_event_id
          and se.is_formal = true
        join lateral (
          select w.*
          from watchlists w
          where w.user_id = c.user_id
            and w.symbol = se.symbol
            and se.timeframe = any(w.timeframes)
            and w.enabled = true
            and w.min_score <= se.score
            and (
              w.signal_scope not in ('trend_only', 'reversal_only')
              or (w.signal_scope = 'trend_only' and coalesce(se.signal_type, '') like '%trend%')
              or (w.signal_scope = 'reversal_only' and coalesce(se.signal_type, '') like '%reversal%')
            )
          order by w.updated_at desc
          limit 1
        ) w on true
      `,
      [this.maxRetries, this.batchSize]
    ));
  }

  private async countExhaustedDeliveries(): Promise<number> {
    const rows = await this.options.database.queryStrict<{ exhausted: string | number }>(
      `
        select count(*)::text as exhausted
        from alert_deliveries
        where channel = 'feishu'
          and signal_event_id is not null
          and status = 'failed'
          and retry_count >= $1::integer
      `,
      [this.maxRetries]
    );
    return Math.max(0, Number(rows[0]?.exhausted ?? 0));
  }

  private async skipDeliveriesWithoutCurrentWatchlist() {
    await this.options.database.queryStrict(
      `
        update alert_deliveries ad
        set status = 'skipped',
            reason = 'watchlist_no_longer_matches',
            skip_reason = 'watchlist_no_longer_matches',
            next_retry_at = null
        where ad.channel = 'feishu'
          and ad.signal_event_id is not null
          and ad.status = 'failed'
          and not exists (
            select 1
            from signal_events se
            join watchlists w on w.user_id = ad.user_id
              and w.symbol = se.symbol
              and se.timeframe = any(w.timeframes)
              and w.enabled = true
              and w.min_score <= se.score
              and (
                w.signal_scope not in ('trend_only', 'reversal_only')
                or (w.signal_scope = 'trend_only' and coalesce(se.signal_type, '') like '%trend%')
                or (w.signal_scope = 'reversal_only' and coalesce(se.signal_type, '') like '%reversal%')
              )
            where se.id = ad.signal_event_id
              and se.is_formal = true
          )
      `
    );
  }

  private finish(runAt: Date, error?: string): DeliveryRetryStatus {
    const finishedAt = this.now();
    this.status = {
      ...this.status,
      running: false,
      nextRunAt: this.status.enabled ? new Date(finishedAt.getTime() + this.intervalSeconds * 1000).toISOString() : null,
      lastError: error ?? null
    };
    return this.getStatus();
  }
}

function toCandidate(row: RetryDeliveryRow): FormalDeliveryRetryCandidate {
  return {
    deliveryId: row.delivery_id,
    userId: row.user_id,
    signalEventId: row.signal_event_id,
    event: {
      id: row.event_id ?? row.signal_event_id,
      dedupe_key: row.event_dedupe_key ?? "",
      symbol: row.event_symbol ?? "",
      timeframe: row.event_timeframe ?? "",
      direction: row.event_direction ?? "long",
      signal_type: row.event_signal_type ?? null,
      title: row.event_title ?? null,
      reason: row.event_reason ?? null,
      engine: row.event_engine ?? null,
      price: row.event_price ?? "0",
      score: Number(row.event_score ?? 0),
      emitted_at: row.event_emitted_at ?? new Date(0),
      payload: row.event_payload ?? null
    },
    watchlist: {
      id: row.watchlist_id ?? "",
      user_id: row.user_id,
      symbol: row.watchlist_symbol ?? "",
      timeframes: row.watchlist_timeframes ?? [],
      enabled: Boolean(row.watchlist_enabled),
      min_score: Number(row.watchlist_min_score ?? 0),
      signal_scope: row.watchlist_signal_scope ?? "all",
      push_enabled: Boolean(row.watchlist_push_enabled),
      created_at: row.watchlist_created_at ?? new Date(0),
      updated_at: row.watchlist_updated_at ?? new Date(0),
      disabled_at: row.watchlist_disabled_at ?? null
    }
  };
}

function positiveInteger(value: number | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}
