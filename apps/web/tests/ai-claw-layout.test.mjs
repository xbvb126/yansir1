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
