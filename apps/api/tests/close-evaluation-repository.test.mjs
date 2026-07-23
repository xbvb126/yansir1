import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-close-evaluation-repository");
const outFile = path.join(outDir, "close-evaluation.repository.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });

function evaluationDatabase(rows, statements) {
  let nextId = 1;

  return {
    async queryStrict(sql, params = []) {
      const text = String(sql);
      statements.push({ sql: text, params });

      if (text.includes("insert into strategy_close_evaluations")) {
        const [jobKey, symbol, timeframe, barTime, closedAt, source] = params;
        const existing = rows.get(jobKey);
        const canRetry = existing?.status === "failed" ||
          (existing?.status === "running" && existing.started_at < Date.now() - 300_000);
        if (existing && !canRetry) return [];

        if (existing) {
          existing.status = "running";
          existing.source = source;
          existing.attempts += 1;
          existing.error = null;
          existing.finished_at = null;
          existing.started_at = Date.now();
          return [{ id: existing.id, attempts: existing.attempts }];
        }

        const row = {
          id: `evaluation-${nextId++}`,
          job_key: jobKey,
          symbol,
          timeframe,
          bar_time: barTime,
          closed_at: closedAt,
          source,
          status: "running",
          attempts: 1,
          signal_count: 0,
          error: null,
          started_at: Date.now(),
          finished_at: null
        };
        rows.set(jobKey, row);
        return [{ id: row.id, attempts: row.attempts }];
      }

      if (text.includes("set status = 'succeeded'")) {
        const [id, signalCount, finishedAt] = params;
        const row = [...rows.values()].find((candidate) => candidate.id === id && candidate.status === "running");
        if (!row) return [];
        row.status = "succeeded";
        row.signal_count = signalCount;
        row.error = null;
        row.finished_at = finishedAt;
        return [{ id }];
      }

      if (text.includes("set status = 'failed'")) {
        const [id, error, finishedAt] = params;
        const row = [...rows.values()].find((candidate) => candidate.id === id && candidate.status === "running");
        if (!row) return [];
        row.status = "failed";
        row.error = error;
        row.finished_at = finishedAt;
        return [{ id }];
      }

      if (text.includes("select job_key")) {
        return params[0].filter((key) => rows.get(key)?.status === "succeeded").map((job_key) => ({ job_key }));
      }

      if (text.includes("delete from strategy_close_evaluations")) {
        const cutoff = params[0];
        const finished = [...rows.values()].filter((row) => row.finished_at && row.finished_at < cutoff);
        for (const row of finished) rows.delete(row.job_key);
        return finished.map((row) => ({ id: row.id }));
      }

      throw new Error(`unexpected_sql:${text}`);
    }
  };
}

try {
  const schema = readFileSync(path.join(repoRoot, "infra", "schema.sql"), "utf8");
  assert.match(schema, /create table if not exists strategy_close_evaluations/i);
  assert.match(schema, /job_key varchar\(255\) not null unique/i);
  assert.match(schema, /idx_close_evaluations_status_time/i);
  assert.match(schema, /idx_close_evaluations_symbol_time/i);

  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    "src/modules/strategy/close-evaluation.repository.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    `--outfile=${outFile}`
  ], { cwd: apiRoot, stdio: "inherit" });

  const { CloseEvaluationRepository } = await import(pathToFileURL(outFile));
  const rows = new Map();
  const statements = [];
  const repository = new CloseEvaluationRepository(evaluationDatabase(rows, statements));
  const job = {
    key: "BTCUSDT:5m:1784778300000",
    symbol: "BTCUSDT",
    timeframe: "5m",
    klineOpenTime: 1784778300000,
    closedAt: new Date("2026-07-23T03:50:00.000Z"),
    enqueuedAt: new Date("2026-07-23T03:50:00.250Z"),
    source: "realtime"
  };

  const first = await repository.reserve(job);
  const duplicate = await repository.reserve(job);
  assert.equal(first.id, "evaluation-1");
  assert.equal(first.attempts, 1);
  assert.equal(duplicate, null, "a running or succeeded job cannot reserve twice");

  await repository.complete(first.id, 2, new Date("2026-07-23T03:50:12.000Z"));
  assert.equal(rows.get(job.key).status, "succeeded");
  assert.equal(rows.get(job.key).signal_count, 2);

  const retry = await repository.reserve({ ...job, source: "reconciliation" });
  assert.equal(retry, null, "a completed realtime job cannot be replayed by reconciliation");

  const failedJob = { ...job, key: "ETHUSDT:5m:1784778300000", symbol: "ETHUSDT" };
  const failedReservation = await repository.reserve(failedJob);
  await repository.fail(failedReservation.id, "market_timeout", new Date("2026-07-23T03:50:13.000Z"));
  assert.equal(rows.get("ETHUSDT:5m:1784778300000").status, "failed");

  const recovered = await repository.reserve({ ...failedJob, source: "reconciliation" });
  assert.equal(recovered.attempts, 2, "a failed evaluation can be re-reserved");
  await repository.complete(recovered.id, 0, new Date("2026-07-23T03:50:14.000Z"));

  assert.deepEqual(
    await repository.findCompletedKeys([job.key, failedJob.key, "SOLUSDT:5m:1784778300000"]),
    new Set([job.key, failedJob.key])
  );
  assert.equal(await repository.purgeFinishedBefore(new Date("2026-07-23T03:50:15.000Z")), 2);
  assert.equal(rows.size, 0);

  const reserveSql = statements.find((statement) => statement.sql.includes("insert into strategy_close_evaluations"))?.sql;
  assert.match(reserveSql, /on conflict \(job_key\) do update/i);
  assert.match(reserveSql, /status = 'failed'/i);
  assert.match(reserveSql, /interval '5 minutes'/i);
  assert.ok(statements.every((statement) => !statement.sql.includes("signal_events") && !statement.sql.includes("signal_performance")));

  console.log("close evaluation repository tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
