import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env-loader.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const apiBaseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3101";
const webBaseUrl = process.env.WEB_BASE_URL || "http://127.0.0.1:3200";

const checks = [];

async function check(name, run) {
  try {
    const detail = await run();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}

async function request(path, options = {}) {
  const { expectedStatus, headers = {}, ...restOptions } = options;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...restOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (expectedStatus && response.status === expectedStatus) {
    return body ?? { statusCode: response.status };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return body;
}

let token = "";

await check("API health", async () => {
  const body = await request("/api/health");
  return body.status || "ok";
});

await check("API readiness", async () => {
  const body = await request("/api/health/readiness");
  return `${body.status} (${body.blockers?.length || 0} blockers)`;
});

await check("Auth login", async () => {
  const body = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone: "13800008821", password: "radar123" })
  });
  token = body.token;
  return body.user?.role || "user";
});

await check("Session identity", async () => {
  const body = await request("/api/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body.user?.id || "unknown";
});

await check("Alert rule", async () => {
  const body = await request("/api/strategy/alert-rule", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return `${body.symbols?.length || 0} symbols`;
});

await check("Feishu config", async () => {
  const body = await request("/api/alerts/feishu/config", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body.enabled ? "enabled" : "disabled";
});

await check("Feishu test", async () => {
  const body = await request("/api/alerts/feishu/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  if (!body.sent && !body.skipped && !body.failed) {
    throw new Error("unexpected Feishu test result");
  }
  return body.sent ? "sent" : body.skipped ? "skipped" : "failed";
});

await check("Billing order", async () => {
  const created = await request("/api/billing/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planCode: "vip", provider: "mock" })
  });
  const orderId = created.order?.id;
  if (!orderId || created.order?.status !== "pending") {
    throw new Error("pending order was not created");
  }

  const paid = await request(`/api/billing/orders/${orderId}/pay`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  if (paid.order?.status !== "paid") {
    throw new Error("order was not marked paid");
  }
  return `${paid.user?.name || "user"} -> ${paid.user?.plan || "plan"}`;
});

await check("Billing authorization", async () => {
  await request("/api/billing/orders", {
    expectedStatus: 401
  });

  const phone = `139${Math.floor(10000000 + Math.random() * 89999999)}`;
  const member = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Member", phone, password: "radar123" })
  });

  await request("/api/billing/orders?userId=u_1001", {
    expectedStatus: 403,
    headers: { Authorization: `Bearer ${member.token}` }
  });

  return "401/403 enforced";
});

await check("Billing webhook", async () => {
  const created = await request("/api/billing/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planCode: "svip", provider: "mock" })
  });
  const orderId = created.order?.id;
  if (!orderId) {
    throw new Error("webhook order was not created");
  }

  const webhookSecret = process.env.BILLING_WEBHOOK_SECRET || "";
  const webhook = await request("/api/billing/webhook", {
    method: "POST",
    headers: webhookSecret ? { "x-billing-webhook-secret": webhookSecret } : {},
    body: JSON.stringify({ event: "subscription.activated", externalOrderId: orderId, provider: "mock" })
  });
  if (webhook.user?.plan !== "SVIP") {
    throw new Error("webhook did not activate SVIP");
  }
  return `${webhook.user?.name || "user"} -> ${webhook.user?.plan}`;
});

await check("Team dashboard", async () => {
  const body = await request("/api/team", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!body.summary || !Array.isArray(body.commissions)) {
    throw new Error("team dashboard shape is invalid");
  }
  return `${body.summary.members || 0} members`;
});

await check("Payment providers", async () => {
  const body = await request("/api/billing/providers");
  if (!Array.isArray(body.providers) || !body.providers.find((provider) => provider.provider === "mock")) {
    throw new Error("payment providers are missing");
  }
  return `${body.defaultProvider} default`;
});

await check("Web app", async () => {
  const response = await fetch(`${webBaseUrl}/?view=account`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (!text.includes("<div id=\"root\">")) {
    throw new Error("root mount node not found");
  }
  return "reachable";
});

for (const item of checks) {
  const marker = item.ok ? "PASS" : "FAIL";
  console.log(`${marker} ${item.name}: ${item.detail}`);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  process.exitCode = 1;
}
