# Yansir Public Product Portal Design

Date: 2026-07-18

Status: Approved in interactive design review

## 1. Purpose

Turn Yansir from a mostly in-app crypto signal tool into a public, mobile-first product portal that a new visitor can understand and try without signing in.

The first-phase product goal is:

> A new visitor can understand what Yansir does and enter a real, delayed signal experience within one minute.

The portal must preserve Yansir's existing product position: the strategy engine creates signals; AI Claw explains and reviews those signals but does not generate or override them.

## 2. Confirmed Product Decisions

- Build the full public portal approach rather than only a landing page.
- Anonymous users can browse Home, Market, delayed Radar, Track Record, and Plans.
- Use one navigation model across anonymous and authenticated states.
- Remain mobile-first.
- Mobile keeps bottom navigation; desktop uses top navigation.
- AI Claw remains the second mobile navigation item.
- Anonymous AI Claw shows capability explanations and example prompts but does not send a real conversation.
- The public radar uses real signals delayed by eight hours and limits the visible history.
- Authentication and upgrades happen in context. After success, users return to the same page, filters, and selected signal.
- The public track record includes all eligible signals, including missed, invalidated, and pending records. It must not be a curated winners list.

## 3. Scope

### 3.1 In scope

- Public home page.
- Responsive unified primary navigation.
- Anonymous market browsing.
- Anonymous delayed radar using the existing public signal endpoint.
- Anonymous AI Claw capability preview.
- Public track-record page and public performance summary.
- Public plans comparison and FAQ.
- In-context login and upgrade prompts.
- Stable loading, empty, stale, delayed, pending-performance, and unavailable states.
- Public-page metadata, semantic page titles, and crawlable route metadata.
- Responsive, accessibility, routing, permission, and API contract tests.

### 3.2 Out of scope

- Letting anonymous users send AI Claw conversations.
- Changing strategy rules, TradingView parity, signal scoring, or signal lifecycle semantics.
- Adding on-chain, whale, social, community, token-payment, or unrelated OxMind features.
- Replacing Feishu with additional notification providers.
- Rebuilding the authenticated account, team, admin, or K-line lab workflows.
- Claiming trading profitability or presenting signal returns as executed trades.
- A desktop-first trader terminal redesign.

## 4. Information Architecture

### 4.1 Canonical views

Add two canonical public views to the existing query-based routing model:

- `view=home`
- `view=track-record`

Keep the existing canonical views, including `data`, `claw`, `radar`, `signal`, `account`, `plans`, `login`, and `register`.

The default route becomes `view=home`. Existing explicit deep links such as `view=radar`, `view=data`, and aliases such as `view=valueclaw` continue to work.

### 4.2 Mobile navigation

Mobile bottom navigation has five persistent items in this order:

1. Market (`data`)
2. AI Claw (`claw`)
3. Radar (`radar`)
4. Track Record (`track-record`)
5. My (`account`)

Home does not consume a bottom-navigation position. The Yansir brand control in the page header opens Home. Plans remains reachable from Home, Track Record, account/upgrade prompts, and the desktop top navigation.

For an anonymous visitor, `My` opens the existing login/account gateway. It is a navigation action, not an additional anonymously browsable product page.

### 4.3 Desktop navigation

Desktop top navigation uses the same content model:

1. Home
2. Market
3. AI Claw
4. Radar
5. Track Record
6. Plans

Authentication controls appear at the right side. Logged-in users see their account entry without changing the order of the product destinations.

### 4.4 Identity transitions

Signing in, signing out, or upgrading must not silently change the active product destination.

Before opening Login or Plans from a restricted action, save a local return intent containing:

- canonical view
- selected symbol or signal ID
- active filters
- requested restricted action

After successful login or entitlement refresh, restore that intent once and then clear it.

## 5. Public Home Page

The home page follows a fixed reading order.

### 5.1 Hero

Primary statement:

> Real-time market scanning with explainable strategy signals.

Supporting statement:

> Yansir's strategy engine creates signals. AI Claw explains and reviews them.

Primary action: `Experience public radar`

Secondary action: `View track record`

