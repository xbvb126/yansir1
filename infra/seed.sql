insert into plans (
  code,
  name,
  monthly_price_cents,
  daily_signal_quota,
  supports_feishu,
  supports_api,
  supports_team,
  supports_backtest,
  max_watchlist_symbols,
  allowed_timeframes,
  realtime_delay_hours,
  history_days,
  min_alert_score,
  max_push_per_day,
  supports_signal_outcomes
)
values
  ('free', 'Free', 0, 10, false, false, false, false, 5, array['5m'], 8, 7, 80, 0, false),
  ('vip', 'VIP', 19900, 300, true, false, false, false, 50, array['5m', '15m'], 0, 30, 65, 300, true),
  ('svip', 'SVIP', 69900, 2000, true, true, true, true, 200, array['5m', '15m', '1h', '4h'], 0, 180, 65, 2000, true)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  daily_signal_quota = excluded.daily_signal_quota,
  supports_feishu = excluded.supports_feishu,
  supports_api = excluded.supports_api,
  supports_team = excluded.supports_team,
  supports_backtest = excluded.supports_backtest,
  max_watchlist_symbols = excluded.max_watchlist_symbols,
  allowed_timeframes = excluded.allowed_timeframes,
  realtime_delay_hours = excluded.realtime_delay_hours,
  history_days = excluded.history_days,
  min_alert_score = excluded.min_alert_score,
  max_push_per_day = excluded.max_push_per_day,
  supports_signal_outcomes = excluded.supports_signal_outcomes;

insert into users (phone, name, role, status)
values
  ('13800008821', 'YanSir', 'admin', 'active'),
  ('18600002450', '合约研究员', 'member', 'active'),
  ('17700000198', '试用用户', 'member', 'trial')
on conflict (phone) do update set
  name = excluded.name,
  role = excluded.role,
  status = excluded.status;

with account_plans as (
  select *
  from (values
    ('13800008821', 'svip', '2026-07-07'::timestamptz),
    ('18600002450', 'vip', '2026-06-28'::timestamptz),
    ('17700000198', 'free', '2026-06-10'::timestamptz)
  ) as data(phone, plan_code, expires_at)
),
subscriptions_to_insert as (
  select u.id as user_id, p.id as plan_id, ap.expires_at
  from account_plans ap
  join users u on u.phone = ap.phone
  join plans p on p.code = ap.plan_code
)
insert into subscriptions (user_id, plan_id, status, starts_at, expires_at, renews_at)
select user_id, plan_id, 'active', now() - interval '7 days', expires_at, expires_at
from subscriptions_to_insert source
where not exists (
  select 1 from subscriptions target
  where target.user_id = source.user_id and target.status = 'active'
);

with quota_source as (
  select *
  from (values
    ('13800008821', 384, 2000),
    ('18600002450', 146, 300),
    ('17700000198', 8, 10)
  ) as data(phone, used_count, quota_limit)
),
quota_rows as (
  select u.id as user_id, qs.used_count, qs.quota_limit
  from quota_source qs
  join users u on u.phone = qs.phone
)
insert into usage_quotas (user_id, quota_key, used_count, quota_limit, period_start, period_end)
select
  user_id,
  'daily_signals',
  used_count,
  quota_limit,
  date_trunc('day', now()),
  date_trunc('day', now()) + interval '1 day'
from quota_rows source
on conflict (user_id, quota_key, period_start) do update set
  used_count = excluded.used_count,
  quota_limit = excluded.quota_limit,
  period_end = excluded.period_end;

insert into feishu_bindings (user_id, name, webhook_url, status)
select id, '主告警群', 'https://open.feishu.cn/open-apis/bot/v2/hook/dev-placeholder', 'active'
from users
where phone in ('13800008821', '18600002450')
and not exists (
  select 1 from feishu_bindings fb
  where fb.user_id = users.id and fb.name = '主告警群'
);


insert into user_push_settings (user_id, channel, enabled, target_encrypted, target_masked, min_score, cooldown_minutes)
select id, 'feishu', role = 'admin', null, '已绑定飞书机器人', 65, 15
from users
where phone in ('13800008821', '18600002450', '17700000198')
on conflict (user_id, channel) do update set
  min_score = excluded.min_score,
  cooldown_minutes = excluded.cooldown_minutes,
  updated_at = now();

