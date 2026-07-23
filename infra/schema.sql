create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  phone varchar(32) unique,
  email varchar(255) unique,
  password_hash text,
  name varchar(120) not null,
  role varchar(32) not null default 'member',
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default uuid_generate_v4(),
  code varchar(32) not null unique,
  name varchar(80) not null,
  monthly_price_cents integer not null default 0,
  daily_signal_quota integer not null default 10,
  supports_feishu boolean not null default false,
  supports_api boolean not null default false,
  supports_team boolean not null default false,
  supports_backtest boolean not null default false,
  max_watchlist_symbols integer not null default 5,
  allowed_timeframes text[] not null default array['5m'],
  realtime_delay_hours integer not null default 8,
  history_days integer not null default 7,
  min_alert_score integer not null default 80,
  max_push_per_day integer not null default 0,
  supports_signal_outcomes boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  plan_id uuid not null references plans(id),
  status varchar(32) not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  renews_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists billing_orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  plan_id uuid not null references plans(id),
  provider varchar(32) not null default 'mock',
  amount_cents integer not null default 0,
  status varchar(32) not null default 'pending',
  checkout_url text not null default '',
  external_order_id varchar(120),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  closed_at timestamptz
);

create table if not exists usage_quotas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  quota_key varchar(64) not null,
  used_count integer not null default 0,
  quota_limit integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  unique(user_id, quota_key, period_start)
);

create table if not exists team_members (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references users(id),
  member_user_id uuid not null references users(id),
  role varchar(32) not null default 'member',
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  unique(owner_user_id, member_user_id)
);

create table if not exists feishu_bindings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  name varchar(120) not null,
  webhook_url text not null,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_feishu_bindings_user_name on feishu_bindings(user_id, name);

create table if not exists alert_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  name varchar(120) not null default 'default',
  symbols text[] not null default array['BTCUSDT', 'ETHUSDT', 'XRPUSDT'],
  timeframe varchar(16) not null default '5m',
  min_score integer not null default 65,
  directions text[] not null default array['long', 'short'],
  cooldown_minutes integer not null default 15,
  interval_seconds integer not null default 300,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists alert_deliveries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id),
  signal_event_id uuid,
  channel varchar(32) not null default 'feishu',
  symbol varchar(32) not null,
  timeframe varchar(16),
  direction varchar(16) not null,
  signal_type varchar(120),
  score integer not null,
  title varchar(255),
  status varchar(32) not null,
  http_status integer,
  reason text,
  skip_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  last_attempt_at timestamptz
);

create table if not exists watchlists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  symbol varchar(32) not null,
  market varchar(32) not null default 'futures',
  enabled boolean not null default true,
  timeframes text[] not null default array['5m', '15m', '30m', '1h', '4h'],
  min_score integer not null default 65,
  signal_scope varchar(32) not null default 'all',
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique(user_id, symbol, market)
);

create table if not exists signals (
  id uuid primary key default uuid_generate_v4(),
  symbol varchar(32) not null,
  market varchar(32) not null default 'futures',
  direction varchar(16) not null,
  signal_type varchar(80) not null,
  title varchar(255) not null,
  reason text not null,
  score integer not null default 0,
  source varchar(64) not null,
  created_at timestamptz not null default now()
);

create table if not exists signal_events (
  id uuid primary key default uuid_generate_v4(),
  signal_id uuid references signals(id),
  exchange varchar(64) not null default 'BINANCE_FUTURES',
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  direction varchar(16) not null,
  signal_type varchar(120),
  title varchar(255),
  reason text,
  engine varchar(120),
  price numeric(30, 12) not null,
  score integer not null,
  bar_time timestamptz,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key varchar(255) unique,
  strategy_version varchar(120) not null default 'legacy-v0',
  is_formal boolean not null default false,
  emitted_at timestamptz not null default now(),
  detected_at timestamptz not null default now()
);

create table if not exists user_signal_inbox (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  signal_event_id uuid not null references signal_events(id),
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  side varchar(16) not null,
  score integer not null,
  status varchar(32) not null default 'unread',
  matched_rule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id, signal_event_id)
);

create table if not exists signal_performance (
  id uuid primary key default uuid_generate_v4(),
  signal_event_id uuid not null references signal_events(id),
  entry_price numeric(30, 12),
  price_15m numeric(30, 12),
  price_1h numeric(30, 12),
  price_4h numeric(30, 12),
  price_24h numeric(30, 12),
  return_5m numeric(18, 8),
  return_15m numeric(18, 8),
  return_1h numeric(18, 8),
  return_4h numeric(18, 8),
  return_24h numeric(18, 8),
  max_favorable_excursion numeric(18, 8),
  max_adverse_excursion numeric(18, 8),
  max_favorable_pct numeric(18, 8),
  max_adverse_pct numeric(18, 8),
  outcome_status varchar(32) not null default 'pending',
  evaluated_until timestamptz,
  measured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_push_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  channel varchar(32) not null default 'feishu',
  enabled boolean not null default false,
  target_encrypted text,
  target_masked varchar(255),
  min_score integer not null default 80,
  cooldown_minutes integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, channel)
);

create table if not exists signal_delivery_cooldowns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  channel varchar(32) not null,
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  direction varchar(16) not null,
  signal_type varchar(120) not null,
  last_sent_at timestamptz not null,
  unique(user_id, channel, symbol, timeframe, direction, signal_type)
);

