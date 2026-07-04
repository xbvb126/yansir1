const signals = [
  {
    symbol: "UB",
    name: "Unibase",
    badge: "Alpha",
    icon: "smile",
    price: "0.1543",
    gain: "28.78%",
    time: "22:05",
    score: 91,
    direction: "long",
    title: "交易活跃，首次符合 FOMO 特征",
    reason: "合约交易量激增，OI 同步放大，可能是利多信号，但需注意回撤风险。",
    oiChange: "+34.2%",
    funding: "0.018%",
    tags: ["UB", "首次FOMO", "异常活跃", "利多", "合约"]
  },
  {
    symbol: "XRP",
    name: "Ripple",
    icon: "xrp",
    price: "1.36",
    gain: "0.01%",
    time: "22:00",
    score: 43,
    direction: "flat",
    title: "价格横盘，量能观察中",
    reason: "价格波动较低，OI 未出现明显扩张，暂未形成强信号。",
    oiChange: "+2.1%",
    funding: "0.006%",
    tags: ["XRP", "观察"]
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    badge: "Alpha",
    icon: "btc",
    price: "76984.71",
    gain: "1.20%",
    time: "21:55",
    score: 72,
    direction: "short",
    title: "利空趋势延续中",
    reason: "资金费率偏高，价格突破失败，短线存在多头拥挤风险。",
    oiChange: "+12.8%",
    funding: "0.041%",
    tags: ["BTC", "风险", "利空", "合约"]
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    icon: "eth",
    price: "3606.80",
    gain: "3.86%",
    time: "21:50",
    score: 78,
    direction: "long",
    title: "资金活跃，趋势信号增强",
    reason: "ADX 上行且 ATR 放大，多周期趋势开始同步。",
    oiChange: "+18.6%",
    funding: "0.014%",
    tags: ["ETH", "趋势", "利多"]
  }
];

const marketRows = [
  { symbol: "BTC", price: "76984.71", change: "+1.20%", oi: "+12.8%", funding: "0.041%", score: 72, state: "多头拥挤" },
  { symbol: "ETH", price: "3606.80", change: "+3.86%", oi: "+18.6%", funding: "0.014%", score: 78, state: "趋势增强" },
  { symbol: "UB", price: "0.1543", change: "+28.78%", oi: "+34.2%", funding: "0.018%", score: 91, state: "首次FOMO" },
  { symbol: "XRP", price: "1.36", change: "+0.01%", oi: "+2.1%", funding: "0.006%", score: 43, state: "观察" }
];

const factors = [
  { name: "OI 异常", value: "34.2%", desc: "持仓量较 1 小时均值明显放大", level: "high" },
  { name: "Funding 偏离", value: "0.041%", desc: "多头拥挤，需防范回撤或插针", level: "risk" },
  { name: "成交量突增", value: "4.8x", desc: "短线成交量进入异常区间", level: "high" },
  { name: "趋势一致性", value: "3/3", desc: "5m/15m/1h 多周期方向同步", level: "normal" }
];

const clawBlocks = [
  {
    type: "summary",
    title: "今日值得关注的币种（ValueScan AI 信号）",
    badge: "已分析",
    time: "2026-01-20 12:23"
  },
  {
    type: "group",
    title: "AI 机会币（综合评分排名）",
    tone: "green",
    items: [
      "ARC — $0.0644，24h +49.2%，7d -2.9%，评分 60 — 24h 涨幅最大，短期动能强",
      "RIVER — $6.72，24h -0.9%，7d +8.7%，评分 57 — 7d 表现亮眼，主力资金活跃",
      "DOGE — $0.0987，24h -3.3%，7d -7.0%，评分 55 — 市值大、流动性好，15m/30m 资金回暖",
      "SOL — $81.20，24h -3.3%，7d -6.8%，评分 51 — 4h/6h 主力资金净流入，中期有支撑"
    ]
  },
  {
    type: "group",
    title: "我的建议",
    items: [
      "偏短线关注：ARC（评分最高 60）— 24h 涨幅近 50%，短期动能强，但波动大，适合激进短线，注意控制仓位",
      "偏稳健关注：RIVER（评分 57）— 7d 涨近 9%，趋势偏强，可关注回调机会",
      "偏稳健关注：DOGE（评分 55）— 虽然日内回调，但短周期资金已转正，适合轻仓低吸",
      "观察关注：SOL（评分 51）— 4h/6h 主力资金净流入，中期有支撑，适合波段思路"
    ]
  },
  {
    type: "risk",
    title: "风险提示",
    items: ["以上均为 AI 信号筛选，不构成投资建议，市场有风险，决策需谨慎"]
  }
];

