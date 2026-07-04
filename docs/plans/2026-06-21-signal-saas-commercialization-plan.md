# Yansir 实时信号 SaaS 商业化开发计划

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: 把当前策略追踪系统升级成可商业化的实时信号订阅平台：后台监测 Binance 全币种，未登录用户看 8 小时延迟历史，登录用户看自选实时 inbox，付费用户获得更多自选、完整历史战绩和推送能力。

Architecture: 后台保留“全局信号池 + 用户自选 + 用户 inbox + 推送记录”的架构；新增信号结果追踪、套餐权限、用量限制、历史展示和转化页面。全市场信号只生成一次，用户层只做过滤、投递、权限和展示。

Tech Stack: NestJS API, React/Vite Web, PostgreSQL, Binance Spot WebSocket, Binance Futures REST, systemd, NGINX /yansir/ 子路径。

---

## 一、产品规则

### 1. 用户可见性

未登录用户：
- 可以访问策略追踪/公开信号页。
- 只能看到 signal_events.emitted_at <= now() - interval '8 hours' 的全市场历史信号。
- 能看到历史信号数据，但所有实时信号延迟 8 小时。
- 页面必须明确标注：“公开信号延迟 8 小时，登录后可查看自选实时信号”。

免费登录用户：
- 可以维护有限自选币种。
- 只显示自己自选币种命中的实时 inbox。
- 保留历史 inbox 展示，不覆盖、不删除。
- 推送能力默认关闭或强限制。

付费用户：
- 可以选择更多币种和周期。
- 可以查看更长历史。
- 可以配置飞书/后续 Telegram 推送。
- 可以查看信号战绩统计、MFE/MAE、后续收益等完整指标。

管理员：
- 可以查看全市场实时信号、公开延迟信号、所有用户 inbox、推送状态和系统实时监听状态。

### 2. 历史信号保留策略

- signal_events 永久保留，作为全局历史信号池。
- user_signal_inbox 永久保留，代表“当时这个用户收到了这条信号”。
- 用户取消自选币后，不再匹配新信号，但历史 inbox 不删除。
- 前端默认展示当前自选命中的历史；提供“全部历史”入口查看已取消自选币的历史记录。
- alert_deliveries 永久保留，用于排查是否推送、为什么跳过、是否失败。

### 3. 商业化套餐建议

Free:
- 未登录/免费公开延迟信号：8 小时延迟。
- 登录后自选币种上限：3-5 个。
- 周期：5m。
- 历史：7 天。
- 推送：关闭或每天少量体验。

VIP:
- 自选币种上限：20-50 个。
- 周期：5m、15m。
- 历史：30 天。
- 飞书推送：开启。
- 最低推送评分：65。

SVIP:
- 自选币种上限：100-200 个。
- 周期：5m、15m、1h、4h。
- 历史：180 天或更长。
- 完整战绩统计。
- API 权限。
- 多 webhook/团队功能。

---

## 二、数据库设计任务

### Task 1: 清理 schema.sql 重复迁移块

Objective: 当前 infra/schema.sql 后半部分有重复 alter table 块，先清理，避免后续迁移越来越难维护。

Files:
- Modify: infra/schema.sql

Steps:
1. 保留 create table 和每个 alter table add column if not exists 只出现一次。
2. 保留现有表：users, plans, subscriptions, usage_quotas, feishu_bindings, alert_rules, watchlists, signals, signal_events, user_signal_inbox, alert_deliveries, signal_performance。
3. 确保重复的 watchlists/signal_events/alert_deliveries alter table 不再重复出现。
4. 运行：docker exec radar-postgres psql -U radar -d radar -f /docker-entrypoint-initdb.d/schema.sql 或项目现有迁移命令。
5. 验证：API /api/health 返回 database.connected=true。

### Task 2: 扩展 plans 表的商业化字段

Objective: 把套餐权益从硬编码逐步迁移到数据库。

Files:
- Modify: infra/schema.sql
- Modify: infra/seed.sql

Add columns to plans:
- max_watchlist_symbols integer not null default 5
- allowed_timeframes text[] not null default array['5m']
- realtime_delay_hours integer not null default 8
- history_days integer not null default 7
- min_alert_score integer not null default 80
- max_push_per_day integer not null default 0
- supports_signal_outcomes boolean not null default false

Seed values:
- free: max_watchlist_symbols=5, allowed_timeframes=['5m'], realtime_delay_hours=8, history_days=7, max_push_per_day=0
- vip: max_watchlist_symbols=50, allowed_timeframes=['5m','15m'], realtime_delay_hours=0, history_days=30, max_push_per_day=300
- svip: max_watchlist_symbols=200, allowed_timeframes=['5m','15m','1h','4h'], realtime_delay_hours=0, history_days=180, max_push_per_day=2000

