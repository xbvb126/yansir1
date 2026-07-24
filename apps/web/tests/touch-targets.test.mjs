import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = [
  readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8"),
  readFileSync(join(process.cwd(), "src/styles/ai-claw-radar.css"), "utf8"),
].join("\n");

function selectorBlock(selector, source = css) {
  for (const match of source.matchAll(/(?<selectors>[^{}]+)\{(?<body>[^}]*)\}/gm)) {
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

function assertMinHeightAtLeast(selector, minimum, source = css) {
  const body = selectorBlock(selector, source);
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

function assertProperty(selector, property, expectedValue) {
  const body = selectorBlock(selector);
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+)`));
  assert.ok(match, `${selector} should declare ${property}`);
  assert.equal(match[1].trim().toLowerCase(), expectedValue.toLowerCase());
}

function assertNoHorizontalScrolling(selector, source = css) {
  const body = selectorBlock(selector, source);
  const horizontalScrollDeclaration = /(?:^|;)\s*(?:overflow|overflow-x)\s*:\s*(?:auto|scroll)\s*(?:!important\s*)?(?:;|$)/i;
  assert.doesNotMatch(
    body,
    horizontalScrollDeclaration,
    `${selector} must not enable horizontal scrolling`,
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
assertMinHeightAtLeast(".track-record-controls button", 44);
assertMinHeightAtLeast(".track-methodology-disclosure summary", 44);
assertMinHeightAtLeast(".track-record-unlock", 44);

const expandedTrackRecordShell = selectorBlock(".app-shell:has(.public-track-record-view)");
assert.match(expandedTrackRecordShell, /width\s*:\s*min\(100vw,\s*1180px\)/);

const trackRecordRow = selectorBlock(".track-record-row");
assert.match(
  trackRecordRow,
  /grid-template-columns\s*:\s*minmax\(0,\s*[^)]+\)/,
  ".track-record-row should use a zero-minimum first grid track",
);
assert.doesNotMatch(
  trackRecordRow,
  /(?:^|[;\s])min-width\s*:/,
  ".track-record-row should not declare a minimum width that can overflow the page",
);
assert.doesNotMatch(
  trackRecordRow,
  /(?:^|[;\s])width\s*:\s*\d+(?:px|rem|em)\b/,
  ".track-record-row should not declare a fixed width that can overflow the page",
);

const trackRecordColumns = selectorBlock(".track-record-row > div");
assert.match(
  trackRecordColumns,
  /min-width\s*:\s*0(?:px)?\s*;/,
  ".track-record-row child columns should be allowed to shrink within the grid",
);

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

assertMinHeightAtLeast(".radar-workspace-chrome .ai-track-tabs button", 44);
assertProperty(".radar-workspace-chrome__heading", "grid-template-columns", "minmax(0, 1fr) auto");
assertProperty(".radar-workspace-chrome__status", "flex-direction", "column");
assertProperty(".radar-workspace-chrome .ai-track-tabs button.active", "color", "#2F6BFF");
assertProperty(".radar-workspace-chrome .ai-track-tabs button.active::after", "background", "#2F6BFF");

assertProperty(
  ".view-claw .ai-claw-quick-actions",
  "grid-template-columns",
  "repeat(2, minmax(0, 1fr))",
);
assertProperty(
  ".radar-tracking-screen .radar-workspace-chrome__categories",
  "overflow-x",
  "auto",
);
assertMinHeightAtLeast(".view-claw .ai-claw-composer", 44);
assertMinHeightAtLeast(".radar-tracking-screen .radar-signal-row", 44);

const descendantMinHeightDecoy = `
  .view-claw .ai-claw-composer { display: grid; }
  .view-claw .ai-claw-composer textarea { min-height: 44px; }
`;
assert.throws(
  () => assertMinHeightAtLeast(".view-claw .ai-claw-composer", 44, descendantMinHeightDecoy),
  /should declare min-height/,
  "a descendant min-height must not satisfy the composer block assertion",
);
assertNoHorizontalScrolling(".radar-tracking-screen .live-command__queue");

const narrowMediaMatch = css.match(/@media\s*\(max-width:\s*359px\)\s*\{([\s\S]*)\}\s*$/);
assert.ok(narrowMediaMatch, "radar should define a dedicated 320px-width layout");
const narrowRowBody = selectorBlock(
  ".radar-tracking-screen .radar-signal-row",
  narrowMediaMatch[1],
);
const narrowColumns = narrowRowBody.match(/grid-template-columns\s*:\s*([^;]+)/)?.[1]?.trim();
assert.equal(
  narrowColumns,
  "36px minmax(0, 1fr) 30px 36px 28px minmax(0, 54px)",
  "the 320px row should reserve one shrinkable symbol column and compact fixed facts",
);
const narrowGap = Number(narrowRowBody.match(/gap\s*:\s*(\d+)px/)?.[1]);
const narrowPadding = Number(narrowRowBody.match(/padding\s*:\s*\d+px\s+(\d+)px/)?.[1]);
const fixedColumnWidth = 36 + 30 + 36 + 28 + 54;
assert.ok(
  fixedColumnWidth + narrowGap * 5 + narrowPadding * 2 < 320,
  "fixed columns, gaps, and padding must leave positive width for the shrinkable symbol column at 320px",
);
assertNoHorizontalScrolling(".radar-tracking-screen .live-command__queue");

for (const declaration of [
  "overflow: auto",
  "overflow: scroll",
  "overflow-x: auto",
  "overflow-x: scroll",
]) {
  assert.throws(
    () => assertNoHorizontalScrolling(".timeline", `.timeline { ${declaration}; }`),
    /must not enable horizontal scrolling/,
    `${declaration} must be rejected for a timeline container`,
  );
}

console.log("touch target tests passed");