Reassurance shown next to the actions:

- No sign-in required.
- Real signals delayed by eight hours.
- For research and reference, not investment advice.

### 5.2 Three user questions

- What is happening now? Market movement and strategy radar.
- Why did it trigger? Strategy evidence and AI Claw explanation.
- What happened afterward? Fixed-window signal review.

### 5.3 Verifiable signal example

Use one real record returned by the public API, not hard-coded marketing data. Show:

- symbol
- direction
- strategy score
- generated time
- trigger reason
- invalidation or risk condition when available
- 15-minute and one-hour review when completed
- strategy version or source identifier when available

If no eligible record is available, show an honest empty state rather than fabricated sample performance.

### 5.4 Product workflow

Explain the product as a three-step loop:

1. Strategy engine creates a signal from market data and deterministic rules.
2. AI Claw explains or reviews the stored signal context.
3. Yansir alerts eligible users and records fixed-window performance.

### 5.5 Plan summary and final action

Show a concise Free, VIP, and SVIP comparison. End with `Enter public radar` as the primary action. Registration remains secondary.

## 6. Anonymous and Plan Access Model

### 6.1 Market

Anonymous:

- public market overview
- public market rows and symbol details that contain no user data
- no saved watchlist

Free:

- limited saved watchlist
- plan-defined timeframes and symbol limits

VIP/SVIP:

- larger watchlist and additional plan-defined data access

### 6.2 AI Claw

Anonymous:

- capability explanation
- example questions
- explanation of how signal context is used
- sign-in action
- no request is sent to the AI endpoint

Free:

- plan-defined analysis allowance
- may use the user's watchlist and public/delayed signal context

VIP/SVIP:

- full plan-defined analysis capability
- selected signal context
- scheduled tasks only where current entitlements permit them

### 6.3 Radar

Anonymous:

- real strategy signals delayed by exactly eight hours
- public history limited to the existing seven-day public window
- visible and persistent `8-hour delay` status
- basic filters allowed by the public endpoint
- no saved watchlist, push configuration, or real-time stream

Free:

- remains subject to Free delay and quotas
- can save plan-limited watchlist/filter state

VIP/SVIP:

- real-time access and plan-defined filters, quotas, and push features

### 6.4 Track Record

Anonymous:

- all eligible public records in the seven-day public window
- generated time, symbol, direction, score, completion status, 15-minute return, and one-hour return
- 24-hour completed and pending sample counts in the public summary
- no per-record 4-hour or 24-hour returns
- no MFE or MAE values
- public methodology and calculation version

Free:

- the same public performance values
- saved filters and personal watchlist scoping

VIP/SVIP:

- plan-defined history window
- per-record 4-hour and 24-hour returns
- maximum favorable and adverse excursion
- complete aggregate analysis

This resolves an ambiguity found during design review: the public ledger may state how many records completed the 24-hour observation window, but individual 24-hour returns remain locked in the anonymous experience.

### 6.5 Plans

Anonymous:

- full feature comparison
- exact delay, history, watchlist, timeframe, AI, alert, API, and team differences
- FAQ and billing rules

Authenticated:

- current plan
- current usage and entitlement differences
- available upgrade or renewal actions
- order state where applicable

## 7. Restricted-Action Interaction

Do not replace an entire public page with an authentication wall.

Restricted fields keep their label and layout position. The value is replaced by a short explanation such as:

> VIP includes 24-hour review, maximum favorable excursion, and maximum adverse excursion.

The action label must describe the next step:

- `Sign in to save`
- `Sign in to use AI Claw`
- `View plan differences`
- `Upgrade for real-time radar`

Authentication and plan prompts must distinguish login from upgrade. Signing in does not imply that a Free user has paid access.

## 8. Track-Record Methodology

### 8.1 Eligible records

The public track record includes stored strategy signal events only. Market-movement observations that did not trigger the strategy are excluded from outcome aggregates.

Records are never removed because their later movement was unfavorable.

### 8.2 Fixed-window returns

Use the stored signal event price as the observation baseline. Display existing fixed windows from `signal_performance`:

