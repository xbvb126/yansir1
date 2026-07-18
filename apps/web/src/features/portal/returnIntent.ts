import type { ViewName } from "../../components/BottomNav";

const RETURN_INTENT_KEY = "yansir.returnIntent.v1";
export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReturnIntent = { view: ViewName; symbol?: string; signalId?: string; filters?: Record<string, string>; action: string };

export function saveReturnIntent(storage: StorageAdapter, intent: ReturnIntent) { storage.setItem(RETURN_INTENT_KEY, JSON.stringify(intent)); }
export function readReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  try { return JSON.parse(storage.getItem(RETURN_INTENT_KEY) || "null") as ReturnIntent | null; } catch { return null; }
}
export function consumeReturnIntent(storage: StorageAdapter): ReturnIntent | null {
  const value = readReturnIntent(storage); storage.removeItem(RETURN_INTENT_KEY); return value;
}
