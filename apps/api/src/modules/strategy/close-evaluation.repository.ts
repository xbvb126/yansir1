import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { FormalSignalJob } from "./closed-candle-job";

export type CloseEvaluationReservation = {
  id: string;
  attempts: number;
};

@Injectable()
export class CloseEvaluationRepository {
  constructor(private readonly database: DatabaseService) {}

  async reserve(job: FormalSignalJob): Promise<CloseEvaluationReservation | null> {
    const rows = await this.database.queryStrict<CloseEvaluationReservation>(
      `insert into strategy_close_evaluations (
         job_key,
         symbol,
         timeframe,
         bar_time,
         closed_at,
         source
       )
       values ($1, $2, $3, $4, $5, $6)
       on conflict (job_key) do update
         set source = excluded.source,
             status = 'running',
             attempts = strategy_close_evaluations.attempts + 1,
             signal_count = 0,
             error = null,
             started_at = now(),
             finished_at = null,
             updated_at = now()
         where strategy_close_evaluations.status = 'failed'
           or (
             strategy_close_evaluations.status = 'running'
             and strategy_close_evaluations.started_at < now() - interval '5 minutes'
           )
       returning id::text, attempts`,
      [job.key, job.symbol, job.timeframe, new Date(job.klineOpenTime), job.closedAt, job.source]
    );

    return rows[0] ?? null;
  }

  async complete(id: string, signalCount: number, finishedAt: Date): Promise<void> {
    const rows = await this.database.queryStrict<{ id: string }>(
      `update strategy_close_evaluations
         set status = 'succeeded',
             signal_count = $2,
             error = null,
             finished_at = $3,
             updated_at = now()
       where id = $1 and status = 'running'
       returning id::text`,
      [id, signalCount, finishedAt]
    );
    if (rows.length !== 1) throw new Error(`close_evaluation_completion_incomplete:${id}`);
  }

  async fail(id: string, error: string, finishedAt: Date): Promise<void> {
    const rows = await this.database.queryStrict<{ id: string }>(
      `update strategy_close_evaluations
         set status = 'failed',
             error = $2,
             finished_at = $3,
             updated_at = now()
       where id = $1 and status = 'running'
       returning id::text`,
      [id, error, finishedAt]
    );
    if (rows.length !== 1) throw new Error(`close_evaluation_failure_incomplete:${id}`);
  }

  async findCompletedKeys(keys: string[]): Promise<Set<string>> {
    if (!keys.length) return new Set();

    const rows = await this.database.queryStrict<{ job_key: string }>(
      `select job_key
       from strategy_close_evaluations
       where job_key = any($1::varchar[])
         and status = 'succeeded'`,
      [keys]
    );
    return new Set(rows.map((row) => row.job_key));
  }

  async purgeFinishedBefore(cutoff: Date): Promise<number> {
    const rows = await this.database.queryStrict<{ id: string }>(
      `delete from strategy_close_evaluations
       where finished_at is not null
         and finished_at < $1
       returning id::text`,
      [cutoff]
    );
    return rows.length;
  }
}
