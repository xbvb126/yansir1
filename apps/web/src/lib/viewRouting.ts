import type { ViewName } from "../components/BottomNav";

const viewAliases: Record<string, ViewName> = {
  valueclaw: "claw",
  alerts: "signal",
  alert: "signal",
  signals: "radar",
};

const canonicalViews = new Set<ViewName>([
  "data",
  "claw",
  "radar",
  "track-record",
  "signal",
  "account",
  "login",
  "register",
  "admin",
  "plans",
  "team",
  "kline-lab",
]);

export function normalizeViewParam(value: string | null | undefined): ViewName {
  const clean = `${value ?? ""}`.trim().toLowerCase();
  if (!clean) return "data";
  if (clean in viewAliases) return viewAliases[clean];
  return canonicalViews.has(clean as ViewName) ? (clean as ViewName) : "data";
}
