import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp");
const outFile = path.join(outDir, "aiClawPrompts.mjs");

mkdirSync(outDir, { recursive: true });

try {
  await build({
    entryPoints: [path.join(webRoot, "src/features/claw/aiClawPrompts.ts")],
    outfile: outFile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
  });

  const module = await import(pathToFileURL(outFile).href);

  assert.deepEqual(
    module.AI_CLAW_QUICK_ACTIONS.map((item) => item.label),
    ["市场概览", "资金流向", "策略信号", "热门代币", "巨鲸动态", "市场情绪"],
  );
  assert.match(
    module.buildAIClawPrompt("signal", { symbol: "BTC", direction: "long", score: 78 }),
    /BTC.*看多.*78/,
  );
  assert.equal(module.buildAIClawPrompt("signal"), "解读最近的 Yansir 策略信号");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("AIClaw layout contract tests passed");
