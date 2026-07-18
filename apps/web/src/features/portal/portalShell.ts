import type { ViewName } from "../../components/BottomNav";

export function resolvePortalContentView(view: ViewName): ViewName {
  if (view === "home") return "data";
  if (view === "track-record") return "radar";
  return view;
}

export function resolvePortalShellView(view: ViewName): ViewName {
  if (view === "home") return "home";
  return resolvePortalContentView(view);
}
