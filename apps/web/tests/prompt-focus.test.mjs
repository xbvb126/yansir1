import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-prompt-focus");
const outfile = path.join(outDir, "prompt-focus.mjs");
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

mkdirSync(outDir, { recursive: true });

try {
  execFileSync(process.execPath, [
    esbuildBin,
    "src/features/portal/promptFocus.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outfile}`,
  ], { cwd: root });

  const { closePromptAndRestoreFocus } = await import(pathToFileURL(outfile));
  const events = [];
  closePromptAndRestoreFocus(
    () => events.push("close"),
    { focus: () => events.push("focus") },
  );
  assert.deepEqual(events, ["close", "focus"], "closing a prompt must return focus to its trigger");

  assert.doesNotThrow(() => closePromptAndRestoreFocus(() => events.push("close-without-target"), null));

  const shell = readFileSync(path.join(root, "src/components/AppShell.tsx"), "utf8");
  assert.match(shell, /capturePromptTrigger/);
  assert.match(shell, /closePromptAndRestoreFocus\(onClose, returnFocusTarget\)/);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("prompt focus restoration tests passed");
