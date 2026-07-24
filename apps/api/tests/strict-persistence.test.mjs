import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-strict-persistence");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });

function bundle(entry, output) {
  execFileSync(esbuildCommand, [
    ...esbuildArgsPrefix,
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    `--outfile=${output}`
  ], { cwd: apiRoot, stdio: "inherit" });
}

const strategySignal = {
  symbol: "BTCUSDT",
  timeframe: "5m",
  direction: "long",
  signalType: "trend_long_signal",
  title: "Strict persistence",
  reason: "test",
  price: 64000,
  score: 90,
  source: "strategy-service",
  dedupeKey: "BTCUSDT:5m:1784642400000:pine-v6-v1:trend_long_signal:long:long",
  barTime: new Date("2026-07-21T14:00:00.000Z"),
  emittedAt: new Date("2026-07-21T14:05:00.000Z"),
  strategyVersion: "pine-v6-v1",
  formal: true,
  payload: { engine: "pine_v6", formal: true, strategyVersion: "pine-v6-v1" }
};

try {
  const databaseOut = path.join(outDir, "database.service.mjs");
  const repositoryOut = path.join(outDir, "signals.repository.mjs");
  bundle("src/modules/database/database.service.ts", databaseOut);
  bundle("src/modules/signals/signals.repository.ts", repositoryOut);
  const { DatabaseService } = await import(pathToFileURL(databaseOut));
  const { SignalsRepository } = await import(pathToFileURL(repositoryOut));

  {
    const database = new DatabaseService();
    database.pool = {
      query: async () => { throw new Error("configured database unavailable"); }
    };
    assert.deepEqual(await database.query("select compatibility"), []);
    await assert.rejects(database.queryStrict("select formal"), /configured database unavailable/);
  }

  {
    const statements = [];
    let released = false;
    const client = {
      query: async (sql, params = []) => {
        statements.push({ sql: String(sql), params });
        return { rows: String(sql).includes("select formal_work") ? [{ ok: true }] : [] };
      },
      release: () => { released = true; }
    };
    const database = new DatabaseService();
    database.pool = { connect: async () => client };
    const rows = await database.withAdvisoryTransaction("formal-delivery:user-1", (transaction) =>
      transaction.query("select formal_work")
    );
    assert.deepEqual(rows, [{ ok: true }]);
    assert.match(statements[0].sql, /^begin$/i);
    assert.match(statements[1].sql, /pg_advisory_xact_lock/);
    assert.deepEqual(statements[1].params, ["formal-delivery:user-1"]);
    assert.match(statements.at(-1).sql, /^commit$/i);
    assert.equal(released, true);
  }

  {
    const repository = new SignalsRepository({
      enabled: true,
      withTransaction: async (operation) => operation({
        query: async () => { throw new Error("strict write failed"); }
      })
    });
    await assert.rejects(repository.saveStrategySignalsStrict([strategySignal]), /strict write failed/);
  }

  {
    let queryCount = 0;
    const repository = new SignalsRepository({
      enabled: true,
      withTransaction: async (operation) => operation({
        query: async () => {
          queryCount += 1;
          if (queryCount === 1) return [{ signal_id: "signal-1" }];
          return [];
        }
      })
    });
    await assert.rejects(repository.saveStrategySignalsStrict([strategySignal]), /signal_persistence_incomplete/);
  }

  {
    const statements = [];
    let queryCount = 0;
    const repository = new SignalsRepository({
      enabled: true,
      withTransaction: async (operation) => operation({
        query: async (sql, params = []) => {
          const text = String(sql);
          statements.push({ sql: text, params });
          queryCount += 1;
          if (queryCount === 1) return [{ signal_id: "signal-1" }];
          if (text.includes("insert into signal_events")) return [];
          if (text.includes("from signal_events") && text.includes("dedupe_key")) return [{ id: "event-existing" }];
          return [];
        }
      })
    });
    const persisted = await repository.saveStrategySignalsStrict([strategySignal]);
    assert.deepEqual(persisted, { persisted: true, count: 1 });
    const eventInsert = statements.find(({ sql }) => sql.includes("insert into signal_events"));
    assert.ok(eventInsert, "formal persistence must insert the event");
    assert.match(eventInsert.sql, /strategy_version/i);
    assert.match(eventInsert.sql, /is_formal/i);
    assert.match(eventInsert.sql, /on conflict \(dedupe_key\) do nothing/i);
    assert.doesNotMatch(eventInsert.sql, /on conflict \(dedupe_key\) do update/i);
    assert.ok(eventInsert.params.some((value) => value === "pine-v6-v1"));
    assert.ok(eventInsert.params.some((value) => value === true));
  }

  {
    let publicQuery = "";
    const repository = new SignalsRepository({
      query: async (sql) => {
        publicQuery = String(sql);
        return [{
          id: "event-immutable",
          symbol: "BTCUSDT",
          direction: "long",
          price: "64000",
          score: 90,
          emitted_at: "2026-07-23T04:00:00.000Z",
          title: publicQuery.includes("se.title") ? "Immutable event title" : "Mutable parent title",
          reason: publicQuery.includes("se.reason") ? "Immutable event reason" : "Mutable parent reason",
          signal_type: publicQuery.includes("se.signal_type") ? "versioned_event_type" : "parent_type",
          return_15m: null,
          oi_change: null,
          funding: null
        }];
      }
    });
    const [projected] = await repository.findLatest();
    assert.equal(projected.title, "Immutable event title");
    assert.equal(projected.reason, "Immutable event reason");
    assert.ok(projected.tags.includes("versioned_event_type"));
    assert.doesNotMatch(publicQuery, /left join signals s/i);
    assert.match(publicQuery, /se\.title/i);
    assert.match(publicQuery, /se\.reason/i);
    assert.match(publicQuery, /se\.signal_type/i);
    assert.match(publicQuery, /se\.is_formal = true/i);
    assert.match(publicQuery, /se\.timeframe = '5m'/i);
    assert.match(publicQuery, /se\.emitted_at <= now\(\) - interval '8 hours'/i);
    assert.match(publicQuery, /se\.emitted_at >= now\(\) - interval '7 days'/i);
  }

  console.log("strict persistence tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
