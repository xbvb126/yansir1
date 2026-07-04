# Yansir Crypto Live Signal Product Audit

Date: 2026-07-04

## Audit Scope

Flow reviewed from current local browser evidence:

1. Realtime radar empty state
2. Data market overview
3. Coin detail page for `UB`
4. ValueClaw route
5. Alert center route
6. Desktop-width radar empty state
7. Incorrect direct route aliases for `valueclaw` and `alerts`

Screenshots are saved in this folder:

- `01-radar-default.png`
- `02-radar-expanded.png`
- `03-symbol-detail-from-radar.png`
- `04-data-page.png`
- `05-valueclaw-page.png`
- `06-alerts-page.png`
- `07-symbol-detail-direct.png`
- `08-valueclaw-correct-route.png`
- `09-alerts-correct-route.png`
- `10-radar-desktop-empty.png`
- `11-qa-mobile-radar.png`
- `12-qa-mobile-data.png`
- `13-qa-mobile-symbol-ub.png`
- `14-qa-mobile-claw.png`
- `15-qa-mobile-alerts.png`
- `16-qa-mobile-valueclaw-alias.png`
- `17-qa-mobile-alerts-alias.png`
- `18-qa-desktop-radar.png`
- `19-qa-mobile-alert-source-chips.png`

## Product Goal

Make Yansir Crypto feel like a strategy-signal product first: realtime strategy signals are the core decision object; ValueClaw and AI explain, review, and package context without replacing the signal engine.

## Strengths

- The visual language is coherent across the main screens: light background, strong blue actions, rounded white panels, and bottom navigation all feel like one product.
- Data page and coin detail page already look closer to product quality than prototype quality.
- Coin detail page has the right raw material: score, price, 24H change, volume, current scan tags, strategy performance block, and scan records.
- ValueClaw is visually separated as an assistant surface rather than a trading table.
- Alert center has useful operational concepts: push channels, daily usage, push performance, and alert queue.

## UX Risks

### P0: Radar first screen does not yet make strategy signals feel like the product core

Evidence: `01-radar-default.png`, `10-radar-desktop-empty.png`

The radar route currently starts with tracking tabs and filters: `AI追踪 / 策略追踪 / 我的追踪`, inbox/history filter, symbol/timeframe/direction/score chips. The actual `实时雷达` block appears below that. In an empty state, the first impression is "tracking filter page", not "live strategy signal command center".

Impact: this weakens the user's stated priority that strategy signals are the most important thing.

Recommendation:

- Put `实时雷达` and strategy status first on the radar screen.
- Move tracking filters below the radar, or collapse them into a secondary filter drawer.
- In empty state, show last scan time, data source, active filters, and whether the strategy service is live/paused/degraded.

### P0: Empty radar state is under-explained

Evidence: `01-radar-default.png`

The empty copy says "等待策略信号 / 策略引擎发出信号后，雷达会自动点亮", but does not tell the user whether:

- the strategy engine is running,
- data is delayed,
- filters are hiding signals,
- no coins currently satisfy strategy rules,
- or the service is paused.

The status chip says `暂停`, which can read like a system problem, but there is no recovery action.

Recommendation:

- Separate `无信号` from `暂停`.
- Add a status line such as `策略引擎正常 · 最近扫描 14:30 · 当前筛选隐藏 0 条`.
- Add a clear action: `查看最近扫描记录`, `放宽筛选`, or `刷新`.

### P0: ValueClaw action from signal flow is not a complete navigation flow

Evidence: code inspection around `handleOpenValueClaw`, screenshot `08-valueclaw-correct-route.png`

The radar inline action calls `handleOpenValueClaw(signal.id)`, which prepares context via toast, but does not open ValueClaw with the selected signal in view. The standalone ValueClaw page defaults to generic BTC-style prompts.

Impact: the promised flow "signal -> explain in ValueClaw" is not yet real enough for users.

Recommendation:

- When opened from a signal, navigate to `view=claw` with selected signal context.
- Show a pinned context card: symbol, direction, score, trigger, risk, generated time.
- Make the assistant copy say it is explaining the strategy signal, not creating a new call.

### P1: Coin detail page needs stronger radar handoff context

Evidence: `07-symbol-detail-direct.png`

The coin detail page is visually strong, but after coming from radar it should explicitly preserve the signal context. Current direct detail page shows `UB 详情`, score, scan text, strategy performance, and scan records, but it does not say "来自实时雷达" or anchor the user to the exact signal event.

Recommendation:

- Add a compact "来自实时雷达" block near the top when opened from a radar signal.
- Include direction, score, trigger reason, signal time, and source strategy.
- Add quick actions: `返回雷达`, `打开 ValueClaw 复核`, `加入/管理观察`.

### P1: Route naming and deep links are inconsistent

Evidence: `05-valueclaw-page.png`, `06-alerts-page.png`, `08-valueclaw-correct-route.png`, `09-alerts-correct-route.png`

Correct routes are `view=claw` and `view=signal`, but intuitive aliases `view=valueclaw` and `view=alerts` fall back to the data page while the URL still shows the unsupported view. This creates broken share/deep-link behavior and confusing QA evidence.

Recommendation:

- Support aliases: `valueclaw -> claw`, `alerts -> signal`.
- Or redirect unsupported views to a real not-found/unsupported state instead of silently rendering data.

### P1: Naming is doing too many jobs

Evidence: `01-radar-default.png`, `09-alerts-correct-route.png`

