import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env-loader.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3101";
const webBaseUrl = process.env.WEB_BASE_URL || "http://127.0.0.1:3200";
const strategyBaseUrl = process.env.STRATEGY_SERVICE_URL || "http://127.0.0.1:8000";
const strict = process.env.REQUIRE_PRODUCTION_READY === "true";
const billingProvider = process.env.BILLING_PROVIDER || "mock";

const checks = [];

function check(name, ok, detail, severity = "error") {
  checks.push({ name, ok, detail, severity });
}

async function reachable(name, url, expectedText) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const ok = response.ok && (!expectedText || text.includes(expectedText));
    check(name, ok, ok ? "reachable" : `${response.status} unexpected response`);
  } catch (error) {
    check(name, false, error.message);
  }
}

check("DATABASE_URL", Boolean(process.env.DATABASE_URL), process.env.DATABASE_URL ? "configured" : "missing");
check(
  "AUTH_TOKEN_SECRET",
  Boolean(process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET !== "dev-radar-secret"),
  process.env.AUTH_TOKEN_SECRET ? "configured" : "missing"
);
check("BILLING_WEBHOOK_SECRET", Boolean(process.env.BILLING_WEBHOOK_SECRET), process.env.BILLING_WEBHOOK_SECRET ? "configured" : "missing");
check("CORS_ORIGIN", Boolean(process.env.CORS_ORIGIN), process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN : "missing");
check(
  "BILLING_PROVIDER",
  Boolean(billingProvider && billingProvider !== "mock"),
  billingProvider === "mock" ? "mock is not allowed for production launch" : billingProvider
);
checkProviderCredentials();
check("REDIS_URL", Boolean(process.env.REDIS_URL), process.env.REDIS_URL ? "configured" : "missing", "warning");
checkFeishuWebhook();

await reachable("API health", `${apiBaseUrl}/api/health`, "\"status\":\"ok\"");
await checkReadiness();
await reachable("Web app", `${webBaseUrl}/?view=account`, "root");
await reachable("Strategy health", `${strategyBaseUrl}/strategy/health`, "\"status\":\"ok\"");

for (const item of checks) {
  const marker = item.ok ? "PASS" : item.severity === "warning" ? "WARN" : "FAIL";
  console.log(`${marker} ${item.name}: ${item.detail}`);
}

const failures = checks.filter((item) => !item.ok && (strict || item.severity === "error"));
if (failures.length) {
  process.exitCode = 1;
}

async function checkReadiness() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health/readiness`);
    const body = await response.json();
    const blockers = body.blockers?.length || 0;
    const ok = response.ok && body.status === "ready";
    check("API readiness", ok, `${body.status || "unknown"} (${blockers} blockers)`);
  } catch (error) {
    check("API readiness", false, error.message);
  }
}

function checkFeishuWebhook() {
  const requireGlobalWebhook = process.env.REQUIRE_GLOBAL_FEISHU_WEBHOOK === "true";
  const configured = Boolean(process.env.FEISHU_WEBHOOK_URL);
  if (requireGlobalWebhook) {
    check("FEISHU_WEBHOOK_URL", configured, configured ? "configured" : "missing", "warning");
    return;
  }

  check(
    "FEISHU_WEBHOOK_URL",
    true,
    configured ? "configured" : "optional; per-user push settings are used"
  );
}

function checkProviderCredentials() {
  if (billingProvider === "stripe") {
    check("STRIPE_SECRET_KEY", Boolean(process.env.STRIPE_SECRET_KEY), process.env.STRIPE_SECRET_KEY ? "configured" : "missing");
    return;
  }

  if (billingProvider === "wechat") {
    check("WECHAT_PAY_MCH_ID", Boolean(process.env.WECHAT_PAY_MCH_ID), process.env.WECHAT_PAY_MCH_ID ? "configured" : "missing");
    check("WECHAT_PAY_API_KEY", Boolean(process.env.WECHAT_PAY_API_KEY), process.env.WECHAT_PAY_API_KEY ? "configured" : "missing");
    return;
  }

  if (billingProvider === "alipay") {
    check("ALIPAY_APP_ID", Boolean(process.env.ALIPAY_APP_ID), process.env.ALIPAY_APP_ID ? "configured" : "missing");
    check("ALIPAY_PRIVATE_KEY", Boolean(process.env.ALIPAY_PRIVATE_KEY), process.env.ALIPAY_PRIVATE_KEY ? "configured" : "missing");
  }
}
