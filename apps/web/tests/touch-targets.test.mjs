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

function assertProperty(selector, property, expectedValue) {
  const body = selectorBlock(selector);
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+)`));
  assert.ok(match, `${selector} should declare ${property}`);
  assert.equal(match[1].trim().toLowerCase(), expectedValue.toLowerCase());
}

assertMinHeightAtLeast(".live-command__filters button", 44);
assertMinHeightAtLeast(".live-command__empty-actions button", 44);
assertMinHeightAtLeast(".radar-tracking-screen .ai-track-sections button", 44);
assertMinHeightAtLeast(".radar-workspace-chrome .ai-track-tabs button", 44);
assertProperty(".radar-workspace-chrome__heading", "grid-template-columns", "minmax(0, 1fr) auto");
assertProperty(".radar-workspace-chrome__status", "flex-direction", "column");
assertProperty(".radar-workspace-chrome .ai-track-tabs button.active", "color", "#2F6BFF");
assertProperty(".radar-workspace-chrome .ai-track-tabs button.active::after", "background", "#2F6BFF");

console.log("touch target tests passed");
