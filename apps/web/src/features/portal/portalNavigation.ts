import type { ViewName } from "../../components/BottomNav";

export type PrimaryNavItem = { label: string; view: ViewName };

export const mobilePrimaryItems: PrimaryNavItem[] = [
  { label: "市场", view: "data" },
  { label: "AI Claw", view: "claw" },
  { label: "雷达", view: "radar" },
  { label: "战绩", view: "track-record" },
  { label: "我的", view: "account" }
];

export const desktopPrimaryItems: PrimaryNavItem[] = [
  { label: "首页", view: "home" },
  { label: "市场", view: "data" },
  { label: "AI Claw", view: "claw" },
  { label: "雷达", view: "radar" },
  { label: "战绩", view: "track-record" },
  { label: "套餐", view: "plans" }
];

const publicPortalViews = new Set<ViewName>(["home", "data", "claw", "radar", "track-record", "plans"]);
export function isPublicPortalView(view: ViewName) { return publicPortalViews.has(view); }
