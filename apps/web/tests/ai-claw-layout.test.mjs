import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp");
const promptsOutFile = path.join(outDir, "aiClawPrompts.mjs");
const experienceOutFile = path.join(outDir, "AIClawExperience.mjs");

function elementInnerHtmlByClass(markup, tagName, className) {
  const openingTag = new RegExp(`<${tagName}\\b[^>]*\\bclass="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "g");
  const match = openingTag.exec(markup);
  assert.ok(match, `expected .${className} ${tagName} element`);

  const tagBoundary = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "g");
  tagBoundary.lastIndex = match.index + match[0].length;
  let depth = 1;
  let boundary;
  while ((boundary = tagBoundary.exec(markup))) {
    depth += boundary[0].startsWith(`</${tagName}`) ? -1 : 1;
    if (depth === 0) {
      return markup.slice(match.index + match[0].length, boundary.index);
    }
  }
  assert.fail(`expected closing </${tagName}> for .${className}`);
}

function openingTags(markup, tagName) {
  return markup.match(new RegExp(`<${tagName}\\b[^>]*>`, "g")) || [];
}

function isDisabledOpeningTag(openingTag) {
  return /(?:^|\s)disabled(?:=""|(?=\s|>))/.test(openingTag);
}

function assertEveryControlDisabled(openingTagList, expectedCount, label) {
  assert.equal(openingTagList.length, expectedCount, `${label} control count`);
  openingTagList.forEach((openingTag, index) => {
    assert.equal(isDisabledOpeningTag(openingTag), true, `${label} control ${index + 1} should be disabled`);
  });
}

mkdirSync(outDir, { recursive: true });

try {
  await build({
    entryPoints: [path.join(webRoot, "src/features/claw/aiClawPrompts.ts")],
    outfile: promptsOutFile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
  });

  const module = await import(pathToFileURL(promptsOutFile).href);

  assert.deepEqual(
    module.AI_CLAW_QUICK_ACTIONS.map((item) => item.label),
    ["市场概览", "资金流向", "策略信号", "热门代币", "巨鲸动态", "市场情绪"],
  );
  assert.match(
    module.buildAIClawPrompt("signal", { symbol: "BTC", direction: "long", score: 78 }),
    /BTC.*看多.*78/,
  );
  assert.equal(module.buildAIClawPrompt("signal"), "解读最近的 Yansir 策略信号");

  await build({
    entryPoints: [path.join(webRoot, "src/features/claw/AIClawExperience.tsx")],
    outfile: experienceOutFile,
    bundle: true,
    external: ["react"],
    format: "esm",
    jsx: "automatic",
    platform: "node",
    target: "node18",
  });

  const { AIClawExperience } = await import(pathToFileURL(experienceOutFile).href);
  const commonProps = {
    status: "在线",
    insightCopy: "已加载 12 个市场行情和 6 条策略信号。",
    messages: React.createElement("p", null, "你好，我是 AIClaw。"),
    signalContext: React.createElement("p", null, "BTC · 看多 · 78/100"),
    input: "分析 BTC 当前机会和风险",
    loading: false,
    onQuickAction: () => {},
    onInput: () => {},
    onSubmit: () => {},
    onLogin: () => {},
    onHelp: () => {},
    onClearContext: () => {},
    renderIcon: (name) => React.createElement("span", { "data-icon": name }),
  };

  const markup = renderToStaticMarkup(
    React.createElement(AIClawExperience, { ...commonProps, signedIn: true }),
  );

  assert.match(markup, /AIClaw/);
  assert.match(markup, /在线/);
  assert.match(markup, /今天想先看什么？/);
  assert.match(markup, /市场概览.*资金流向.*策略信号.*热门代币.*巨鲸动态.*市场情绪/s);
  assert.match(markup, /信号上下文/);
  assert.match(markup, /向 AIClaw 提问/);

  const signedOutMarkup = renderToStaticMarkup(
    React.createElement(AIClawExperience, { ...commonProps, signedIn: false }),
  );

  assert.match(signedOutMarkup, /今天想先看什么？/);
  assert.match(signedOutMarkup, /市场概览.*资金流向.*策略信号.*热门代币.*巨鲸动态.*市场情绪/s);
  assert.match(signedOutMarkup, /登录后使用 AIClaw/);

  const signedOutQuickActions = elementInnerHtmlByClass(signedOutMarkup, "div", "ai-claw-quick-actions");
  const signedOutQuickActionButtons = openingTags(signedOutQuickActions, "button");
  assertEveryControlDisabled(signedOutQuickActionButtons, 6, "signed-out quick action");

  const signedOutComposer = elementInnerHtmlByClass(signedOutMarkup, "form", "ai-claw-composer");
  assertEveryControlDisabled(openingTags(signedOutComposer, "textarea"), 1, "signed-out composer textarea");
  assertEveryControlDisabled(openingTags(signedOutComposer, "button"), 1, "signed-out composer submit");

  const signedOutLoginGate = elementInnerHtmlByClass(signedOutMarkup, "div", "ai-claw-login-gate");
  const signedOutLoginButtons = openingTags(signedOutLoginGate, "button");
  assert.equal(signedOutLoginButtons.length, 1, "signed-out login CTA count");
  assert.equal(isDisabledOpeningTag(signedOutLoginButtons[0]), false, "signed-out login CTA should stay enabled");

  const quickActionMutation = [...signedOutQuickActionButtons];
  quickActionMutation[0] = quickActionMutation[0].replace(/\sdisabled=""/, "");
  assert.throws(
    () => assertEveryControlDisabled(quickActionMutation, 6, "mutated quick action"),
    /mutated quick action control 1 should be disabled/,
    "selector-aware assertion must reject one enabled quick action even when unrelated disabled controls exist",
  );

  const appShellSource = readFileSync(
    path.join(webRoot, "src/components/AppShell.tsx"),
    "utf8",
  );
  assert.match(appShellSource, /import \{ AIClawExperience \} from "\.\.\/features\/claw\/AIClawExperience"/);
  assert.match(appShellSource, /buildAIClawPrompt\(actionId, signalContext \? \{/);
  assert.match(appShellSource, /direction: signalContext\.direction === "neutral" \? "flat" : signalContext\.direction/);
  assert.match(appShellSource, /<AIClawExperience/);
  assert.match(appShellSource, /"\/api\/claw\/status"/);
  assert.match(appShellSource, /"\/api\/claw\/chat"/);
  assert.doesNotMatch(appShellSource, /ValueClaw 仅用于解释和复核/);
  assert.doesNotMatch(appShellSource, /打开 ValueClaw 复核/);
  assert.doesNotMatch(appShellSource, /ValueClaw 正在分析/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("AIClaw layout contract tests passed");
