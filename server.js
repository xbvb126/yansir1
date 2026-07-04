import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const feishuWebhook = process.env.FEISHU_WEBHOOK_URL || "";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    signalQuota: 10,
    feishu: false,
    apiAccess: false,
    features: ["延迟信号", "基础异常分", "自选 5 个币"]
  },
  {
    id: "vip",
    name: "VIP",
    price: 199,
    signalQuota: 300,
    feishu: true,
    apiAccess: false,
    features: ["实时信号", "飞书告警", "自选 50 个币", "推送后涨跌追踪"]
  },
  {
    id: "svip",
    name: "SVIP",
    price: 699,
    signalQuota: 2000,
    feishu: true,
    apiAccess: true,
    features: ["全市场扫描", "团队子账号", "API 订阅", "高级资金/OI 风险模型"]
  }
];

const users = [
  {
    id: "u_1001",
    name: "YanSir",
    phone: "138****8821",
    role: "admin",
    plan: "SVIP",
    status: "active",
    expiresAt: "2026-07-07",
    signalUsed: 384,
    signalQuota: 2000,
    feishuEnabled: true,
    teamSeats: "3/5"
  },
  {
    id: "u_1002",
    name: "合约研究员",
    phone: "186****2450",
    role: "member",
    plan: "VIP",
    status: "active",
    expiresAt: "2026-06-28",
    signalUsed: 146,
    signalQuota: 300,
    feishuEnabled: true,
    teamSeats: "1/1"
  },
  {
    id: "u_1003",
    name: "试用用户",
    phone: "177****0198",
    role: "member",
    plan: "Free",
    status: "trial",
    expiresAt: "2026-06-10",
    signalUsed: 8,
    signalQuota: 10,
    feishuEnabled: false,
    teamSeats: "0/0"
  }
];

const currentUser = users[0];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildFeishuCard(signal) {
  const direction = signal.direction === "short" ? "利空" : "利多";
  const color = signal.direction === "short" ? "red" : "green";
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: `${signal.symbol} ${signal.title || "异常信号"}` },
        template: color
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**方向**：${direction}\n**价格**：$${signal.price}\n**异常分**：${signal.score}/100\n**触发原因**：${signal.reason}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**OI变化**：${signal.oiChange || "-"}    **Funding**：${signal.funding || "-"}    **时间**：${signal.time || "-"}`
          }
        }
      ]
    }
  };
}

async function sendFeishuAlert(signal) {
  if (!feishuWebhook) {
    return { skipped: true, message: "FEISHU_WEBHOOK_URL is not configured." };
  }

  const response = await fetch(feishuWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildFeishuCard(signal))
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text };
}

function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/me") {
    sendJson(res, 200, {
      user: currentUser,
      plan: plans.find((plan) => plan.name === currentUser.plan),
      feishuConfigured: Boolean(feishuWebhook)
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/billing/plans") {
    sendJson(res, 200, { plans });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    sendJson(res, 200, { users });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (routeApi(req, res, url)) return;

    if (req.method === "POST" && url.pathname === "/api/alerts/feishu") {
      const signal = await parseBody(req);
      const result = await sendFeishuAlert(signal);
      sendJson(res, result.ok === false ? 502 : 200, result);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(publicDir, safePath);
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Coin anomaly radar running at http://localhost:${port}`);
});
