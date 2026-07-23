import { Injectable } from "@nestjs/common";
import { DatabaseService, DatabaseTransaction } from "../database/database.service";
import { SignalRecord } from "../shared/mocks";
import {
  PUBLIC_FORMAL_SIGNAL_DELAY_HOURS,
  PUBLIC_FORMAL_SIGNAL_HISTORY_DAYS,
  PUBLIC_FORMAL_SIGNAL_TIMEFRAMES
} from "../strategy/formal-signal-policy";

type SignalRow = {
  id: string;
  symbol: string;
  direction: SignalRecord["direction"];
  price: string;
  score: number;
  emitted_at: Date | string;
  title: string | null;
  reason: string | null;
  signal_type: string | null;
  return_15m: string | null;
  oi_change: string | null;
  funding: string | null;
};

export type StrategySignalToPersist = {
  symbol: string;
  timeframe: string;
  direction: SignalRecord["direction"];
  signalType: string;
  title: string;
  reason: string;
  price: number;
  score: number;
  source: string;
  dedupeKey: string;
  barTime: Date;
  emittedAt: Date;
  strategyVersion: string;
  formal: true;
  payload: Record<string, unknown>;
};

@Injectable()
export class SignalsRepository {
  constructor(private readonly database: DatabaseService) {}

  async findLatest(): Promise<SignalRecord[]> {
    const rows = await this.database.query<SignalRow>(
      `
        select
          se.id::text,
          se.symbol,
          se.direction,
          se.price::text,
          se.score,
          se.emitted_at,
          s.title,
          s.reason,
          s.signal_type,
          sp.return_15m::text,
          coalesce(se.payload->>'oiChange', se.payload->>'oi_change') as oi_change,
          coalesce(se.payload->>'funding', se.payload->>'funding_rate') as funding
        from signal_events se
        left join signals s on s.id = se.signal_id
        left join signal_performance sp on sp.signal_event_id = se.id
        where se.is_formal = true
          and se.timeframe = '${PUBLIC_FORMAL_SIGNAL_TIMEFRAMES[0]}'
          and se.emitted_at <= now() - interval '${PUBLIC_FORMAL_SIGNAL_DELAY_HOURS} hours'
          and se.emitted_at >= now() - interval '${PUBLIC_FORMAL_SIGNAL_HISTORY_DAYS} days'
        order by se.emitted_at desc
        limit 50
      `
    );

    return rows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      badge: row.score >= 70 ? "Alpha" : undefined,
      icon: iconFor(row.symbol),
      price: compactNumber(row.price),
      gain: row.return_15m ? formatReturn(row.return_15m) : undefined,
      time: formatTime(row.emitted_at),
      score: Number(row.score),
      direction: row.direction,
      title: row.title ?? titleFor(row.direction, row.signal_type),
      reason: row.reason ?? "策略引擎捕捉到行情、资金或波动率异常，建议结合流动性和风险控制继续跟踪。",
      oiChange: row.oi_change ?? "-",
      funding: row.funding ?? "-",
      tags: buildTags(row)
    }));
  }

  async saveStrategySignals(signals: StrategySignalToPersist[]) {
    return {
      persisted: false,
      count: 0
    };
  }

  async saveStrategySignalsStrict(signals: StrategySignalToPersist[]) {
    if (!this.database.enabled || !signals.length) {
      return {
        persisted: false,
        count: 0
      };
    }

    return this.database.withTransaction((transaction) => this.persistStrategySignals(signals, transaction, true));
  }

  private async persistStrategySignals(signals: StrategySignalToPersist[], transaction: DatabaseTransaction, strict: boolean) {
    let count = 0;
    for (const signal of signals) {
      if (!signal.formal) {
        if (strict) throw new Error(`non_formal_signal_persistence_rejected:${signal.dedupeKey}`);
        continue;
      }
      const existingRows = await transaction.query<{ signal_id: string }>(
        `
          select id::text as signal_id
          from signals
          where symbol = $1::varchar
            and market = 'futures'
            and direction = $2::varchar
            and signal_type = $3::varchar
            and source = $4::varchar
          limit 1
        `,
        [signal.symbol, signal.direction, signal.signalType, signal.source]
      );

      let signalId = existingRows[0]?.signal_id;
      if (!signalId) {
        const insertedRows = await transaction.query<{ signal_id: string }>(
          `
            insert into signals (symbol, market, direction, signal_type, title, reason, score, source)
            values ($1::varchar, 'futures', $2::varchar, $3::varchar, $4::varchar, $5::text, $6::integer, $7::varchar)
            returning id::text as signal_id
          `,
          [
            signal.symbol,
            signal.direction,
            signal.signalType,
            signal.title,
            signal.reason,
            signal.score,
            signal.source
          ]
        );
        signalId = insertedRows[0]?.signal_id;
      }

      if (!signalId) {
        if (strict) throw new Error(`signal_persistence_incomplete:${signal.dedupeKey}:signal`);
        continue;
      }

      const eventRows = await transaction.query<{ id: string }>(
        `
          insert into signal_events (
            signal_id,
            exchange,
            symbol,
            timeframe,
            direction,
            signal_type,
            title,
            reason,
            engine,
            price,
            score,
            bar_time,
            payload,
            dedupe_key,
            emitted_at,
            strategy_version,
            is_formal
          )
          values ($1, 'BINANCE_FUTURES', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
          on conflict (dedupe_key) do nothing
          returning id::text
        `,
        [
          signalId,
          signal.symbol,
          signal.timeframe,
          signal.direction,
          signal.signalType,
          signal.title,
          signal.reason,
          String(signal.payload.engine ?? signal.source),
          signal.price,
          signal.score,
          signal.barTime,
          JSON.stringify(signal.payload),
          signal.dedupeKey,
          signal.emittedAt,
          signal.strategyVersion,
          signal.formal
        ]
      );

      if (eventRows.length) {
        count += 1;
      } else {
        const existingEvents = await transaction.query<{ id: string }>(
          `
            select id::text
            from signal_events
            where dedupe_key = $1::varchar
              and is_formal = true
              and strategy_version = $2::varchar
            limit 1
          `,
          [signal.dedupeKey, signal.strategyVersion]
        );
        if (existingEvents.length) {
          count += 1;
        } else if (strict) {
          throw new Error(`signal_persistence_incomplete:${signal.dedupeKey}:event`);
        }
      }
    }

    if (strict && count !== signals.length) {
      throw new Error(`signal_persistence_incomplete:expected=${signals.length}:actual=${count}`);
    }

    return {
      persisted: true,
      count
    };
  }
}

