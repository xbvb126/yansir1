# Event-Driven Signal Production and Subscription Design

**Date:** 2026-07-23

**Status:** Approved for implementation planning

## Objective

Replace the global full-market scan as the primary signal producer with a close-confirmed, event-driven pipeline. The system must calculate one authoritative signal stream for the whole market, persist every formal signal before delivery, derive verifiable performance from that ledger, and monetize access through timeliness, coverage, delivery, history, and analytics rather than different signal quality.

## Product Principles

1. All plans use the same strategy rules and receive the same underlying formal signal records.
2. A formal signal may be produced only from a confirmed, closed candle.
3. Intrabar conditions are provisional and must not enter the formal ledger, performance statistics, or formal delivery path.
4. Signal persistence is required before user matching and delivery.
5. The event-driven path is the primary producer. Scheduled scanning exists only to reconcile missed closed-candle work.
6. A signal must remain reproducible from its market data, strategy version, candle time, and persisted payload.

## Current-State Problem

The existing realtime tracker receives Binance closed-kline events, but it invokes the non-strict strategy path. That path can fetch the newly opened candle and the Python strategy evaluates the final item in the supplied candle list. This creates a risk that a close event for one candle produces a signal from the next, still-forming candle.

The current global scanner uses strict closed-candle data, but it processes hundreds of symbols in large boundary-aligned batches. A 5m plus 15m run can consume almost the entire five-minute interval, and larger boundary combinations can overlap or skip subsequent slots.

The current runtime also demonstrates why persistence must be a hard boundary: when the API runs without PostgreSQL, realtime calculations can produce in-memory signals with `persisted: false`, while the public ledger remains empty and the performance page remains in its calculating state.

## Authoritative Signal Architecture

```text
Binance closed-kline event
  -> bounded close-event queue
  -> authoritative closed-market-data load
  -> strategy evaluation
  -> signal identity and deduplication
  -> transactional signal persistence
  -> performance eligibility
  -> subscription entitlement matching
  -> user inbox reservation
  -> asynchronous delivery
```

### Close-Confirmed Input

Only a Binance event whose kline has `x = true` is eligible for formal processing. The event must carry or derive the exact close boundary. Market-data loading must use that boundary as an exclusive upper limit and remove every candle that closes after it.

For a timeframe duration `D` and close boundary `C`, the expected formal result has:

```text
bar_time = C - D
```

The orchestration layer must reject a strategy response whose timeframe or `bar_time` does not match the expected just-closed candle.

The strategy service may continue to operate on a supplied candle list, but the formal API path must guarantee that the list ends with the confirmed candle. Diagnostic and laboratory views may inspect an open candle, but their output must be explicitly provisional and must never use the formal persistence or delivery path.

### Event Identity

A close-evaluation job is uniquely identified by:

```text
symbol + timeframe + candle open time
```

A formal signal remains uniquely identified by:

```text
symbol
+ timeframe
+ candle open time
+ signal type
+ direction
+ action
```

Duplicate WebSocket messages, reconnect replays, process retries, and reconciliation jobs must converge on the same identities.

### Persistence Boundary

Formal processing uses strict persistence:

1. The strategy result is validated against the expected closed candle.
2. Every emitted signal is inserted or resolved by its deterministic dedupe key.
3. The matching `signal_events` rows are loaded back successfully.
4. Only then may the service match watchlists, create inbox rows, and reserve deliveries.

If PostgreSQL is unavailable or persistence is incomplete, no formal inbox item or push is created. The close-evaluation job remains eligible for reconciliation.

### Performance

The performance updater consumes only formal persisted signal events. It continues to calculate fixed-window returns at 5m, 15m, 1h, 4h, and 24h where market history is available.

Intrabar observations never count toward performance. Reconciliation-created formal signals use the original candle time, so their outcome windows remain comparable with realtime-produced signals.

## Realtime Processing

The service keeps Binance kline subscriptions for all discovered tradable USDT symbols and the supported timeframes:

```text
5m, 15m, 30m, 1h, 4h
```

Each closed event creates one small evaluation job instead of triggering a full-market batch. Events for different symbols may run concurrently. Events for the same symbol and timeframe must remain ordered.

The queue must be bounded and observable. Each task has explicit timeouts for authoritative market-data loading and strategy execution. One failed symbol must not block unrelated jobs.

The service-level target is:

```text
95% of formal signals persisted and matched within 60 seconds of candle close
```

Delivery is asynchronous after persistence and user matching. Slow or failed Feishu delivery cannot hold the strategy worker.

## Reconciliation

The global full-market scanner no longer acts as the primary producer. A reconciliation job runs every 15 minutes and compares expected closed-candle work with persisted processing state.

It processes only missing symbol/timeframe/candle combinations. It does not rerun combinations already marked successful. Reconciliation uses the same strict closed-market-data loader, strategy evaluator, signal dedupe key, persistence path, and user matching path as realtime processing.

If a reconciled signal is completed within five minutes of its original close, it may be delivered with a delayed-delivery marker. Older reconciled signals are persisted and included in performance, history, and user inboxes but are not pushed.

This rule prevents stale notification bursts after an outage while preserving a complete and auditable ledger.

## Delivery Guarantees

Delivery applies only after a user watchlist and plan entitlement match the persisted signal.