Verification:
- select code,max_watchlist_symbols,allowed_timeframes,realtime_delay_hours from plans order by code;

### Task 3: 增强 signal_performance 为信号战绩表

Objective: 把历史信号变成可展示的“战绩资产”。

Files:
- Modify: infra/schema.sql

Add columns:
- entry_price numeric(30,12)
- price_15m numeric(30,12)
- price_1h numeric(30,12)
- price_4h numeric(30,12)
- price_24h numeric(30,12)
- return_24h numeric(18,8)
- max_favorable_pct numeric(18,8)
- max_adverse_pct numeric(18,8)
- outcome_status varchar(32) not null default 'pending'
- evaluated_until timestamptz
- updated_at timestamptz not null default now()

Indexes:
- unique index on signal_performance(signal_event_id)
- index on signal_performance(outcome_status, updated_at)

Outcome status values:
- pending: 刚产生，等待评估
- tracking: 已有部分窗口结果
- completed: 24h 结果完成
- failed: 数据拉取失败

### Task 4: 新增 user_push_settings 表

Objective: 将用户推送设置从 watchlist 中拆出来，支持多渠道和商业权限。

Files:
- Modify: infra/schema.sql

Create table user_push_settings:
- id uuid primary key default uuid_generate_v4()
- user_id uuid not null references users(id)
- channel varchar(32) not null default 'feishu'
- enabled boolean not null default false
- target_encrypted text
- target_masked varchar(255)
- min_score integer not null default 80
- cooldown_minutes integer not null default 15
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()
- unique(user_id, channel)

Verification:
- Insert a test row for YanSir admin and query it.

### Task 5: 新增 signal_delivery_cooldowns 表

Objective: 不再只靠内存 lastAlertAtByKey，API 重启后也不会重复推送。

Files:
- Modify: infra/schema.sql

Create table signal_delivery_cooldowns:
- id uuid primary key default uuid_generate_v4()
- user_id uuid not null references users(id)
- channel varchar(32) not null
- symbol varchar(32) not null
- timeframe varchar(16) not null
- direction varchar(16) not null
- signal_type varchar(120) not null
- last_sent_at timestamptz not null
- unique(user_id, channel, symbol, timeframe, direction, signal_type)

---

## 三、后端 API 开发任务

### Task 6: 套餐权益从数据库读取

Objective: users/entitlements.ts 不再只依赖 PLAN_LIMITS 硬编码，而是优先读取 plans/subscriptions。

Files:
- Modify: apps/api/src/modules/users/users.service.ts
- Modify: apps/api/src/modules/users/entitlements.ts
- Test: apps/api/src/modules/users/users.service.spec.ts if test framework exists, otherwise add lightweight integration script.

Rules:
- active subscription 未过期：使用对应 plan 数据库权益。
- 无有效订阅：fallback free。
- 保留硬编码 fallback，防止数据库异常导致登录失败。

Verification:
- GET /api/users/me 或现有用户接口返回 entitlements.allowedTimeframes、maxWatchlistSymbols、historyDays、realtimeDelayHours。

### Task 7: Watchlist 更新接口增加套餐限制

Objective: 用户不能超过套餐自选上限，也不能选择套餐不允许的周期。

Files:
- Modify: apps/api/src/modules/strategy/strategy.service.ts
- Modify: apps/api/src/modules/strategy/strategy.controller.ts

Rules:
- PUT /api/strategy/watchlist 时校验 enabled=true 的 symbol 数量 <= entitlements.maxWatchlistSymbols。
- timeframes 必须是 entitlements.allowedTimeframes 的子集。
- Free 默认只允许 5m。
- 返回明确错误：WATCHLIST_LIMIT_EXCEEDED / TIMEFRAME_NOT_ALLOWED。

Verification:
- Free 用户添加第 6 个币返回 400。
- VIP 用户可以添加 15m，Free 用户不能添加 15m。

### Task 8: Public delayed signals 接口支持历史分页和筛选

Objective: 未登录页面可以长期展示历史信号，不只固定 limit。

Files:
- Modify: apps/api/src/modules/strategy/strategy.service.ts
- Modify: apps/api/src/modules/strategy/strategy.controller.ts

Endpoint:
GET /api/strategy/public-signals?symbol=BTCUSDT&timeframe=15m&direction=long&limit=50&cursor=...

