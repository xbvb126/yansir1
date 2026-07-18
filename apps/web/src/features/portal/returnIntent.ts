import type { ViewName } from "../../components/BottomNav";
import { accessDecision, type AccessIdentity, type AccessRequirement } from "./accessBoundary";

const RETURN_INTENT_KEY = "yansir.returnIntent.v1";
export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReturnIntent = { view: ViewName; symbol?: string; signalId?: string; filters?: Record<string, string>; action: string; requirement?: AccessRequirement };
export type ReturnIntentRestoreOptions<TSignal extends { id?: string }> = {
  identityRefreshSucceeded: boolean;
  identity: AccessIdentity;
  signals: TSignal[];
};
export type ReturnIntentRestoreResult<TSignal> = {
  restored: boolean;
  next: "login" | "plans" | null;
  intent: ReturnIntent | null;
  signal: TSignal | null;
};

const routeRequirements: Partial<Record<ViewName, AccessRequirement>> = {
  signal: "realtime-radar"
};

export function createRouteReturnIntent(view: ViewName, symbol = ""): ReturnIntent {
  return {
    view,
    symbol: symbol || undefined,
    action: `navigate:${view}`,
    requirement: routeRequirements[view]
  };
}

const safeActions = new Set([
  "save-watchlist",
  "review-signal",
  "open-realtime-radar",
  "apply-track-record-filters",
  "continue-plan-upgrade",
  "ai-claw"
]);

const safeFiltersByView: Partial<Record<ViewName, Set<string>>> = {
  data: new Set(["marketTab", "symbol"]),
  radar: new Set(["direction", "symbol", "signalType", "minScore"]),
  "track-record": new Set(["direction", "symbol"]),
  plans: new Set(["plan"])
};

export function createContextualReturnIntent(input: ReturnIntent): ReturnIntent {
  const allowedFilters = safeFiltersByView[input.view] ?? new Set<string>();
  const filters = Object.fromEntries(
    Object.entries(input.filters ?? {})
      .filter(([key, value]) => allowedFilters.has(key) && /^[\w.,:+-]{1,80}$/.test(String(value)))
      .map(([key, value]) => [key, String(value)])
  );
  const action = safeActions.has(input.action) || input.action === `navigate:${input.view}`
    ? input.action
    : `navigate:${input.view}`;
  return {
    ...input,
    symbol: input.symbol ? String(input.symbol).trim().toUpperCase().replace(/USDT$/, "") : undefined,
    signalId: input.signalId ? String(input.signalId).slice(0, 120) : undefined,
    filters: Object.keys(filters).length ? filters : undefined,
    action
  };
}

export function returnIntentSearchParams(intent: ReturnIntent): Record<string, string> {
  const safe = createContextualReturnIntent(intent);
  return {
    ...(safe.filters ?? {}),
    ...(safe.symbol ? { symbol: safe.symbol } : {}),
    ...(safe.signalId ? { signal: safe.signalId } : {}),
    ...(safe.action ? { action: safe.action } : {})
  };
}

export function saveReturnIntent(storage: StorageAdapter, intent: ReturnIntent) { storage.setItem(RETURN_INTENT_KEY, JSON.stringify(createContextualReturnIntent(intent))); }
export function readReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  try { return JSON.parse(storage.getItem(RETURN_INTENT_KEY) || "null") as ReturnIntent | null; } catch { return null; }
}
export function consumeReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  const value = readReturnIntent(storage); storage.removeItem(RETURN_INTENT_KEY); return value;
}

export function restoreReturnIntent<TSignal extends { id?: string }>(storage: StorageAdapter, options: ReturnIntentRestoreOptions<TSignal>): ReturnIntentRestoreResult<TSignal> {
  if (!options.identityRefreshSucceeded) return { restored: false, next: null, intent: null, signal: null };
  const intent = readReturnIntent(storage);
  if (!intent) return { restored: false, next: null, intent: null, signal: null };

  if (intent.requirement) {
    const decision = accessDecision(intent.requirement, options.identity);
    if (!decision.allowed) return { restored: false, next: decision.next, intent, signal: null };
  }

  const signal = intent.signalId ? options.signals.find((item) => item.id === intent.signalId) ?? null : null;
  if (intent.signalId && !signal) return { restored: false, next: null, intent, signal: null };

  consumeReturnIntent(storage);
  return { restored: true, next: null, intent, signal };
}
