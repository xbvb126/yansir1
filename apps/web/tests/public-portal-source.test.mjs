import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const nav = src("src/features/portal/ResponsivePrimaryNav.tsx");
const shell = src("src/components/AppShell.tsx");
const returnIntent = src("src/features/portal/returnIntent.ts");
const home = src("src/features/portal/PublicHomeView.tsx");
const claw = src("src/features/portal/PublicClawPreview.tsx");

assert.match(nav, /desktopPrimaryItems/);
assert.match(nav, /aria-current/);
assert.match(nav, /onNavigate\("home"\)/);
assert.match(shell, /saveReturnIntent/);
assert.match(shell, /createRouteReturnIntent\(nextView, selectedSymbol\)/);
assert.match(shell, /restoreReturnIntent/);
assert.match(shell, /setValueClawSignalContext\(restoration\.signal\)/);
assert.match(shell, /ResponsivePrimaryNav/);
assert.match(returnIntent, /consumeReturnIntent/);
assert.match(home, /体验公开雷达/);
assert.match(home, /策略引擎/);
assert.match(home, /AI Claw/);
assert.match(home, /查看历史战绩/);
assert.doesNotMatch(home, /胜率\s*80|平均收益\s*65/);
assert.match(claw, /示例问题/);
assert.match(claw, /登录后使用 AI Claw/);
assert.doesNotMatch(claw, /apiPost|fetch\(/);
assert.match(shell, /currentUser\.id\s*\?\s*<ValueClawPage/);
assert.match(shell, /<PublicClawPreview/);
assert.match(shell, /const shellView = resolvePortalShellView\(view\);[\s\S]*app-shell view-\$\{showSymbolDetail \? "symbol" : shellView\}/);

console.log("public portal source tests passed");
