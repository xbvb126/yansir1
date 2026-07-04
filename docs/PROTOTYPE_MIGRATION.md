# Prototype Migration

## Current Prototype

The current prototype is intentionally kept at the repository root:

```text
server.js
package.json
public/index.html
public/app.js
public/styles.css
```

It runs with:

```text
npm run dev
```

and serves:

```text
http://localhost:4173
```

## Screens Already Represented

- `?view=data`: market metrics and anomaly factors
- `?view=claw`: ValueClaw chat-style analysis
- default / `?view=radar`: AI coin selection signal stream
- `?view=signal`: signal center and Feishu delivery
- `?view=account`: account, plans, users, quotas

## Migration Target

Move the prototype into:

```text
apps/web
```

Suggested component split:

```text
apps/web/src/
  components/
    AppShell.tsx
    BottomNav.tsx
    TopTabs.tsx
    SignalRows.tsx
    TimelineCards.tsx
    ValueClawChat.tsx
    AccountProfile.tsx
    PlanList.tsx
    UserTable.tsx
  features/
    data/
    claw/
    radar/
    signals/
    account/
  styles/
    tokens.css
```

## Migration Rule

Do not redesign during migration. First preserve the current UI behavior and visual density, then improve incrementally after the formal app is stable.

## Migration Status

The five-view prototype has been migrated into the React + Vite app shell in `apps/web/src/components/AppShell.tsx`.

## API Replacement Plan

Replace local mock calls in `public/app.js` with:

```text
GET  /api/me
GET  /api/billing/plans
GET  /api/admin/users
GET  /api/market/overview
GET  /api/signals
POST /api/alerts/feishu
POST /api/claw/chat
```

The existing `server.js` can then be retired or kept as a static demo server.
