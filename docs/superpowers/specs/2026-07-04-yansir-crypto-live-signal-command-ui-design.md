# Yansir Crypto Live Signal Command UI Design

Date: 2026-07-04

## Summary

Live Signal Command is the approved UI direction for Yansir Crypto's realtime radar. It combines three earlier directions:

- SignalOS Continuity: keep the current Yansir mobile style and familiar page structure.
- Trader Tape: make the realtime signal queue the main first-screen object.
- Evidence Console: move evidence, risk explanation, watch state, push state, and ValueClaw explanation into the signal detail flow.

The product must continue to feel like a strategy signal system with AI explanation. It must not feel like an AI chatbot that invents trading calls.

## Current Product Decision

After browser review, the radar row action named detail was changed to open the existing coin detail page, not a separate signal evidence page. The radar row itself remains the quick signal summary and inline evidence surface; the existing coin detail page carries the deeper coin context, chart, strategy history, and scan records.

This keeps the app closer to the current Yansir information architecture:

- Radar = realtime strategy signal queue and quick evidence.
- Coin detail = full symbol context and historical scan review.
- ValueClaw = explanation and review only.

The previous standalone `SignalEvidenceDetail` concept is deferred unless a future dedicated signal-event page is needed.

## Non-Negotiable Rule

Existing strategy signals remain the source of truth.

The UI must always present strategy facts before explanation:

- symbol
- timeframe
- direction or risk posture
- trigger price
- trigger time
- strategy name
- signal type
- score
- risk level

ValueClaw and AI explanations can summarize evidence, explain risk, build a checklist, and help compare historical outcomes. They cannot visually appear as an independent signal source, and they cannot override direction, score, timeframe, price, trigger time, or signal type.

## Visual System

Use the existing Yansir mobile visual language:

- light blue-gray page background
- white functional panels
- blue primary actions
- green for opportunity or long-positive state
- red for risk, crowding, or warning state
- rounded but restrained panels
- fixed bottom navigation
- center AI/ValueClaw floating entry

The UI should be denser and more operational than a marketing page. It should feel calm, fast, and scan-friendly for repeated trading checks.

## Main Screen: Realtime Radar

Radar is the default home screen.

The first screen should contain:

1. Top bar
   - Yansir brand
   - active mode pill: `Radar Live`
   - search entry

2. Page title
   - `Realtime Radar`
   - one-line subtitle explaining that the page is a strategy signal console for short-term crypto opportunities

3. Strategy listening status
   - status: online, degraded, or error
   - monitored coin count
   - next scan countdown or realtime listener state
   - top active score

4. Signal filter tabs
   - `Now`
   - `Long`
   - `Risk`
   - `Watch`

5. Realtime signal queue
   - newest signals first
   - each row shows rank, symbol, timeframe, signal type, trigger price, fire time, and score
   - opportunity signals use green emphasis
   - risk/crowded warnings use red emphasis

6. Selected signal facts panel
   - shows strategy facts for the currently selected row
   - shows evidence summary
   - states AI role as explain-only

7. Bottom actions
   - `Watch`
   - `Coin detail`

The homepage should not show long AI prose. It can show a short "AI role" line or an `Ask Claw` entry, but the signal queue must dominate.

## Detail Screen: Coin Detail

The row detail action opens the existing coin detail page for the selected symbol. It is the place for coin-level context, strategy history, scan records, and next action.

The first screen should contain:

1. Header
   - symbol and pair
   - timeframe
   - signal type or risk state
   - trigger price
   - trigger time
   - score

2. Price and context chart
   - lightweight K-line or trend area
   - timeframe selector can remain compact
   - do not let the chart hide strategy facts

3. Strategy evidence panel
   - strategy fact: exact signal emitted by the strategy engine, when available for that symbol
   - market evidence: OI, volume, funding, price move, or other known data
   - risk interpretation: what the signal means and what it does not mean
   - ValueClaw role: explanation only

4. Tracking panel
   - watch state
   - push state
   - cooldown
   - threshold
   - performance tracking entry

5. Bottom actions
   - `Ask Claw`
   - `Track signal`

Risk warnings must be explicit. For example, `long_crowded_risk` is not a short signal; it is a reduce-leverage or caution warning unless the strategy engine emits a short signal separately.

## Signal History

Signal history should stay in the Signal tab, not the Radar first screen.

It should show:

- unread and read signal events
- watchlist matches
- push delivery status
- signal performance state
- entitlement-limited history depth

This keeps Radar fast while preserving accountability and review.

## ValueClaw Entry

ValueClaw appears in three places:

- center floating AI entry, consistent with existing Yansir
- `Ask Claw` action in signal detail
- optional compact explanation entry on selected signal facts

ValueClaw responses must cite the signal event and available market evidence. If a user asks for a trade direction without a strategy event, ValueClaw should answer with context and say that no strategy signal has fired.

## Data And Watchlist Relationship

Data remains the market discovery surface. Radar remains the strategy signal surface.

Data may show market anomalies before a strategy signal fires, but those rows must be labeled as market anomalies, not strategy signals. Watchlist filters in Radar show strategy events for watched symbols first.

## Information Hierarchy

Priority order on Radar:

1. strategy signal freshness
2. symbol and timeframe
3. signal type
4. score and risk level
5. trigger price and time
6. evidence summary
7. watch/push/detail actions
8. AI explanation entry

Priority order on Detail:

1. strategy facts
2. trigger price and score
3. market evidence
4. risk interpretation
5. watch/push/tracking controls
6. ValueClaw explanation

## Interaction Model

Radar interactions:

- tapping a signal row selects it and updates the selected facts panel
- `Coin detail` opens the existing symbol detail page for the selected coin
- `Watch` toggles tracking for the selected symbol/timeframe
- tabs filter the queue without changing the underlying signal facts

Detail interactions:

- `Ask Claw` opens a signal-bound explanation prompt
- `Track signal` enables watch and performance tracking
- push settings can be edited from the tracking panel or Signal tab

All interactions must preserve the distinction between signal facts and explanations.

## Implementation Notes

The existing `apps/web/src/components/AppShell.tsx` is large and should not absorb all new UI logic indefinitely. When implementing this design, split the first pass into focused components:

- `RadarLiveHeader`
- `StrategyStatusPanel`
- `RealtimeSignalQueue`
- `SelectedSignalFacts`
- `SignalTrackingPanel`
- `ValueClawSignalEntry`

These components should consume API-shaped data rather than invent local signal facts.

## Acceptance Criteria

- Radar first screen makes realtime strategy signals more prominent than AI content.
- Every signal row shows symbol, timeframe, signal type, trigger price/time, and score.
- AI/ValueClaw entry is visible but clearly secondary.
- Coin detail screen preserves the selected symbol context and does not change signal facts.
- Risk signals are visually distinct from opportunity signals.
- Watch and push states are visible in the signal detail flow.
- UI remains consistent with current Yansir mobile screenshots and bottom navigation.
- No implementation changes are made to existing strategy signal rules.
