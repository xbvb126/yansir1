# AIClaw + Radar Design QA

**Source visual truth path**

`D:\yansir\.worktrees\ai-claw-radar-unified\docs\superpowers\specs\assets\ai-claw-radar-unified-layout.png`

**Implementation screenshots**

- AIClaw: `D:\yansir\.worktrees\ai-claw-radar-unified\claw-390x844.png`
- Radar: `D:\yansir\.worktrees\ai-claw-radar-unified\radar-390x844-final.png`
- Combined source and implementation: `D:\yansir\.worktrees\ai-claw-radar-unified\design-qa-comparison.png`

**Viewport and state**

- Browser outer viewport: `390 × 844`; rendered page client width: `375px`.
- AIClaw route: `http://127.0.0.1:4175/yansir/?view=claw`, signed-out state with the public shell and in-page login gate.
- Radar route: `http://127.0.0.1:4175/yansir/?view=radar`, signed-out/fallback API state with strategy source selected.
- The approved reference shows a signed-in state with real strategy fixtures. The signed-out gate, delayed/fallback rows, and disabled protected AIClaw actions in the implementation are expected conditional differences rather than design drift.

**Full-view comparison evidence**

The approved source and both browser captures were inspected together in `design-qa-comparison.png`. The implementation preserves the same mobile hierarchy: title/status header, source or action controls, single content column, compact information density, fixed bottom navigation, and Yansir blue active states. The public AIClaw shell remains visible while protected actions are gated in place.

**Focused region comparison evidence**

- Header: Radar title/status and AIClaw title/status/help remain readable at mobile width. Dynamic scan copy fits without causing page overflow.
- Controls: Radar source tabs and horizontal category rail remain usable; AIClaw keeps a two-column six-action grid with 44px-or-larger targets.
- Content: Radar rows preserve the timeline structure and inline evidence/actions. AIClaw keeps insight, login/conversation, optional signal context, and safe composer order.
- Bottom navigation: exact labels are `数据 / AIClaw / 雷达 / 告警 / 我的`; active state is blue on both routes.
- Overflow: browser checks reported `scrollWidth=375` and `clientWidth=375` for both `documentElement` and `body`, so there is no horizontal page overflow.

**Findings**

No actionable P0/P1/P2 findings remain.

**Required fidelity surfaces**

- Fonts and typography: heading/body hierarchy and compact label weights are coherent with the approved target; no broken wrapping or truncation was observed.
- Spacing and layout rhythm: mobile gutters, two-column action proportions, 12px primary radii, compact Radar rows, fixed composer, and bottom-nav spacing preserve the target structure.
- Colors and visual tokens: Yansir cobalt is used for active/navigation states, green for monitoring/opportunity, red for risk, and gray for neutral/disabled states.
- Image quality and asset fidelity: no target product imagery is replaced by placeholder imagery; visible UI icons use the existing project icon system. Dynamic coin assets differ because the local capture uses fallback data.
- Copy and content: app-specific titles, six AIClaw actions, Radar tabs/categories, three signal actions, and bottom-nav labels match the approved terminology. Signed-out explanatory copy is intentional.

**Primary interactions tested**

- Radar source tabs and `看多` category filter.
- Radar row expand/evidence state.
- `AIClaw 复核`, including navigation to `?view=claw` with signal context.
- `加入观察` toast.
- `币种详情`, including navigation to `?view=data&symbol=BANK`.
- Advanced-filter modal.
- Guest AIClaw login gate and disabled protected quick actions/composer.

**Console errors checked**

No browser console errors were observed.

**Comparison history**

1. Initial pass: direct guest navigation to `?view=claw` redirected to account, and the bottom navigation still displayed legacy `ValueClaw` / `信号` labels. These were P1 because they hid the redesigned shell and contradicted approved terminology.
2. Fixes: made the AIClaw shell publicly routable while retaining the component-level login gate and disabled protected actions; changed bottom-nav labels to `AIClaw` / `雷达`; added exact entitlement and routing assertions.
3. Post-fix pass: recaptured AIClaw and Radar at the same viewport, combined them with the approved source, exercised core interactions, checked overflow and console state, and found no remaining actionable P0/P1/P2 mismatch.

**Implementation checklist**

- [x] Keep AIClaw shell visible to signed-out users.
- [x] Gate protected AIClaw actions in the conversation/composer area.
- [x] Use exact `AIClaw` and `雷达` navigation labels.
- [x] Verify core interactions, overflow, console state, tests, lint, and production build.

**Follow-up polish**

None required for acceptance. Real signed-in strategy data can be used for a later content-only capture without changing the approved layout.

final result: passed