- 15 minutes
- 1 hour
- 4 hours
- 24 hours

These are market observations, not simulated or executed trade P&L. Fees, slippage, leverage, liquidation, order fill, and position sizing are not implied.

### 8.3 Directional hit definition

For aggregates that use a hit rate:

- long signal: the fixed-window raw return is positive
- short signal: the fixed-window raw return is negative
- zero return: not a hit
- pending, missing, or invalid data: excluded from the completed denominator and reported separately

Show both the completed denominator and pending count next to every aggregate rate.

### 8.4 Public summary contract

Add `GET /api/strategy/public-performance-summary` as a read-only anonymous endpoint. The public portal requires this semantic response shape:

```ts
type PublicPerformanceSummary = {
  windowDays: 7;
  generatedAt: string;
  methodologyVersion: string;
  totalSignals: number;
  completed24hCount: number;
  pending24hCount: number;
  directionalHitRate1h: number | null;
  averageDirectionalReturn1h: number | null;
};
```

The implementation may add filter metadata and pagination, but it must not expose locked per-record fields through the anonymous response.

## 9. Component Boundaries

Do not add all portal behavior directly to the already large `AppShell.tsx`.

Create focused product units with these responsibilities:

- `ResponsivePrimaryNav`: owns responsive navigation rendering and active destination only.
- `PublicHomeView`: owns the approved home-page sequence and public entry actions.
- `PublicClawPreview`: owns anonymous AI Claw explanation and example prompts; it cannot call AI APIs.
- `PublicTrackRecordView`: owns public summary, filters, ledger rows, methodology, and locked fields.
- `AccessBoundary`: receives an action requirement and current entitlements, then renders either the real action or the approved in-context prompt.
- `returnIntent`: serializes, restores, and clears the one-time post-authentication return intent.
- `publicPerformance`: owns frontend formatting and methodology labels for the public summary.

`AppShell` remains the view coordinator and provider of existing user, entitlement, market, and signal state. Existing Radar, Market, Plans, and authenticated AI Claw implementations remain their own product surfaces.

## 10. Data Flow

### 10.1 Public radar

1. Browser requests the existing `GET /api/strategy/public-signals` endpoint.
2. API applies an eight-hour delay and seven-day public history window server-side.
3. API maps rows with anonymous entitlements, excluding locked performance values.
4. Web renders the returned delay, access, filter, and pagination metadata.

The client must never implement the eight-hour security boundary by merely hiding recent rows.

### 10.2 Public track record

1. Strategy signal events are stored with immutable event time, price, direction, score, payload, and strategy source.
2. The existing performance updater fills fixed-window values in `signal_performance`.
3. `GET /api/strategy/public-performance-summary` aggregates the eligible public window.
4. The public response separates completed and pending samples.
5. The web renders summary and ledger data with methodology text from a versioned constant.

The ledger rows continue to come from `GET /api/strategy/public-signals`; the summary endpoint does not duplicate or paginate row data.

### 10.3 Authentication and upgrade

1. A restricted action stores return intent.
2. User signs in or opens Plans.
3. The application refreshes current user and entitlements.
4. The router restores the destination and selected context.
5. `AccessBoundary` re-evaluates the action using refreshed entitlements.

## 11. Loading, Empty, Error, and Stale States

### 11.1 No signals

Show:

- strategy service status
- last successful scan time
- active filters
- whether filters hide records
- actions to refresh, view recent history, or relax filters

Do not describe `no matching signal` as `service paused`.

### 11.2 Performance pending

Show the observation windows that have completed and those still pending. Pending records are excluded from completed denominators.

### 11.3 Delayed data

Every anonymous radar surface shows `Delayed 8 hours`. Also show the latest public event time or data update time.

### 11.4 Upstream degradation

If market or strategy data is degraded, show the affected source and last successful time. Do not present cached fixture or stale data as current production data.

### 11.5 API unavailable

If a previously successful response exists, render it with an explicit `stale` state and timestamp. Otherwise show an unavailable state and a retry action. Never fabricate signals or performance.

### 11.6 Authentication or entitlement refresh failure