The bottom nav uses `信号` for the radar page, while the code route `signal` is the alert center. The radar page itself also shows `AI追踪 / 策略追踪 / 我的追踪`.

Recommendation:

- Product labels should settle into one model:
  - Bottom nav `信号` = realtime strategy radar.
  - Bottom nav `告警` = alert center.
  - Top radar copy should say `实时雷达` / `策略信号`, not lead with `AI追踪`.
- Keep AI language secondary.

### P1: Alert center is useful but not visibly tied back to strategy source

Evidence: `09-alerts-correct-route.png`

The alert center has good operational widgets, but alert rows need more source clarity: which strategy generated the alert, whether it came from realtime radar, and whether it was pushed automatically or manually.

Recommendation:

- Add source chips: `实时雷达`, `策略引擎`, `手动摘要`.
- Add alert status labels: `待推送`, `已推送`, `失败`, `已处理`.
- Make high-risk/机会 categories map clearly to strategy direction and risk.

### P2: Desktop view is a scaled mobile shell

Evidence: `10-radar-desktop-empty.png`

At `1280x900`, the app remains a centered mobile viewport with large side whitespace. If the product is intentionally mobile-first, this is acceptable for beta; if desktop traders are a target, the desktop layout needs a wider command-console version.

Recommendation:

- For launch, explicitly decide "mobile-first beta" or build desktop layout.
- If desktop matters, use a two-column radar layout: queue left, selected signal/context right.

## Accessibility Risks

- Several small chips and secondary labels may be low contrast in screenshots, especially pale blue text on light backgrounds.
- Many controls are compact; target size should be checked on mobile for 44px comfortable touch targets.
- The empty radar status changes (`暂停`, counts, filters) should be announced semantically, not only visually.
- Bottom navigation icons need verified accessible names; screenshot alone cannot prove screen-reader labels.
- ValueClaw text area and quick prompts need keyboard/focus testing.

## Evidence Limits

- This audit used screenshots and read-only DOM/code inspection. It did not prove full WCAG compliance.
- Current realtime radar had zero live signals, so the expanded signal state could not be captured from current runtime data.
- Browser console showed no captured errors during this audit run.
- Backend strategy correctness was intentionally not audited.

## Post-Optimization QA Record

Date: 2026-07-04

Build under test: `feature/yansir-crypto-live-signal-command` after Tasks 1-7.

### Mobile Route Matrix: 430x900

| Route | Result | Evidence | Notes |
| --- | --- | --- | --- |
| `view=radar` | Pass | `11-qa-mobile-radar.png` | Rendered `app-shell view-radar`; `实时雷达` is first; empty state states `Yansir 策略引擎`; current runtime had `0` live rows. |
| `view=data` | Pass | `12-qa-mobile-data.png` | Rendered `app-shell view-data`; market overview loaded. |
| `view=data&symbol=UB` | Pass | `13-qa-mobile-symbol-ub.png` | Rendered `app-shell view-symbol`; direct entry did not show radar handoff context, as expected. |
| `view=claw` | Pass | `14-qa-mobile-claw.png` | Rendered `app-shell view-claw`; direct entry did not show stale signal context. |
| `view=signal` | Pass | `15-qa-mobile-alerts.png`, `19-qa-mobile-alert-source-chips.png` | Rendered `app-shell view-signal`; alert queue rows show `实时雷达`, `Yansir 策略引擎`, and push status chips. |
| `view=valueclaw` | Pass | `16-qa-mobile-valueclaw-alias.png` | Alias rendered `app-shell view-claw`; no silent fallback to data page. |
| `view=alerts` | Pass | `17-qa-mobile-alerts-alias.png` | Alias rendered `app-shell view-signal`; no silent fallback to data page. |

### Desktop Route Check: 1280x900

| Route | Result | Evidence | Notes |
| --- | --- | --- | --- |
| `view=radar` | Pass with product caveat | `18-qa-desktop-radar.png` | Mobile-first shell remains centered on desktop. Acceptable for a mobile-first beta; a desktop trader console should be a separate follow-up plan. |

### Accessibility And Interaction Notes

- Browser console errors from the app were empty during the QA pass.
- Bottom navigation touch targets measured about `86x89`, which is comfortable for mobile.
- Radar top filters measured about `92x39`, empty-state actions about `175x23`, and tracking tabs about `88x26` to `112x34`; these are below a comfortable 44px touch target and should be enlarged before public beta.
- Keyboard focus could be placed on the radar filter button, but automated Tab traversal did not advance focus in the browser automation session. Manual keyboard testing is still required before launch.
- Current runtime had no live radar rows, so the visual state for expanded live signal detail, radar-to-coin handoff card, and radar-to-ValueClaw context card is covered by source assertions and unit tests, not by live-data screenshots.

## Recommended Launch Plan

### Must Fix Before Launch

1. Make radar first screen signal-first, not tracking-filter-first.
2. Rewrite radar empty/paused/degraded states with clear source, scan time, and action.
3. Complete signal-to-ValueClaw context flow.
4. Add radar handoff context on coin detail.
5. Fix or redirect unsupported route aliases.

### Should Fix Before Public Beta

1. Tighten product naming across `信号`, `实时雷达`, `告警`, and `ValueClaw`.
2. Add source/status chips in alert center.
3. Add keyboard/focus and touch target QA for core controls.
4. Add desktop decision: mobile-only beta or responsive desktop command view.

### Can Wait

1. Richer desktop layout.
2. More advanced ValueClaw conversation memory.
3. Historical performance visualization polish.
4. More detailed alert analytics.
