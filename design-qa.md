# AIClaw + Radar Design QA

**Source visual truth path**

`D:\yansir\.worktrees\ai-claw-radar-unified\docs\superpowers\specs\assets\ai-claw-radar-unified-layout.png`

**Implementation screenshots**

- Full comparison: `docs/superpowers/specs/assets/ai-claw-radar-unified-qa.png`
- Focused signal-context comparison: `docs/superpowers/specs/assets/ai-claw-context-qa.png`
- Authenticated expanded Radar: `docs/superpowers/specs/assets/radar-auth-expanded-qa.png`

**Viewport and state**

- Browser outer viewport: `390 × 844`; rendered page client width: `375px`.
- AIClaw route: `http://127.0.0.1:4175/yansir/?view=claw`, authenticated demo-admin state backed by the local API on port 3101.
- Radar route: `http://127.0.0.1:4175/yansir/?view=radar`, authenticated market source showing the `已同步实时信号` status strip and expanded BTC 96 evidence.
- A separate signed-out run verified the public AIClaw shell, in-page login gate, disabled protected actions, and API-error/fallback feedback.

**Full-view comparison evidence**

The approved source, authenticated expanded Radar, and authenticated AIClaw captures were inspected together in `docs/superpowers/specs/assets/ai-claw-radar-unified-qa.png`. The Radar panel in that comparison is sourced from `docs/superpowers/specs/assets/radar-auth-expanded-qa.png` and visibly includes the authenticated sync strip, BTC 96 expanded evidence, and all three actions. The implementation preserves the same mobile hierarchy: title/status header, source or action controls, single content column, compact information density, fixed bottom navigation, and Yansir blue active states. `docs/superpowers/specs/assets/ai-claw-context-qa.png` separately verifies the focused Radar-to-AIClaw context state.

**Focused region comparison evidence**

- Header: Radar title/status and AIClaw title/status/help remain readable at mobile width. Dynamic scan copy fits without causing page overflow.
- Controls: Radar source tabs and horizontal category rail remain usable; AIClaw keeps a two-column six-action grid with 44px-or-larger targets.
- Content: Radar rows preserve the timeline structure and inline evidence/actions. AIClaw keeps insight, login/conversation, optional signal context, and safe composer order.
- Signal context: authenticated `AIClaw 复核` carried the selected BTC signal into AIClaw; `清除上下文` removed the context region without disturbing the conversation.
- Bottom navigation: exact labels are `数据 / AIClaw / 雷达 / 告警 / 我的`; active state is blue on both routes.
- Overflow: browser checks reported `scrollWidth=375` and `clientWidth=375` for both `documentElement` and `body`, so there is no horizontal page overflow.

**Findings**

No actionable P0/P1/P2 findings remain.

**Required fidelity surfaces**

- Fonts and typography: heading/body hierarchy and compact label weights are coherent with the approved target; no broken wrapping or truncation was observed.
- Spacing and layout rhythm: mobile gutters, two-column action proportions, 12px primary radii, compact Radar rows, fixed composer, and bottom-nav spacing preserve the target structure.
- Colors and visual tokens: Yansir cobalt is used for active/navigation states, green for monitoring/opportunity, red for risk, and gray for neutral/disabled states.
- Image quality and asset fidelity: no target product imagery is replaced by placeholder imagery; visible UI icons use the existing project icon system. Dynamic coin assets differ because the authenticated capture uses current local runtime data rather than the static reference fixtures.
- Copy and content: app-specific titles, six AIClaw actions, Radar tabs/categories, three signal actions, and bottom-nav labels match the approved terminology. Signed-out explanatory copy is intentional.

**Primary interactions tested**