Rules:
- 只返回 emitted_at <= now() - interval '8 hours'。
- 支持 symbol/timeframe/direction/signalType 过滤。
- limit 最大 100。
- 返回 nextCursor。
- join signal_performance，未登录只显示基础战绩字段：return_1h, return_4h, max_favorable_pct。

Verification:
- 未登录 curl 只能拿到 8 小时前数据。
- 最近 8 小时 signal_events 不会出现在 public-signals。

### Task 9: Inbox 接口支持历史分页、当前自选/全部历史切换

Objective: 登录用户既能实时看自选 inbox，也能保留历史展示。

Files:
- Modify: apps/api/src/modules/strategy/strategy.service.ts
- Modify: apps/api/src/modules/strategy/strategy.controller.ts

Endpoint:
GET /api/strategy/inbox?mode=current|all&symbol=...&timeframe=...&limit=80&cursor=...

Rules:
- mode=current: 只展示当前 watchlists enabled=true 且 symbol/timeframe 仍匹配的历史 inbox。
- mode=all: 展示该用户全部历史 inbox，包括已取消自选币的历史。
- join signal_performance，按套餐决定展示完整战绩还是基础战绩。
- order by signal_events.bar_time desc nulls last, user_signal_inbox.created_at desc。

Verification:
- 用户取消某币自选后，mode=current 不显示该币历史，mode=all 仍显示。

### Task 10: 新增 signal outcomes 评估服务

Objective: 对 signal_events 后续价格表现做自动追踪。

Files:
- Create: apps/api/src/modules/strategy/signal-outcome.service.ts
- Modify: apps/api/src/modules/strategy/strategy.module.ts
- Modify: apps/api/src/modules/strategy/strategy.service.ts if needed

Logic:
- 每 5 分钟找 pending/tracking 的 signal_events。
- 根据 signal direction 拉 Futures klines，计算 15m/1h/4h/24h 收益。
- 计算 max_favorable_pct 和 max_adverse_pct。
- upsert signal_performance。
- 超过 bar_time + 24h 标记 completed。

Return calculation:
- long return = (future_price - entry_price) / entry_price * 100
- short return = (entry_price - future_price) / entry_price * 100

Verification:
- 手动插入一条历史 signal_event，运行评估方法后 signal_performance 有 return_15m/1h/4h/24h。

### Task 11: 推送逻辑改为数据库冷却 + user_push_settings

Objective: 推送链路更商业化、更可审计。

Files:
- Modify: apps/api/src/modules/strategy/strategy.service.ts
- Modify: apps/api/src/modules/alerts/alerts.service.ts

Rules:
- 只有 user_push_settings.enabled=true 才推送。
- watchlists.push_enabled=true 才推送。
- entitlements.feishuAlerts=true 才允许飞书。
- signal.score >= max(watchlist.min_score, push_settings.min_score, entitlements.minAlertScore)。
- 查 signal_delivery_cooldowns 判断冷却。
- 成功发送后 upsert cooldown。
- 所有 sent/skipped/failed 都写 alert_deliveries，skip_reason 必须明确。

Skip reasons:
- push_disabled
- watchlist_push_disabled
- below_min_score
- plan_not_allowed
- cooldown
- no_target
- channel_not_supported

Verification:
- 同一用户同一币同一周期同一方向在冷却内只发送一次。
- 未配置 webhook 的用户产生 skipped:no_target。

### Task 12: 管理员信号状态接口

Objective: 支持后续后台看全局运行情况。

Files:
- Modify: apps/api/src/modules/strategy/strategy.controller.ts
- Modify: apps/api/src/modules/strategy/strategy.service.ts

Endpoint:
GET /api/strategy/admin/overview

Return:
- realtime status: connected, socket count, symbols count, lastEventAt, lastSignalAt, lastError
- last 24h signal count
- inbox matched count
- delivery sent/skipped/failed count
- public delayed count
- top symbols by signal count

Access:
- 当前项目如果 auth guard 不完善，先在 service 内检查 currentUser.role === admin。

---

## 四、前端开发任务

### Task 13: 策略追踪页拆分登录/未登录展示

Objective: 未登录用户看到 8 小时延迟历史；登录用户看到自选实时 inbox。

Files:
- Modify: apps/web/src/components/AppShell.tsx

Behavior:
- currentUser.id 为空：调用 /api/strategy/public-signals。
- currentUser.id 存在：调用 /api/strategy/inbox?mode=current。
- 页面标题区显示当前模式：公开延迟 / 我的实时。
- 未登录模式显示 CTA：“登录查看自选实时信号”。
- 登录模式显示 CTA：“管理自选币种 / 配置推送”。

Verification:
- 清 localStorage/token 后打开页面，能看到 8 小时延迟信号。
- 登录后同一页面切换为 inbox 数据。

