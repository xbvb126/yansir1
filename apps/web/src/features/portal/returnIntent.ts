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

export function saveReturnIntent(storage: StorageAdapter, intent: ReturnIntent) { storage.setItem(RETURN_INTENT_KEY, JSON.stringify(intent)); }
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