create table if not exists market_snapshots (
  id uuid primary key default uuid_generate_v4(),
  symbol varchar(32) not null,
  market varchar(32) not null default 'futures',
  price numeric(30, 12) not null,
  volume_24h numeric(30, 12),
  oi numeric(30, 12),
  funding_rate numeric(18, 10),
  payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table if not exists strategy_runs (
  id uuid primary key default uuid_generate_v4(),
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  strategy_code varchar(80) not null,
  market_state varchar(80) not null,
  metrics jsonb not null default '{}'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists strategy_close_evaluations (
  id uuid primary key default gen_random_uuid(),
  job_key varchar(255) not null unique,
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  bar_time timestamptz not null,
  closed_at timestamptz not null,
  source varchar(32) not null,
  status varchar(32) not null default 'running',
  attempts integer not null default 1,
  signal_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('realtime', 'reconciliation')),
  check (status in ('running', 'succeeded', 'failed'))
);

create index if not exists idx_close_evaluations_status_time
  on strategy_close_evaluations(status, closed_at);

create index if not exists idx_close_evaluations_symbol_time
  on strategy_close_evaluations(symbol, timeframe, bar_time desc);

create table if not exists scheduled_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  task_type varchar(64) not null,
  prompt text not null,
  schedule_rule text not null,
  channel varchar(32) not null default 'feishu',
  status varchar(32) not null default 'active',
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  key_hash text not null unique,
  name varchar(120) not null,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references users(id),
  action varchar(120) not null,
  target_type varchar(80),
  target_id varchar(120),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table watchlists add column if not exists enabled boolean not null default true;
alter table watchlists add column if not exists timeframes text[] not null default array['5m', '15m', '30m', '1h', '4h'];
alter table watchlists alter column timeframes set default array['5m', '15m', '30m', '1h', '4h'];
alter table watchlists add column if not exists min_score integer not null default 65;
alter table watchlists add column if not exists signal_scope varchar(32) not null default 'all';
alter table watchlists add column if not exists push_enabled boolean not null default true;
alter table watchlists add column if not exists updated_at timestamptz not null default now();
alter table watchlists add column if not exists disabled_at timestamptz;

alter table signal_events add column if not exists exchange varchar(64) not null default 'BINANCE_FUTURES';
alter table signal_events add column if not exists signal_type varchar(120);
alter table signal_events add column if not exists title varchar(255);
alter table signal_events add column if not exists reason text;
alter table signal_events add column if not exists engine varchar(120);
alter table signal_events add column if not exists bar_time timestamptz;
alter table signal_events add column if not exists detected_at timestamptz not null default now();
alter table signal_events add column if not exists strategy_version varchar(120) not null default 'legacy-v0';
alter table signal_events add column if not exists is_formal boolean not null default false;

alter table alert_deliveries add column if not exists signal_event_id uuid;
alter table alert_deliveries add column if not exists timeframe varchar(16);
alter table alert_deliveries add column if not exists signal_type varchar(120);
alter table alert_deliveries add column if not exists skip_reason text;
alter table alert_deliveries add column if not exists sent_at timestamptz;
alter table alert_deliveries add column if not exists retry_count integer not null default 0;
alter table alert_deliveries add column if not exists next_retry_at timestamptz;
alter table alert_deliveries add column if not exists last_attempt_at timestamptz;


alter table plans add column if not exists max_watchlist_symbols integer not null default 5;
alter table plans add column if not exists allowed_timeframes text[] not null default array['5m'];
alter table plans add column if not exists realtime_delay_hours integer not null default 8;
alter table plans add column if not exists history_days integer not null default 7;
alter table plans add column if not exists min_alert_score integer not null default 80;
alter table plans add column if not exists max_push_per_day integer not null default 0;
alter table plans add column if not exists supports_signal_outcomes boolean not null default false;

alter table signal_performance add column if not exists entry_price numeric(30, 12);
alter table signal_performance add column if not exists price_15m numeric(30, 12);
alter table signal_performance add column if not exists price_1h numeric(30, 12);
alter table signal_performance add column if not exists price_4h numeric(30, 12);
alter table signal_performance add column if not exists price_24h numeric(30, 12);
alter table signal_performance add column if not exists return_24h numeric(18, 8);
alter table signal_performance add column if not exists max_favorable_pct numeric(18, 8);
alter table signal_performance add column if not exists max_adverse_pct numeric(18, 8);
alter table signal_performance add column if not exists outcome_status varchar(32) not null default 'pending';
alter table signal_performance add column if not exists evaluated_until timestamptz;
alter table signal_performance add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_signal_events_symbol_time on signal_events(symbol, emitted_at desc);
create index if not exists idx_signal_events_symbol_tf_time on signal_events(symbol, timeframe, emitted_at desc);
create index if not exists idx_signal_events_formal_time on signal_events(is_formal, timeframe, emitted_at desc);
create index if not exists idx_user_signal_inbox_user_time on user_signal_inbox(user_id, created_at desc);
create index if not exists idx_market_snapshots_symbol_time on market_snapshots(symbol, captured_at desc);
create index if not exists idx_strategy_runs_symbol_time on strategy_runs(symbol, started_at desc);
create index if not exists idx_alert_deliveries_user_time on alert_deliveries(user_id, created_at desc);
create unique index if not exists idx_alert_deliveries_user_signal_channel on alert_deliveries(user_id, signal_event_id, channel) where signal_event_id is not null;
create index if not exists idx_alert_deliveries_retry
  on alert_deliveries(status, next_retry_at)
  where status in ('failed', 'sending');
create index if not exists idx_billing_orders_user_time on billing_orders(user_id, created_at desc);


create unique index if not exists idx_signal_performance_event on signal_performance(signal_event_id);
create index if not exists idx_signal_performance_status_updated on signal_performance(outcome_status, updated_at);
create index if not exists idx_user_push_settings_user_channel on user_push_settings(user_id, channel);
create index if not exists idx_signal_delivery_cooldowns_user_signal on signal_delivery_cooldowns(user_id, channel, symbol, timeframe, direction, signal_type);
