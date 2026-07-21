import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

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