### Task 14: 历史信号保留和筛选 UI

Objective: 前端展示历史信号数据，支持按时间先后累积、不覆盖。

Files:
- Modify: apps/web/src/components/AppShell.tsx

Filters:
- 时间：今天 / 24小时 / 7天 / 30天 / 全部
- 币种
- 周期：5m/15m/1h/4h
- 方向：long/short
- 类型：趋势/反转/减仓
- 模式：当前自选 / 全部历史（登录用户）

Rules:
- 列表按时间倒序，最新在上。
- 不用 localStorage 作为最终历史源，只做短暂缓存。
- 以 API 返回为准。
- 支持“加载更多”。

Verification:
- 刷新页面后历史不丢。
- 取消自选后，“全部历史”仍能看到旧信号。

### Task 15: 信号卡片增加战绩字段

Objective: 历史信号不只是 long/short，而是可转化的战绩展示。

Files:
- Modify: apps/web/src/components/AppShell.tsx

Card fields:
- 币种 / 周期 / 方向 / 信号类型 / 分数
- 触发价
- K线时间
- 信号原因
- 15m / 1h / 4h / 24h 后表现
- 最大有利波动 MFE
- 最大不利波动 MAE
- 状态：验证中 / 已完成

Permissions:
- 未登录：显示基础战绩，隐藏部分详细指标，提示升级。
- Free：显示有限历史和基础战绩。
- VIP/SVIP：显示完整。

### Task 16: 自选币种管理 UI 接入真实 watchlist

Objective: 当前详情页本地 localStorage 自选要改成服务端 watchlists。

Files:
- Modify: apps/web/src/components/AppShell.tsx

Behavior:
- 登录后加载 GET /api/strategy/watchlist。
- 添加/删除自选调用 PUT /api/strategy/watchlist。
- 支持每个币配置 timeframes、minScore、pushEnabled。
- 超过套餐限制时显示升级提示。
- 未登录点击加入自选，引导登录。

Verification:
- 添加自选后数据库 watchlists 有记录。
- 删除自选后 enabled=false 或 disabled_at 有值，历史 inbox 不删除。

### Task 17: 推送配置 UI

Objective: 让用户自己配置是否推送，前提是套餐允许。

Files:
- Modify: apps/web/src/components/AppShell.tsx
- Add API endpoints if needed in alerts/strategy module

UI:
- 飞书 webhook 输入框
- 推送开关
- 最低推送分数
- 冷却时间
- 测试推送按钮

Rules:
- Free 用户显示锁定态，引导升级。
- VIP/SVIP 可保存。
- webhook 前端只显示 masked。

Verification:
- 保存后 user_push_settings/feishu_bindings 更新。
- 点击测试推送能收到测试消息或返回明确错误。

### Task 18: 套餐购买页文案商业化

Objective: 把“会员等级购买”改成清晰信号订阅套餐。

Files:
- Modify: apps/web/src/components/AppShell.tsx

Plan cards:
- Free: 8小时延迟历史、5个自选、5m、无推送
- VIP: 实时信号、50自选、5m/15m、飞书推送、30天历史
- SVIP: 全周期、200自选、完整战绩、API、180天历史

CTA:
- 当前套餐显示“当前使用中”。
- 不可用功能点击后跳转套餐页。

---

## 五、数据回填和运维任务

### Task 19: 回填历史 signal_performance

Objective: 让前端一上线就有历史战绩可展示。

Files:
- Create: scripts/backfill-signal-performance.ts 或 apps/api/src/scripts/backfill-signal-performance.ts

Logic:
- 找最近 30 天 signal_events。
- 拉 Futures K线补 15m/1h/4h/24h 表现。
- upsert signal_performance。
- 每批 50 条，避免 Binance 限流。

Command:
- npm run ts-node -- scripts/backfill-signal-performance.ts

Verification:
- select count(*) from signal_performance where return_1h is not null;

### Task 20: 回填现有用户 inbox 历史

Objective: 已存在全局信号要按现有 watchlists 回填用户 inbox。

Files:
- Create: scripts/backfill-user-signal-inbox.ts

Rules:
- 对 enabled=true watchlists，匹配历史 signal_events。
- symbol 相同。
- timeframe in watchlist.timeframes。
- score >= watchlist.min_score。
- insert into user_signal_inbox on conflict do nothing。
- matched_rule 记录 watchlist snapshot。

Verification:
- 当前用户 /api/strategy/inbox 返回历史信号。

### Task 21: 日志和监控

Objective: 上线后能快速判断为什么没信号/没推送/没展示。