Keep the user on the current destination, preserve return intent, and show a retryable inline message. Do not assume the upgrade succeeded until refreshed entitlements prove it.

## 12. Accessibility and Responsive Behavior

- Mobile-first layout remains the default.
- Mobile interactive targets are at least 44 by 44 CSS pixels.
- Bottom navigation items have stable accessible names.
- Desktop top navigation uses semantic navigation and exposes the active page.
- Page titles and the main heading change with canonical view.
- Loading, stale, delay, and performance-pending changes use appropriate live-region announcements without repeatedly interrupting screen readers.
- Locked fields remain understandable without color, blur, or icons alone.
- Keyboard focus returns to the triggering control when a login or upgrade prompt closes.
- Responsive layouts reflow at 200% zoom without horizontal page scrolling for core tasks.

## 13. Metadata and Public Discoverability

Each public view has a unique document title and description:

- Home: product position and explainable strategy signals.
- Market: public crypto market overview.
- Radar: eight-hour delayed Yansir strategy signals.
- Track Record: fixed-window historical signal review and methodology.
- Plans: Free, VIP, and SVIP capability comparison.

Public pages must expose correct language metadata, canonical URLs, Open Graph metadata, and non-HTML `robots.txt` and `sitemap.xml` responses in production hosting.

Authenticated account, admin, team, login return state, and K-line lab pages are not included in the public sitemap.

## 14. Testing and Acceptance

### 14.1 Routing

- Empty view parameter opens Home.
- Mobile and desktop navigation reach the same canonical destinations.
- Existing `valueclaw` and `alerts` aliases continue to work.
- Unknown views use the existing safe fallback policy without showing a mismatched URL and page.

### 14.2 Anonymous access

- Home, Market, Radar, Track Record, and Plans render without authentication.
- Anonymous AI Claw preview never calls the AI endpoint.
- Public radar requests only the public delayed endpoint.
- Anonymous responses never expose 4-hour, 24-hour, MFE, or MAE per-record values.

### 14.3 Entitlements

- Login, Free, VIP, and SVIP states show the approved differences.
- Signing in returns to the original view, selected signal, and filters.
- Entitlement refresh changes locked controls in place.
- Login and upgrade prompts use distinct copy and actions.

### 14.4 Track record

- Completed, pending, unfavorable, and invalidated eligible records remain visible.
- Pending records are excluded from hit-rate denominators.
- Long and short directional hit calculations follow the approved definition.
- Public summary counts match the public ledger filters and seven-day window.
- No fixture or hard-coded profitable signal is used when production data is empty.

### 14.5 Failure states

- No-signal, filter-empty, pending, delayed, stale, and unavailable states render separately.
- Last successful time appears for stale or degraded data.
- Retry does not clear filters or selected context.

### 14.6 Responsive and accessibility

- Mobile bottom navigation order is Market, AI Claw, Radar, Track Record, My.
- Desktop navigation order is Home, Market, AI Claw, Radar, Track Record, Plans.
- Core mobile targets meet the 44-pixel requirement.
- Keyboard focus and accessible names are verified for navigation, prompts, filters, and primary actions.

## 15. Delivery Sequence

The design is one public-portal program but should be implemented as independently testable increments:

1. Canonical views, unified navigation, and return intent.
2. Public Home and anonymous AI Claw preview.
3. Anonymous Market and delayed Radar integration.
4. Public performance summary and Track Record.
5. Plans integration, entitlement transitions, metadata, and final responsive/accessibility QA.

Each increment must leave the existing authenticated product routes functional.

## 16. Success Criteria

The first public release is successful when:

- an anonymous visitor can open Home and enter the delayed Radar without signing in;
- the visitor can explain that the strategy creates signals and AI Claw explains them;
- AI Claw remains the second mobile navigation item;
- public Radar data is delayed server-side by exactly eight hours;
- the Track Record shows complete eligible samples and an explicit methodology;
- restricted actions preserve context through login or upgrade;
- existing authenticated Market, Radar, AI Claw, Alerts, Account, Team, Admin, and K-line Lab routes continue to work;
- automated routing, access, API-contract, responsive, and accessibility checks pass.