The existing unique reservation by:

```text
user + signal event + channel
```

remains the delivery idempotency boundary. A delivery must be reserved before an external request is made.

Delivery outcomes are:

- `sent`: counts toward the daily plan allowance.
- `failed`: does not count and is eligible for controlled retry.
- `skipped`: does not count and records the entitlement, rule, cooldown, target, or lateness reason.
- `sending`: reserves quota and prevents concurrent duplicates until finalized or recovered.

Push retries run independently from signal production. A retry cannot create a second delivery record or bypass the user's current entitlement and delivery settings.

## Subscription Commercialization

The system computes and stores the same whole-market formal signals for every plan. Plans control when and how users consume those signals.

| Capability | Free | VIP | SVIP |
|---|---:|---:|---:|
| Strategy quality | Same formal strategy | Same formal strategy | Same formal strategy |
| Signal access | 8-hour delay | Realtime | Realtime |
| Watchlist symbols | 5 | 50 | 200 |
| Accessible formal timeframes | 5m | 5m, 15m | 5m, 15m, 30m, 1h, 4h |
| History | 7 days | 30 days | 180 days |
| Feishu push | No | Yes | Yes |
| Successful pushes per day | 0 | 300 | 2000 |
| Performance | Public/basic summary | Full per-signal performance | Full performance and deeper analytics |
| API access | No | No | Yes |
| Intrabar preview | No | No | Reserved for a later SVIP add-on |

### Commercial Rules

- Free access provides delayed proof of signal quality and public performance without operational push value.
- VIP sells realtime short-horizon access and selected-symbol delivery.
- SVIP sells full timeframe coverage, broader subscriptions, deeper performance, and API integration.
- Failed, skipped, and system-rejected deliveries do not consume the daily allowance.
- An upgrade grants realtime access immediately but does not push older signals that predate the upgrade.
- A downgrade retains already visible historical records, while future realtime access, timeframe visibility, watchlist capacity, and delivery follow the new plan immediately.
- Plan differences must never alter the strategy result stored for the same formal signal identity.

## Operational State

The strategy status API must expose enough information to distinguish healthy low-signal periods from a broken pipeline:

- realtime connection state and reconnect count;
- latest received closed event;
- current queue depth;
- age of the oldest queued event;
- active worker count;
- latest successful calculation;
- latest successful persistence;
- success, failure, timeout, and reconciliation counts over the last 15 minutes;
- latest reconciliation start and completion;
- missing combinations found and recovered;
- delivery sent, failed, skipped, and retry counts;
- database and authoritative market-data health;
- latency percentiles from candle close to persistence and user matching.

Running the API in mock database mode is a degraded development state. Formal signal production and delivery readiness must report unavailable in that state rather than appearing healthy.

## Error Handling

### Market Data

Formal processing accepts only authoritative Binance data. Fixture data is prohibited. A transport failure or a candle-boundary mismatch fails the job and leaves it available for reconciliation.

### Strategy Service

Strategy requests use a finite timeout. A timeout or invalid response fails only that job. The response must be checked for symbol, timeframe, and exact expected `bar_time`.

### Database

Database unavailability prevents persistence, inbox matching, and delivery. The service records degraded health and relies on reconciliation after recovery.

### Delivery

External delivery uses finite timeouts. A failure is persisted and retried independently. Delivery failure cannot roll back a successfully persisted formal signal.

### Queue Pressure

The queue records its oldest event and depth. It must not silently discard work. When capacity is reached, missing work is represented for reconciliation and health status becomes degraded.

## Test Design

Automated tests must prove:

1. An open candle cannot produce a formal signal.
2. A closed event evaluates the just-closed candle and cannot evaluate the newly opened candle.
3. Duplicate WebSocket events execute the formal job once.
4. A replay after reconnect does not duplicate persistence.
5. A database failure prevents user matching and delivery.
6. Realtime and reconciliation processing of the same close produce one signal record and at most one delivery.
7. Free, VIP, and SVIP see the same underlying strategy content while access time, timeframe, history, and delivery differ.
8. Only successful delivery consumes the daily plan allowance.
9. A delivery timeout does not block later signal jobs.
10. A reconciliation signal older than five minutes is persisted but not pushed.
11. Performance backfill derives 15m, 1h, 4h, and 24h values from formal signals.
12. Mock database mode reports formal signal production and delivery as unavailable.

## Runtime Acceptance

The implementation is accepted only when:

1. PostgreSQL health reports `mode = postgres` and `connected = true`.
2. Live BTC, ETH, and SOL closed events are verified for every supported timeframe.
3. Every persisted result has the exact expected just-closed `bar_time`.
4. Persisted signals create the correct eligible user inbox records and delivery reservations.
5. The performance updater produces results and the track-record page leaves its permanent calculating state when eligible samples exist.
6. Duplicate events, reconnect replay, and temporary database failure do not create duplicate signals or deliveries.
7. The API, web, and strategy automated suites and production builds pass.

## Scope

This design covers formal whole-market signal production, persistence, performance eligibility, entitlement matching, Feishu delivery behavior, reconciliation, and operational visibility.

It does not introduce intrabar alerts, new payment providers, new delivery channels, a distributed message broker, or a redesigned frontend. Intrabar preview remains a separately designed future SVIP add-on.