- Radar source tabs and `看多` category filter.
- Radar row expand/evidence state.
- `AIClaw 复核`, including navigation to `?view=claw` with signal context.
- `加入观察` toast.
- `币种详情`, including navigation to `?view=data&symbol=BANK`.
- Advanced-filter modal.
- Guest AIClaw login gate and disabled protected quick actions/composer.
- Authenticated clicks on all six quick actions updated the composer respectively to `分析当前加密市场概览`, `分析当前加密市场资金流向`, `解读最近的 Yansir 策略信号`, `分析当前热门代币`, `分析当前巨鲸动态`, and `分析当前市场情绪`.
- Authenticated composer send returned a rule-analysis response.
- Radar `趋势突破` with count `0` rendered the empty state.
- Signed-out API-error handling retained the question and surfaced the fallback toast/result.

**Console errors checked**

No browser console errors were observed.

**Comparison history**

1. Initial pass: direct guest navigation to `?view=claw` redirected to account, and the bottom navigation still displayed legacy `ValueClaw` / `信号` labels. These were P1 because they hid the redesigned shell and contradicted approved terminology.
2. Fixes: made the AIClaw shell publicly routable while retaining the component-level login gate and disabled protected actions; changed bottom-nav labels to `AIClaw` / `雷达`; added exact entitlement and routing assertions.
3. Post-fix signed-out pass: recaptured AIClaw and Radar at the same viewport, verified the public login gate, protected disabled controls, error/fallback state, overflow, and console state.
4. Authenticated pass: started the local API, signed in with the documented demo administrator, exercised all six quick actions and composer send, transferred and cleared BTC Radar context, verified the authenticated sync strip, expanded BTC 96 evidence with all three actions, and the zero-count empty state, then captured portable full/focused comparison evidence. No actionable P0/P1/P2 mismatch remained.

**Implementation checklist**

- [x] Keep AIClaw shell visible to signed-out users.
- [x] Gate protected AIClaw actions in the conversation/composer area.
- [x] Use exact `AIClaw` and `雷达` navigation labels.
- [x] Verify signed-out, authenticated, signal-context, empty/error, overflow, console, tests, lint, and production-build states.

**Follow-up polish**

None required for acceptance.

final result: passed

---

# Unified Page Width QA

- Desktop viewport override: `956 x 918` (`clientWidth=941` with classic scrollbar)
- Mobile viewport override: `390 x 844` (`clientWidth=375` with classic scrollbar)
- Routes checked: Data, AIClaw, Radar, Track Record, Account, and K-line Lab

## Measurements

- PASS: standard desktop shells are `430px`; fixed bottom navigation and AIClaw composer are also capped at `430px`.
- PASS: standard mobile shells and fixed bottom navigation use the available `375px` client width; AIClaw composer remains inset at `358px`.
- PASS: `scrollWidth` equals `clientWidth` (`375px`) on the mobile routes checked.
- PASS: Track Record no longer clips its right-side metrics or filter action when a classic scrollbar is present.
- PASS: K-line Lab remains the wide exception (`956px` at the checked desktop viewport, capped at `1180px`).
- PASS: visual checks found no incoherent overlap between page content, fixed composer, and bottom navigation.
- PASS: desktop Login and Register inner layouts stay within the `430px` shell (`428px` auth layout, `380px` form card at the checked viewport).
- PASS: AIClaw composer is `430px` at both `500px` and `767px` viewport overrides, matching the shell and navigation cap.

## Result

final result: passed

---

# Track Record Restoration QA

- Reference: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-bd3c099e-5009-4bec-b39d-d6a8f4821369.png`
- Implementation: `http://127.0.0.1:3200/yansir/?view=track-record`
- Checked viewport: `476 x 918`
- Checked state: live API, no eligible public samples

## Comparison

