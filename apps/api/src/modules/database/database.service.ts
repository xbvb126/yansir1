import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, PoolClient, QueryResultRow } from "pg";

export type DatabaseTransaction = {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
};

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

  async queryStrict<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error("database_unavailable");
    }

    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async withTransaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error("database_unavailable");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await operation(transactionFor(client));
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.warn(`[database] Transaction rollback failed: ${(rollbackError as Error).message}`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async withAdvisoryTransaction<T>(key: string, operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.withTransaction(async (transaction) => {
      await transaction.query("select pg_advisory_xact_lock(hashtextextended($1::text, 0))", [key]);
      return operation(transaction);
    });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}

function transactionFor(client: PoolClient): DatabaseTransaction {
  return {
    async query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return result.rows;
    }
  };
}