function iconFor(symbol: string) {
  const normalized = symbol.toLowerCase();
  if (["btc", "eth", "xrp"].includes(normalized)) {
    return normalized;
  }

  return "coin";
}

function compactNumber(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value;
  }

  if (numberValue >= 1000) {
    return numberValue.toFixed(2);
  }

  if (numberValue >= 1) {
    return numberValue.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  return numberValue.toPrecision(4);
}

function formatReturn(value: string | null) {
  if (!value) {
    return "0.00%";
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return value;
  }

  return `${(numberValue * 100).toFixed(2)}%`;
}

function formatTime(value: Date | string) {
  const date = new Date(value);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function titleFor(direction: SignalRecord["direction"], type: string | null) {
  if (direction === "long") {
    return `${type ?? "异常"} 活跃，可能是利多信号`;
  }

  if (direction === "short") {
    return `${type ?? "风险"} 抬升，可能是利空信号`;
  }

  return `${type ?? "行情"} 观察中`;
}

function buildTags(row: SignalRow) {
  const tags = [row.symbol];

  if (row.signal_type) {
    tags.push(row.signal_type);
  }

  if (row.direction === "long") {
    tags.push("利多");
  } else if (row.direction === "short") {
    tags.push("利空");
  } else {
    tags.push("观察");
  }

  return tags;
}