const rowRoot = document.querySelector("#signalRows");
const timelineRoot = document.querySelector("#timeline");
const signalFeed = document.querySelector("#signalFeed");
const dataTable = document.querySelector("#dataTable");
const factorList = document.querySelector("#factorList");
const clawChat = document.querySelector("#clawChat");
const userProfile = document.querySelector("#userProfile");
const planList = document.querySelector("#planList");
const userTable = document.querySelector("#userTable");
const feishuStatus = document.querySelector("#feishuStatus");
const toast = document.querySelector("#toast");
const sendAlert = document.querySelector("#sendAlert");
const dedupeToggle = document.querySelector("#dedupeToggle");
const navButtons = document.querySelectorAll(".bottom-nav button");

let commercialState = {
  user: null,
  plan: null,
  plans: [],
  users: [],
  feishuConfigured: false
};

function iconMarkup(signal) {
  const label = signal.symbol.slice(0, 1);
  return `<span class="coin-icon ${signal.icon}">${signal.icon === "smile" ? "⌣" : label}</span>`;
}

function statusText(status) {
  const map = { active: "正常", trial: "试用", frozen: "冻结" };
  return map[status] || status;
}

function renderRows() {
  rowRoot.innerHTML = signals
    .map(
      (signal, index) => `
      <article class="signal-row ${index === 0 ? "expanded" : ""}" data-index="${index}">
        <div class="coin-cell">
          ${signal.badge ? `<span class="alpha-badge">${signal.badge}</span>` : ""}
          ${iconMarkup(signal)}
          <strong>${signal.symbol}</strong>
          ${signal.score >= 85 ? `<span class="heat">●</span>` : ""}
        </div>
        <div class="price-cell">${signal.price}</div>
        <div class="gain-cell ${signal.direction === "short" ? "negative" : "positive"}">${signal.gain}</div>
        <div class="time-cell">${signal.time}</div>
        <button class="expand-button" aria-label="展开 ${signal.symbol}">
          <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div class="detail">
          <div class="detail-line">
            <strong>${signal.symbol}</strong> ${signal.title}
          </div>
          <p>${signal.reason}</p>
          <div class="tags">${signal.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        </div>
      </article>`
    )
    .join("");
}

function renderTimeline() {
  const visibleSignals = dedupeToggle.checked ? signals.filter((item) => item.score >= 70) : signals;
  timelineRoot.innerHTML = visibleSignals
    .map(
      (signal) => `
      <article class="timeline-card ${signal.direction}">
        <div class="card-head">
          <div>${iconMarkup(signal)} <strong>${signal.symbol}</strong> <span>${signal.time}</span></div>
          <button class="expand-button" aria-label="详情">
            <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
        <strong class="card-price">$${signal.price}</strong>
        <div class="alert-strip">${signal.direction === "short" ? "↘ 利空趋势延续中" : "↗ 利多信号增强中"}</div>
      </article>`
    )
    .join("");
}

function renderSignalCenter() {
  feishuStatus.textContent = commercialState.feishuConfigured ? "已连接" : "未配置";
  signalFeed.innerHTML = signals
    .filter((signal) => signal.score >= 70)
    .map(
      (signal) => `
      <article class="feed-item">
        <div>
          <strong>${signal.symbol}</strong>
          <span>${signal.title}</span>
        </div>
        <button data-alert="${signal.symbol}">推送飞书</button>
      </article>`
    )
    .join("");
}

function renderDataView() {
  dataTable.innerHTML = marketRows
    .map(
      (row) => `
      <article class="data-row">
        <div>
          <strong>${row.symbol}</strong>
          <span>${row.state}</span>
        </div>
        <div>
          <strong>$${row.price}</strong>
          <span>价格</span>
        </div>
        <em>${row.change}</em>
        <button>${row.score}</button>
      </article>`
    )
    .join("");

  factorList.innerHTML = factors
    .map(
      (factor) => `
      <article class="factor-card ${factor.level}">
        <div>
          <strong>${factor.name}</strong>
          <span>${factor.desc}</span>
        </div>
        <em>${factor.value}</em>
      </article>`
    )
    .join("");
}

