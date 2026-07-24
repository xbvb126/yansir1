import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-alerts-delivery");
const outFile = path.join(outDir, "alerts.service.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

mkdirSync(outDir, { recursive: true });
execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/alerts/alerts.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

const USER_ID = "00000000-0000-0000-0000-000000000001";
const signal = {
  signalEventId: "00000000-0000-0000-0000-000000000099",
  symbol: "BTCUSDT",
  timeframe: "5m",
  direction: "long",
  signalType: "trend_long_signal",
  score: 90,
  title: "Reserved delivery"
};

const originalFetch = globalThis.fetch;
const previousWebhook = process.env.FEISHU_WEBHOOK_URL;
process.env.FEISHU_WEBHOOK_URL = "https://example.test/webhook";

try {
  const { AlertsService } = await import(pathToFileURL(outFile));
  const statements = [];
  const database = {
    enabled: true,
    query: async (sql) => {
      statements.push(String(sql).replace(/\s+/g, " ").trim().toLowerCase());
      if (String(sql).includes("sent_count")) return [{ sent_count: "0" }];
      return [];
    }
  };
  const users = {
    getCurrentUser: async () => ({ user: { id: USER_ID, plan: "SVIP" } }),
    getCurrentEntitlements: async () => ({
      entitlements: { plan: "SVIP", feishuAlerts: true, maxPushPerDay: 100 }
    })
  };
  const alerts = new AlertsService(database, users);

  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "ok" });
  const sent = await alerts.sendFeishu(signal, USER_ID, { timeoutMs: 20, persistDelivery: false });
  assert.equal(sent.sent, true);
  assert.equal(
    statements.some((sql) => sql.startsWith("insert into alert_deliveries")),
    false,
    "reserved Strategy sends must not race their strict finalizer with AlertsService persistence"
  );

  globalThis.fetch = async (_url, init = {}) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  const timeoutResult = await Promise.race([
    alerts.sendFeishu(signal, USER_ID, { timeoutMs: 20, persistDelivery: false }),
    new Promise((resolve) => setTimeout(() => resolve({ guardTimedOut: true }), 500))
  ]);
  assert.equal(timeoutResult.guardTimedOut, undefined, "AlertsService must abort a stalled webhook request");
  assert.equal(timeoutResult.failed, true);
  assert.match(timeoutResult.reason, /feishu_delivery_timeout:20ms/);

  console.log("alerts delivery tests passed");
} finally {
  globalThis.fetch = originalFetch;
  if (previousWebhook === undefined) delete process.env.FEISHU_WEBHOOK_URL;
  else process.env.FEISHU_WEBHOOK_URL = previousWebhook;
  rmSync(outDir, { recursive: true, force: true });
}
