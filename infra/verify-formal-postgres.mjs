import pg from "pg";
import { loadLocalEnv } from "./env-loader.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const databaseUrl = process.env.DATABASE_URL || "postgresql://radar:radar@127.0.0.1:5432/radar";
const client = new Client({ connectionString: databaseUrl });
const requiredTables = [
  "strategy_close_evaluations",
  "signal_events",
  "user_signal_inbox",
  "signal_performance",
  "alert_deliveries"
];
const requiredSignalColumns = ["bar_time", "emitted_at", "dedupe_key", "is_formal", "strategy_version"];

async function main() {
  await client.connect();
  let transactionOpen = false;
  try {
    const tables = await client.query(
      `
        select tablename
        from pg_tables
        where schemaname = 'public'
          and tablename = any($1::text[])
      `,
      [requiredTables]
    );
    assertSet("formal tables", requiredTables, tables.rows.map((row) => row.tablename));

    const columns = await client.query(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'signal_events'
          and column_name = any($1::text[])
      `,
      [requiredSignalColumns]
    );
    assertSet("signal_events columns", requiredSignalColumns, columns.rows.map((row) => row.column_name));

    const indexes = await client.query(
      `
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
      `,
      [["idx_signal_events_formal_time", "idx_close_evaluations_status_time", "idx_alert_deliveries_retry"]]
    );
    assertSet(
      "formal indexes",
      ["idx_signal_events_formal_time", "idx_close_evaluations_status_time", "idx_alert_deliveries_retry"],
      indexes.rows.map((row) => row.indexname)
    );

    await client.query("begin");
    transactionOpen = true;
    const unique = `${Date.now()}-${process.pid}`;
    const signal = await client.query(
      `
        insert into signals (symbol, market, direction, signal_type, title, reason, score, source)
        values ('BTCUSDT', 'futures', 'long', 'ci_formal_probe', 'CI formal probe', 'transactional readiness check', 100, 'ci')
        returning id
      `
    );
    const barTime = new Date(Math.floor(Date.now() / 300_000) * 300_000 - 300_000);
    const closedAt = new Date(barTime.getTime() + 300_000);
    await client.query(
      `
        insert into strategy_close_evaluations (
          job_key, symbol, timeframe, bar_time, closed_at, source,
          status, signal_count, finished_at
        )
        values ($1, 'BTCUSDT', '5m', $2, $3, 'realtime', 'succeeded', 1, now())
      `,
      [`ci:${unique}`, barTime, closedAt]
    );
    const event = await client.query(
      `
        insert into signal_events (
          signal_id, exchange, symbol, timeframe, direction, signal_type,
          title, reason, engine, price, score, bar_time, payload,
          dedupe_key, emitted_at, strategy_version, is_formal
        )
        values (
          $1, 'BINANCE_FUTURES', 'BTCUSDT', '5m', 'long', 'ci_formal_probe',
          'CI formal probe', 'transactional readiness check', 'ci', 1, 100, $2,
          '{"formal":true,"strategyVersion":"ci-probe"}'::jsonb,
          $3, $4, 'ci-probe', true
        )
        returning id
      `,
      [signal.rows[0].id, barTime, `ci:${unique}:event`, closedAt]
    );
    const joined = await client.query(
      `
        select se.id
        from signal_events se
        join strategy_close_evaluations sce
          on sce.symbol = se.symbol
         and sce.timeframe = se.timeframe
         and sce.bar_time = se.bar_time
        where se.id = $1
          and se.is_formal = true
          and se.strategy_version = 'ci-probe'
          and sce.status = 'succeeded'
      `,
      [event.rows[0].id]
    );
    if (joined.rowCount !== 1) throw new Error("formal PostgreSQL transactional probe was not readable");
    await client.query("rollback");
    transactionOpen = false;

    console.log(JSON.stringify({
      ready: true,
      database: databaseUrl,
      tables: requiredTables,
      signalEventColumns: requiredSignalColumns
    }, null, 2));
  } finally {
    if (transactionOpen) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original readiness failure.
      }
    }
    await client.end();
  }
}

function assertSet(label, expected, actual) {
  const found = new Set(actual);
  const missing = expected.filter((item) => !found.has(item));
  if (missing.length) throw new Error(`${label} missing: ${missing.join(", ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
