import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-market-symbol-discovery");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "market.service.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
const esbuildCommand = process.platform === "win32" ? process.execPath : esbuildBin;
const esbuildArgsPrefix = process.platform === "win32" ? [esbuildBin] : [];

execFileSync(esbuildCommand, [
  ...esbuildArgsPrefix,
  "src/modules/market/market.service.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

const { MarketService } = await import(pathToFileURL(outFile));

try {
  const market = new MarketService();
  market["fetchSpotUsdtSymbols"] = async () => { throw new Error("spot exchange info unavailable"); };
  market["fetchFuturesUsdtSymbols"] = async () => { throw new Error("futures exchange info unavailable"); };

  const compatibleSymbols = await market.getRealtimeKlineTriggerSymbols();
  assert.ok(compatibleSymbols.includes("BTCUSDT"), "existing realtime discovery must retain its fallback");
  assert.ok(compatibleSymbols.length > 20, "existing realtime fallback should remain the broad overview list");

  const strictSymbols = await market.getStrictRealtimeKlineTriggerSymbols();
  assert.deepEqual(strictSymbols, [], "strict discovery must ignore a cached overview fallback and report failure");

  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      json: async () => [
        [1784643000000, "1", "1", "1", "1", "1", 1784643299999, "1", 1, "1", "1", "0"],
        [1784643300000, "2", "2", "2", "2", "2", 1784643599999, "2", 1, "2", "2", "0"]
      ]
    };
  };
  try {
    const closedAt = 1784643300000;
    const strictKlines = await market.getStrictKlinesBefore("BTCUSDT", "5m", closedAt - 1, 180);
    assert.equal(strictKlines.source, "binance");
    assert.deepEqual(strictKlines.candles.map(({ open_time }) => open_time), [1784643000000]);
    assert.match(requestedUrls[0], /endTime=1784643299999/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
  const futuresOnlyUrls = [];
  Object.defineProperty(process, "platform", { ...platformDescriptor, value: "linux" });
  globalThis.fetch = async (url) => {
    const requestedUrl = String(url);
    futuresOnlyUrls.push(requestedUrl);
    if (requestedUrl.includes("fapi.binance.com")) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        [1784643000000, "1", "1", "1", "1", "1", 1784643299999, "1", 1, "1", "1", "0"]
      ]
    };
  };
  try {
    await assert.rejects(
      market.getStrictKlinesBefore("BTCUSDT", "5m", 1784643299999, 180),
      /authoritative_market_data_unavailable:BTCUSDT:5m/
    );
    assert.equal(futuresOnlyUrls.length, 1, "formal futures retrieval must not try the spot endpoint after a futures failure");
    assert.match(futuresOnlyUrls[0], /fapi\.binance\.com/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(process, "platform", platformDescriptor);
  }
  console.log("market symbol discovery tests passed");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
