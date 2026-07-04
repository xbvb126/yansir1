import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    this.pool = process.env.DATABASE_URL
      ? new Pool({
          connectionString: process.env.DATABASE_URL
        })
      : null;
  }

  get enabled() {
    return Boolean(this.pool);
  }

  async health() {
    if (!this.pool) {
      return {
        mode: "mock",
        connected: false
      };
    }

    try {
      await this.pool.query("select 1");
      return {
        mode: "postgres",
        connected: true
      };
    } catch (error) {
      return {
        mode: "postgres",
        connected: false,
        error: (error as Error).message
      };
    }
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) {
      return [];
    }

    try {
      const result = await this.pool.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      console.warn(`[database] Query failed; returning empty result: ${(error as Error).message}`);
      return [];
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
