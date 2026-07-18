import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-portal-routing");
mkdirSync(outDir, { recursive: true });
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

function bundle(entry, name) {
  const outfile = path.join(outDir, `${name}.mjs`);
  execFileSync(process.execPath, [esbuildBin, entry, "--bundle", "--platform=node", "--format=esm", "--jsx=automatic", `--outfile=${outfile}`], { cwd: root });
  return import(pathToFileURL(outfile));
}

try {
  const navigation = await bundle("src/features/portal/portalNavigation.ts", "navigation");
  assert.deepEqual(navigation.mobilePrimaryItems.map((item) => item.view), ["data", "claw", "radar", "track-record", "account"]);
  assert.deepEqual(navigation.desktopPrimaryItems.map((item) => item.view), ["home", "data", "claw", "radar", "track-record", "plans"]);
  assert.equal(navigation.isPublicPortalView("home"), true);
  assert.equal(navigation.isPublicPortalView("track-record"), true);
  assert.equal(navigation.isPublicPortalView("claw"), true);
  assert.equal(navigation.isPublicPortalView("admin"), false);

  const intent = await bundle("src/features/portal/returnIntent.ts", "return-intent");
  const storage = new Map();
  const adapter = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  intent.saveReturnIntent(adapter, { view: "radar", symbol: "BTC", signalId: "sig-1", filters: { direction: "long" }, action: "save-watchlist" });
  assert.equal(intent.readReturnIntent(adapter)?.signalId, "sig-1");
  assert.equal(intent.consumeReturnIntent(adapter)?.view, "radar");
  assert.equal(intent.readReturnIntent(adapter), null);

  const access = await bundle("src/features/portal/accessBoundary.ts", "access");
  assert.deepEqual(access.accessDecision("ai-claw", { signedIn: false, plan: "Guest" }), { allowed: false, next: "login" });
  assert.deepEqual(access.accessDecision("realtime-radar", { signedIn: false, plan: "Guest" }), { allowed: false, next: "login" });
  assert.deepEqual(access.accessDecision("realtime-radar", { signedIn: true, plan: "Free" }), { allowed: false, next: "plans" });
  assert.deepEqual(access.accessDecision("save-watchlist", { signedIn: true, plan: "Free" }), { allowed: true, next: null });

  const shell = await bundle("src/features/portal/portalShell.ts", "portal-shell");
  assert.equal(shell.resolvePortalContentView("home"), "data", "the canonical home route must render the existing market fallback");
  assert.equal(shell.resolvePortalContentView("track-record"), "radar", "track record must render the existing signal-performance fallback");

  const bottomNav = await bundle("src/components/BottomNav.tsx", "bottom-nav");
  const navTree = bottomNav.BottomNav({ activeView: "track-record", onChange: () => {} });
  const trackRecordButton = navTree.props.children.find((button) => button.props["data-view"] === "track-record");
  const navGlyphElement = trackRecordButton.props.children[0].props.children;
  const trackRecordGlyph = navGlyphElement.type(navGlyphElement.props);
  assert.equal(trackRecordGlyph.props.name, "target", "track record must use the existing target system icon");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("portal routing tests passed");