insert into alert_rules (user_id, name, symbols, timeframe, min_score, directions, cooldown_minutes, interval_seconds, status)
select
  id,
  'default',
  array['BTCUSDT', 'ETHUSDT', 'XRPUSDT'],
  '5m',
  65,
  array['long', 'short'],
  15,
  300,
  'active'
from users
where phone = '13800008821'
on conflict (user_id, name) do update set
  symbols = excluded.symbols,
  timeframe = excluded.timeframe,
  min_score = excluded.min_score,
  directions = excluded.directions,
  cooldown_minutes = excluded.cooldown_minutes,
  interval_seconds = excluded.interval_seconds,
  status = excluded.status,
  updated_at = now();

with signal_definitions as (
  select *
  from (values
    ('UB', 'futures', 'long', '首次FOMO', '交易活跃，首次符合 FOMO 特征', '合约交易量激增，OI 同步放大，可能是利多信号，但需要注意回撤风险。', 91, 'strategy'),
    ('XRP', 'futures', 'flat', '观察', '价格横盘，量能观察中', '价格波动较低，OI 未出现明显扩张，暂未形成强信号。', 43, 'strategy'),
    ('BTC', 'futures', 'short', '风险', '利空趋势延续中', '资金费率偏高，价格突破失败，短线存在多头拥挤风险。', 72, 'strategy'),
    ('ETH', 'futures', 'long', '趋势', '资金活跃，趋势信号增强', 'ADX 上行且 ATR 放大，多周期趋势开始同步。', 78, 'strategy')
  ) as data(symbol, market, direction, signal_type, title, reason, score, source)
)
insert into signals (symbol, market, direction, signal_type, title, reason, score, source)
select symbol, market, direction, signal_type, title, reason, score, source
from signal_definitions source
where not exists (
  select 1 from signals target
  where target.symbol = source.symbol
    and target.market = source.market
    and target.direction = source.direction
    and target.signal_type = source.signal_type
    and target.source = source.source
);

with signal_source as (
  select *
  from (values
    ('UB', 'long', 0.1543::numeric, 91, '28.78%', '+34.2%', '0.018%', 'sig_seed_ub_001', interval '5 minutes'),
    ('XRP', 'flat', 1.36::numeric, 43, '0.01%', '+2.1%', '0.006%', 'sig_seed_xrp_001', interval '10 minutes'),
    ('BTC', 'short', 76984.71::numeric, 72, '1.20%', '+12.8%', '0.041%', 'sig_seed_btc_001', interval '15 minutes'),
    ('ETH', 'long', 3606.80::numeric, 78, '3.86%', '+18.6%', '0.014%', 'sig_seed_eth_001', interval '20 minutes')
  ) as data(symbol, direction, price, score, return_15m, oi_change, funding, dedupe_key, age)
),
event_rows as (
  select
    s.id as signal_id,
    ss.symbol,
    ss.direction,
    ss.price,
    ss.score,
    ss.dedupe_key,
    now() - ss.age as emitted_at,
    jsonb_build_object('oiChange', ss.oi_change, 'funding', ss.funding) as payload
  from signal_source ss
  join signals s on s.symbol = ss.symbol and s.direction = ss.direction
)
insert into signal_events (signal_id, symbol, timeframe, direction, price, score, payload, dedupe_key, emitted_at)
select signal_id, symbol, '5m', direction, price, score, payload, dedupe_key, emitted_at
from event_rows
on conflict (dedupe_key) do update set
  price = excluded.price,
  score = excluded.score,
  payload = excluded.payload,
  emitted_at = excluded.emitted_at;

with performance_source as (
  select *
  from (values
    ('sig_seed_ub_001', 0.2878::numeric),
    ('sig_seed_xrp_001', 0.0001::numeric),
    ('sig_seed_btc_001', 0.0120::numeric),
    ('sig_seed_eth_001', 0.0386::numeric)
  ) as data(dedupe_key, return_15m)
),
performance_rows as (
  select se.id as signal_event_id, ps.return_15m
  from performance_source ps
  join signal_events se on se.dedupe_key = ps.dedupe_key
)
insert into signal_performance (signal_event_id, return_5m, return_15m, return_1h, return_4h)
select signal_event_id, return_15m / 2, return_15m, null, null
from performance_rows source
where not exists (
  select 1 from signal_performance target
  where target.signal_event_id = source.signal_event_id
);
