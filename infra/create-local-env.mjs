import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(rootDir, ".env.local");

if (fs.existsSync(envPath)) {
  console.log(".env.local already exists; keeping current file.");
  process.exit(0);
}

const env = [
  "NODE_ENV=development",
  "DATABASE_URL=postgresql://radar:radar@localhost:5432/radar",
  "REDIS_URL=redis://localhost:6379",
  "FEISHU_WEBHOOK_URL=",
  `AUTH_TOKEN_SECRET=${secret("auth")}`,
  `BILLING_WEBHOOK_SECRET=${secret("billing")}`,
  "STRATEGY_SERVICE_URL=http://127.0.0.1:8000",
  "API_PORT=3101",
  "WEB_PORT=3200",
  "STRATEGY_PORT=8000"
].join("\n");

fs.writeFileSync(envPath, `${env}\n`, "utf8");
console.log(`created ${path.relative(rootDir, envPath)}`);

function secret(prefix) {
  return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
}
