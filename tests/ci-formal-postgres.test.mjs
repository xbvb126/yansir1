import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "plan-permissions-ci.yml"), "utf8");
const verifierPath = path.join(repoRoot, "infra", "verify-formal-postgres.mjs");
assert.ok(existsSync(verifierPath), "formal PostgreSQL verifier must exist");
const verifier = readFileSync(verifierPath, "utf8");
const runtimeVerifierPath = path.join(repoRoot, "infra", "run-formal-runtime-ci.mjs");
assert.ok(existsSync(runtimeVerifierPath), "formal runtime readiness verifier must exist");
const runtimeVerifier = readFileSync(runtimeVerifierPath, "utf8");
const migration = readFileSync(path.join(repoRoot, "infra", "migrate.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

for (const required of [
  "services:",
  "postgres:",
  "postgres:16-alpine",
  "POSTGRES_DB: radar",
  "POSTGRES_USER: radar",
  "POSTGRES_PASSWORD: radar",
  "pg_isready",
  "DATABASE_URL: postgresql://radar:radar@127.0.0.1:5432/radar",
  "npm run db:schema",
  "npm run db:verify",
  "npm run db:verify-formal",
  "npm run build:api",
  "npm run ci:verify-formal-runtime",
  "npm run test:plans:ci"
]) {
  assert.ok(workflow.includes(required), `PostgreSQL CI workflow must include: ${required}`);
}

assert.equal(
  packageJson.scripts["db:verify-formal"],
  "node infra/verify-formal-postgres.mjs",
  "formal PostgreSQL verification must be a real package gate"
);
assert.equal(
  packageJson.scripts["ci:verify-formal-runtime"],
  "node infra/run-formal-runtime-ci.mjs",
  "formal runtime readiness must be a real package gate"
);
assert.ok(
  packageJson.scripts["test:ci-config"].includes("ci-formal-postgres.test.mjs"),
  "local CI structure checks must cover the PostgreSQL gate"
);

for (const required of [
  "new Client",
  "client.connect()",
  "strategy_close_evaluations",
  "signal_events",
  "user_signal_inbox",
  "signal_performance",
  "alert_deliveries",
  "is_formal",
  "strategy_version",
  "begin",
  "rollback"
]) {
  assert.ok(verifier.includes(required), `formal verifier must exercise real PostgreSQL dependency: ${required}`);
}
assert.doesNotMatch(
  verifier,
  /database\.connected\s*===\s*false|allowDisconnected|mock.*ready/i,
  "formal PostgreSQL verification must not accept a disconnected/mock database"
);
for (const required of [
  "WebSocketServer",
  "apps/api/dist/main.js",
  "STRATEGY_FORMAL_SYMBOLS",
  "BINANCE_REALTIME_STREAM_URL",
  "/api/health",
  "database.connected",
  "formalSignals.ready"
]) {
  assert.ok(runtimeVerifier.includes(required), `runtime verifier must exercise: ${required}`);
}
assert.match(
  runtimeVerifier,
  /formalSignals\.ready\s*!==\s*true[\s\S]*throw new Error/i,
  "runtime verifier must reject rather than accept non-ready formal status"
);
assert.ok(
  migration.includes('"strategy_close_evaluations"') && migration.includes('"signal_events"'),
  "db:verify must include the formal ledger tables"
);

console.log("formal PostgreSQL CI gate tests passed");
