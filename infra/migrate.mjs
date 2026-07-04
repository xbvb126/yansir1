import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadLocalEnv } from "./env-loader.mjs";

const { Client } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);
const databaseUrl = process.env.DATABASE_URL || "postgresql://radar:radar@localhost:5432/radar";
const command = process.argv[2] || "setup";

const files = {
  schema: path.join(rootDir, "infra", "schema.sql"),
  seed: path.join(rootDir, "infra", "seed.sql")
};

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (command === "schema" || command === "setup") {
      await runSqlFile(client, files.schema);
    }

    if (command === "seed" || command === "setup") {
      await runSqlFile(client, files.seed);
    }

    if (command === "verify" || command === "setup") {
      await verifyDatabase(client);
    }
  } finally {
    await client.end();
  }
}

async function runSqlFile(client, filePath) {
  const sql = await fs.readFile(filePath, "utf8");
  await client.query(sql);
  console.log(`applied ${path.relative(rootDir, filePath)}`);
}

async function verifyDatabase(client) {
  const checks = [
    ["users", "select count(*)::int as count from users"],
    ["plans", "select count(*)::int as count from plans"],
    ["billing_orders", "select count(*)::int as count from billing_orders"],
    ["feishu_bindings", "select count(*)::int as count from feishu_bindings"],
    ["alert_rules", "select count(*)::int as count from alert_rules"],
    ["alert_deliveries", "select count(*)::int as count from alert_deliveries"],
    ["signals", "select count(*)::int as count from signals"]
  ];

  const result = {};
  for (const [name, sql] of checks) {
    const response = await client.query(sql);
    result[name] = response.rows[0]?.count ?? 0;
  }

  console.log(JSON.stringify({ ok: true, database: databaseUrl, tables: result }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (String(error.message).includes("ECONNREFUSED")) {
    console.error("Postgres is not reachable. Start it with `docker compose -f infra/docker-compose.yml up -d`, then run `npm run db:setup`.");
  }
  process.exitCode = 1;
});
