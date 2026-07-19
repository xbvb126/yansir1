import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

function selectorBlock(selector) {
  for (const match of css.matchAll(/(?<selectors>[^{}]+)\{(?<body>[^}]*)\}/gm)) {
    const selectors = match.groups.selectors
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (selectors.includes(selector)) {
      return match.groups.body;
    }
  }

  assert.fail(`${selector} should have an explicit CSS block`);
}

function assertMinHeightAtLeast(selector, minimum) {
  const body = selectorBlock(selector);
  const match = body.match(/min-height\s*:\s*(\d+)px/);
  assert.ok(match, `${selector} should declare min-height`);
  assert.ok(
    Number(match[1]) >= minimum,
    `${selector} min-height should be at least ${minimum}px`,
  );
}

function assertFontSizeAtLeast(selector, minimum) {
  const sizes = [];
  for (const match of css.matchAll(/(?<selectors>[^{}]+)\{(?<body>[^}]*)\}/gm)) {
    const selectors = match.groups.selectors
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!selectors.includes(selector)) continue;
    for (const size of match.groups.body.matchAll(/font-size\s*:\s*(\d+)px/g)) sizes.push(Number(size[1]));
  }
  assert.ok(sizes.length > 0, `${selector} should declare font-size`);
  assert.ok(sizes.every((size) => size >= minimum), `${selector} font-size should be at least ${minimum}px`);
}

function assertHighContrastFocus(selector) {
  const body = selectorBlock(selector);
  assert.match(body, /#fff/i, `${selector} should include a light contrast ring`);
  assert.match(body, /#0b1220/i, `${selector} should include a dark contrast ring`);
}

assertMinHeightAtLeast(".live-command__filters button", 44);
assertMinHeightAtLeast(".live-command__empty-actions button", 44);
assertMinHeightAtLeast(".radar-tracking-screen .ai-track-sections button", 44);
assertMinHeightAtLeast(".portal-brand-button", 44);
assertMinHeightAtLeast(".desktop-primary-nav button", 44);
assertMinHeightAtLeast(".bottom-nav button", 44);
assertMinHeightAtLeast(".portal-primary-action", 44);
assertMinHeightAtLeast(".track-record-filter button", 44);
assertMinHeightAtLeast(".portal-retry-button", 44);
assertMinHeightAtLeast(".track-record-controls button", 44);
assertMinHeightAtLeast(".track-methodology-disclosure summary", 44);
assertMinHeightAtLeast(".track-record-unlock", 44);

const expandedTrackRecordShell = selectorBlock(".app-shell:has(.public-track-record-view)");
assert.match(expandedTrackRecordShell, /width\s*:\s*min\(100vw,\s*1180px\)/);

assertHighContrastFocus(".track-record-controls input:focus-visible");
assertHighContrastFocus(".track-record-controls button:focus-visible");
assertHighContrastFocus(".track-methodology-disclosure summary:focus-visible");

for (const selector of [
  ".public-track-record-view .portal-eyebrow",
  ".track-record-verified",
  ".track-trust-grid small",
  ".track-record-controls label",
  ".track-record-controls input",
  ".track-record-controls button",
  ".track-record-ledger-head span",
  ".track-record-row small",
  ".track-completion",
  ".track-direction",
  ".track-unavailable p",
  ".track-methodology-disclosure summary small",
  ".public-track-record-view .portal-empty-state p",
  ".public-track-record-view .portal-retry-button",
]) {
  assertFontSizeAtLeast(selector, 14);
}

const portalFocus = selectorBlock(".portal-brand-button:focus-visible");
assert.doesNotMatch(portalFocus, /#ffbf47/i, "portal focus should not rely on the low-contrast amber outline");
assert.match(portalFocus, /#fff/i, "portal focus should include a light contrast ring");
assert.match(portalFocus, /#0b1220/i, "portal focus should include a dark contrast ring");

console.log("touch target tests passed");
