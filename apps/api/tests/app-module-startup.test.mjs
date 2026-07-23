import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, ["-e", "require('./dist/modules/app.module.js')"], {
  cwd: apiRoot,
  encoding: "utf8"
});

assert.equal(result.status, 0, result.stderr || "compiled AppModule must load under the supported CommonJS runtime");
console.log("app module startup tests passed");