Files:
- Modify: apps/api/src/modules/strategy/strategy.service.ts

Add structured logs:
- realtime kline received count per minute
- strategy run success/fail count
- signal_events insert count
- inbox match count
- delivery sent/skipped/failed count
- websocket reconnect count

Verification:
- journalctl -u yansir-api -f 能看到关键统计，不刷屏。

---

## 六、测试和验收

### Task 22: 后端构建和核心接口验证

Commands:
- npm run build --workspace apps/api
- npm run build --workspace apps/web
- systemctl restart yansir-api yansir-web yansir-strategy
- curl -s http://127.0.0.1:3101/api/health
- curl -s http://127.0.0.1:3101/api/strategy/realtime/status
- curl -s http://127.0.0.1:3101/api/strategy/public-signals

Expected:
- API/Web build 成功。
- database.connected=true。
- realtime.connected=true。
- public-signals 不包含最近 8 小时信号。

### Task 23: 登录用户验收

Steps:
1. 登录 YanSir 管理员账号。
2. 打开策略追踪。
3. 验证只展示 inbox，而不是全市场全部信号。
4. 添加一个自选币。
5. 等下一根 5m K线有信号或用测试插入信号触发 match。
6. 验证 inbox 追加，不覆盖历史。
7. 取消自选。
8. mode=current 不显示该币旧信号，mode=all 显示。

### Task 24: 推送验收

Steps:
1. 给 VIP/SVIP 用户配置飞书 webhook。
2. 构造一条 score >= minScore 的 signal_event。
3. 触发 match + delivery。
4. 验证 alert_deliveries status=sent。
5. 再触发同类信号，验证冷却内 skipped=cooldown。
6. Free 用户同样信号验证 skipped=plan_not_allowed。

### Task 25: 前端验收

URL:
- http://13.200.158.142/yansir/

Checks:
- 未登录：显示“8小时延迟信号”，有历史数据，有登录/升级 CTA。
- 登录：显示“我的实时信号”，可筛选，可加载更多。
- 历史信号刷新不丢。
- JS/CSS 资源路径仍为 /yansir/assets/... 且返回正确 MIME。
- Ctrl+F5 后无白屏。

---

## 七、实施顺序建议

Phase 1 数据和权限基础：Task 1-5
Phase 2 后端接口和推送链路：Task 6-12
Phase 3 前端商业化展示：Task 13-18
Phase 4 数据回填和监控：Task 19-21
Phase 5 全量验收部署：Task 22-25

每个 Phase 完成后都要：
- npm run test:plans:ci
- npm run build --workspace apps/api
- npm run build --workspace apps/web
- 重启服务
- 验证 /yansir/ 页面和 /api/health
- 记录当前问题，不带问题进入下一阶段

部署前强制门禁：
- 本地/服务器部署前统一执行 npm run predeploy:check。
- 正式部署可以用 npm run deploy:prod，它会先执行 npm run predeploy:check，通过后才重启 yansir-api/yansir-web/yansir-strategy。
- 该命令会先跑 npm run test:plans:ci，再跑环境校验；套餐权限测试不通过时不允许部署。
- test:plans:ci 覆盖 CI 配置自检、后端套餐权限单测、前端套餐权限单测、API/Web build、会员套餐 E2E。
- GitHub Actions 工作流 .github/workflows/plan-permissions-ci.yml 也会执行 npm run test:plans:ci，确保 main 分支变更和手动 workflow_dispatch 都经过同一套套餐权限门禁。

---

## 八、暂不做的事项

- 暂不做自动下单。
- 暂不接真实交易所 API key。
- 暂不承诺收益。
- 暂不做复杂策略参数自定义。
- 支付可以先保留 mock/人工开通，等产品闭环后再接 Stripe/加密支付。

---

## 九、关键验收标准

最终完成后必须满足：

1. 后台持续检测 Binance 全 USDT 币种，K线收盘触发，不恢复 5 分钟自动扫描。
2. 未登录用户只能看到 8 小时以前的全市场历史信号。
3. 登录用户看到自己的自选实时 inbox。
4. 用户取消自选后，未来不再匹配，但历史 inbox 保留。
5. 前端历史信号按时间展示，不覆盖、不丢失。
6. 推送必须满足：用户自选 + push enabled + 套餐允许 + webhook 配置 + 分数达标 + 冷却通过。
7. signal_performance 能展示历史战绩。
8. 套餐权限能限制自选数量、周期、推送和历史天数。
9. 所有 sent/skipped/failed 推送都有 alert_deliveries 记录。
10. 页面通过 http://13.200.158.142/yansir/ 正常访问，不依赖域名。
