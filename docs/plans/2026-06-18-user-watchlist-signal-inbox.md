# 用户自选信号收件箱开发计划

目标：把策略追踪改成“后台全局检测所有支持币种，用户只看到/接收自己自选币种和周期命中的 Pine V6 信号”。

架构：实时行情监听仍只跑一套，按系统支持币种和周期生成全局 signal_events；信号入库后按 user_watchlists 匹配用户，写入 user_signal_inbox；推送根据 inbox 命中、用户推送配置、套餐、分数、冷却判断执行并记录 alert_deliveries。前端策略追踪只读取当前用户 inbox，不直接读全局池。

实施步骤：
1. 数据库
   - 扩展 watchlists：enabled、timeframes、min_score、signal_scope、push_enabled、disabled_at、updated_at。
   - 扩展 signal_events：补充 signal_type、title、reason、exchange、engine、bar_time、detected_at 字段，保留 dedupe_key 去重。
   - 新增 user_signal_inbox：user_id、signal_event_id、symbol、timeframe、side、score、status、matched_rule、created_at、read_at，唯一 user_id + signal_event_id。
   - 扩展 alert_deliveries：补充 signal_event_id、timeframe、signal_type、skip_reason、sent_at，并加去重索引。

2. 后端 API
   - 新增 GET /api/strategy/watchlist：返回当前用户策略自选。
   - 新增 PUT /api/strategy/watchlist：保存当前用户自选币种、周期、阈值和推送开关，取消自选用 enabled=false 保留历史。
   - 新增 GET /api/strategy/inbox：返回当前用户策略信号收件箱。
   - 保留 /scan/history 兼容，但策略追踪前端切换到 /inbox。

3. 实时信号流程
   - realtime/start 默认监听系统全局币种，而不是当前用户本地自选。
   - K线收盘后 runStrategy，写入 signal_events。
   - 对每条新信号查询 enabled=true 的 user_watchlists，根据 symbol/timeframe/signal_scope/min_score 匹配。
   - 匹配后写 user_signal_inbox。
   - 对 push_enabled 且用户飞书开启/套餐允许/冷却通过的 inbox 触发飞书，写 alert_deliveries；不满足的写 skipped 记录。

4. 前端策略追踪
   - 登录后读取 /api/strategy/watchlist 作为策略自选来源。
   - 策略追踪列表读取 /api/strategy/inbox，按时间追加显示，不覆盖。
   - 提供简化自选设置：币种输入、周期选择、最低分、是否推送。
   - 取消自选只影响未来信号，历史记录在“策略追踪历史”仍可查。

5. 验证
   - 执行 npm run db:schema 或迁移脚本。
   - API/Web build 通过。
   - 重启 yansir-api/yansir-web。
   - 验证 schedule 关闭、realtime 正常、watchlist/inbox API 正常。
   - 浏览器打开 /yansir/，确认策略追踪不显示全局无关币，只显示当前用户 inbox。
