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
  dedupeKey: "BTCUSDT:5m:strict",
  emittedAt: new Date("2026-07-21T14:05:00.000Z"),
  payload: { engine: "pine_v6" }
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

  console.log("strict persistence tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
