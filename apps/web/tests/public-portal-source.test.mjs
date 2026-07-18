import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const nav = src("src/features/portal/ResponsivePrimaryNav.tsx");
const shell = src("src/components/AppShell.tsx");
const returnIntent = src("src/features/portal/returnIntent.ts");

assert.match(nav, /desktopPrimaryItems/);
assert.match(nav, /aria-current/);
assert.match(nav, /onNavigate\("home"\)/);
assert.match(shell, /saveReturnIntent/);
assert.match(shell, /createRouteReturnIntent\(nextView, selectedSymbol\)/);
assert.match(shell, /restoreReturnIntent/);
assert.match(shell, /setValueClawSignalContext\(restoration\.signal\)/);
assert.match(shell, /ResponsivePrimaryNav/);
assert.match(returnIntent, /consumeReturnIntent/);

console.log("public portal source tests passed");
