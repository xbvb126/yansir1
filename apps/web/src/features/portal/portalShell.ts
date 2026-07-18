import type { ViewName } from "../../components/BottomNav";

export function resolvePortalContentView(view: ViewName): ViewName {
  if (view === "home") return "data";
  if (view === "track-record") return "radar";
  return view;
}