- PASS: mobile hierarchy matches the approved screen: history title, trust summary, symbol and direction filters, signal ledger state, methodology disclosure, and five-item bottom navigation.
- PASS: fourth navigation item is `战绩` with a target icon and active state.
- PASS: trust summary preserves the approved two-column metric layout while loading and when empty.
- PASS: controls fit without overlap; buttons meet the existing mobile touch target contract.
- PASS: direction selection and methodology disclosure are interactive.
- PASS: no browser console warnings or errors after the API restart.
- ACCEPTED DATA VARIANCE: the reference contains illustrative historical rows and metrics. The live database currently has zero signals satisfying the public 8-hour delay and 7-day history window, so the implementation shows the truthful empty state rather than fabricated values.

## Result

final result: passed

---

# Design QA: AIClaw and Track Record Restoration

## Evidence

- AIClaw source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-ae058840-7726-43ca-ba53-6ff00620ea7b.png`
- AIClaw implementation: `D:\yansir\docs\superpowers\specs\assets\ai-claw-restored-shell-qa.png`
- AIClaw combined comparison: `D:\yansir\docs\superpowers\specs\assets\ai-claw-reference-comparison.png`
- Track Record source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-c8c29116-04f1-426b-8535-d93a66d330f8.png`
- Track Record implementation: `D:\yansir\docs\superpowers\specs\assets\track-record-restored-shell-qa.png`
- Track Record combined comparison: `D:\yansir\docs\superpowers\specs\assets\track-record-reference-comparison.png`
- Browser viewport: 1280px wide, device pixel ratio 1. The standard application shell was measured at 430 CSS px.
- Source pixels: AIClaw 579 x 877; Track Record 853 x 1844.
- Implementation pixels: AIClaw 430 x 1118; Track Record 430 x 999.
- Density normalization: each reference was downsampled to 430px wide before the combined comparison.
- State: AIClaw signed-in live workspace; Track Record public empty state with a successful API response and zero eligible delayed samples.

## Findings

- No actionable P0, P1, or P2 layout issues remain.
- Fonts and typography: headings and trust metrics now use the 430px-shell sizes from the reference instead of desktop viewport-relative sizes. No heading or metric wraps unexpectedly.
- Spacing and layout rhythm: both pages preserve 16px horizontal gutters. The AIClaw composer has 16px left and right insets. Track Record restores 28px top padding and its controls fit within 396px of content width.
- Colors and visual tokens: the existing navy, blue, green, white, and pale-gray product tokens remain consistent with the source direction.
- Image and icon fidelity: the existing product icon system is preserved; no placeholder or generated replacement assets were introduced.
- Copy and content: live AIClaw onboarding content is intentionally denser than the reference mock. Track Record shows a truthful empty state because the API returned zero eligible public samples; it does not fabricate the populated rows shown in the reference.

## Focused Comparison

- AIClaw composer: measured shell width 430px, composer width 398px, left inset 16px, right inset 16px.
- Track Record hero and controls: title renders on one line at 42px; controls measure 396px wide with a 396px scroll width.
- Track Record trust summary: grid measures 396px wide with a 394px scroll width; the 54px primary metric and 26px secondary metric no longer wrap.

## Comparison History

1. Initial capture found a P1 Track Record overflow: controls required 500px inside a 430px shell, while a global rule removed the page's top padding. AIClaw's composer also touched both shell edges.
2. After the first fix, all horizontal overflow was removed and AIClaw regained 16px gutters. A second capture found viewport-relative Track Record typography still wrapping the title and empty-state metrics.
3. The second fix scoped mobile typography and trust-grid sizing to the 430px shell. The final capture shows no clipping, overlap, or unexpected wrapping.

## Interaction and Runtime Checks

- Track Record direction filter: clicked `看多`; `aria-pressed` changed to `true`.
- AIClaw help control: clicked successfully.
- Browser console: no errors or warnings during the final interaction pass.
- Automated checks: page-width contract, AIClaw layout, Track Record restoration, touch targets, and the production web build passed.

## Follow-up Polish

- P3: AIClaw's live onboarding card is taller than the source mock, and Track Record's empty state naturally contains less information than the populated reference. These are content-state differences, not layout defects.

final result: passed
