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
