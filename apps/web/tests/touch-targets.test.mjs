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

assertMinHeightAtLeast(".live-command__filters button", 44);
assertMinHeightAtLeast(".live-command__empty-actions button", 44);
assertMinHeightAtLeast(".radar-tracking-screen .ai-track-sections button", 44);
assertMinHeightAtLeast(".portal-brand-button", 44);
assertMinHeightAtLeast(".desktop-primary-nav button", 44);
assertMinHeightAtLeast(".bottom-nav button", 44);
assertMinHeightAtLeast(".portal-primary-action", 44);
assertMinHeightAtLeast(".track-record-filter button", 44);
assertMinHeightAtLeast(".portal-retry-button", 44);

const portalFocus = selectorBlock(".portal-brand-button:focus-visible");
assert.doesNotMatch(portalFocus, /#ffbf47/i, "portal focus should not rely on the low-contrast amber outline");
assert.match(portalFocus, /#fff/i, "portal focus should include a light contrast ring");
assert.match(portalFocus, /#0b1220/i, "portal focus should include a dark contrast ring");

console.log("touch target tests passed");