function renderClawView() {
  clawChat.innerHTML = clawBlocks
    .map(
      (block) => {
        if (block.type === "summary") {
          return `
            <article class="analysis-status">
              <strong>${block.badge}</strong>
              <span>${block.time}</span>
            </article>
            <article class="analysis-block">
              <h2>${block.title}</h2>
            </article>`;
        }

        return `
          <article class="analysis-block ${block.type} ${block.tone || ""}">
            <h2>${block.title}</h2>
            <ul>
              ${block.items.map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </article>`;
      }
    )
    .join("");
}

function renderAccount() {
  const { user, plan, plans, users, feishuConfigured } = commercialState;
  if (!user) return;
  const usagePct = Math.min(100, Math.round((user.signalUsed / user.signalQuota) * 100));

  userProfile.innerHTML = `
    <div class="profile-main">
      <div class="avatar">AI</div>
      <div>
        <strong>${user.name}</strong>
        <span>${user.phone} · ${user.role === "admin" ? "管理员" : "成员"}</span>
      </div>
      <em>${user.plan}</em>
    </div>
    <div class="usage-block">
      <div><span>信号额度</span><strong>${user.signalUsed}/${user.signalQuota}</strong></div>
      <div class="usage-track"><i style="width:${usagePct}%"></i></div>
    </div>
    <div class="entitlements">
      <span>到期 ${user.expiresAt}</span>
      <span>飞书 ${feishuConfigured ? "已配置" : "未配置"}</span>
      <span>席位 ${user.teamSeats}</span>
    </div>
  `;

  planList.innerHTML = plans
    .map(
      (item) => `
      <article class="plan-card ${item.name === user.plan ? "current" : ""}">
        <div>
          <strong>${item.name}</strong>
          <span>${item.features.slice(0, 2).join(" / ")}</span>
        </div>
        <em>${item.price === 0 ? "免费" : `¥${item.price}/月`}</em>
      </article>`
    )
    .join("");

  userTable.innerHTML = users
    .map(
      (item) => `
      <article class="user-row">
        <div>
          <strong>${item.name}</strong>
          <span>${item.phone}</span>
        </div>
        <span class="plan-pill">${item.plan}</span>
        <span>${statusText(item.status)}</span>
      </article>`
    )
    .join("");
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active-view"));
  document.querySelector(`#${viewName}View`)?.classList.add("active-view");

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function triggerFeishu(signal = signals[0]) {
  sendAlert.disabled = true;
  try {
    const response = await fetch("/api/alerts/feishu", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signal)
    });
    const result = await response.json();
    if (result.skipped) {
      showToast("已生成告警，请先配置 FEISHU_WEBHOOK_URL");
    } else if (response.ok) {
      showToast("飞书告警已发送");
    } else {
      showToast("飞书发送失败，请检查 webhook", true);
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    sendAlert.disabled = false;
  }
}

async function loadCommercialState() {
  const [meResponse, plansResponse, usersResponse] = await Promise.all([
    fetch("/api/me"),
    fetch("/api/billing/plans"),
    fetch("/api/admin/users")
  ]);
  const me = await meResponse.json();
  const billing = await plansResponse.json();
  const admin = await usersResponse.json();
  commercialState = {
    user: me.user,
    plan: me.plan,
    plans: billing.plans,
    users: admin.users,
    feishuConfigured: me.feishuConfigured
  };
  renderSignalCenter();
  renderAccount();
}

rowRoot.addEventListener("click", (event) => {
  const row = event.target.closest(".signal-row");
  if (!row) return;
  row.classList.toggle("expanded");
});

signalFeed.addEventListener("click", (event) => {
  const button = event.target.closest("[data-alert]");
  if (!button) return;
  const signal = signals.find((item) => item.symbol === button.dataset.alert);
  triggerFeishu(signal);
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

dedupeToggle.addEventListener("change", renderTimeline);
sendAlert.addEventListener("click", () => triggerFeishu());

renderRows();
renderTimeline();
renderDataView();
renderClawView();
loadCommercialState();

const initialView = new URLSearchParams(window.location.search).get("view");
if (["data", "claw", "radar", "signal", "account"].includes(initialView)) {
  switchView(initialView);
}
