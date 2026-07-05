import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const apiRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-market-stream");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "marketStream.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");

execFileSync(process.execPath, [
  esbuildBin,
  "src/modules/market/market-stream.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--outfile=${outFile}`
], { cwd: apiRoot, stdio: "inherit" });

const {
  buildKlineStreamUrl,
  normalizeKlineStreamRequest,
  parseKlineStreamMessage
} = await import(pathToFileURL(outFile));

assert.deepEqual(normalizeKlineStreamRequest("eth", "15m"), {
  symbol: "ETHUSDT",
  displaySymbol: "ETH",
  timeframe: "15m"
});
assert.deepEqual(normalizeKlineStreamRequest("BTCUSDT", "bad"), {
  symbol: "BTCUSDT",
  displaySymbol: "BTC",
  timeframe: "5m"
});
assert.equal(
  buildKlineStreamUrl({ symbol: "ETHUSDT", timeframe: "15m" }),
  "wss://data-stream.binance.vision/stream?streams=ethusdt%40kline_15m"
);
assert.equal(
  buildKlineStreamUrl({ symbol: "BTCUSDT", timeframe: "4h" }, "wss://example.test/ws"),
  "wss://example.test/ws?streams=btcusdt%40kline_4h"
);

const event = parseKlineStreamMessage(JSON.stringify({
  stream: "ethusdt@kline_5m",
  data: {
    e: "kline",
    E: 1783230040908,
    s: "ETHUSDT",
    k: {
      t: 1783229700000,
      T: 1783229999999,
      s: "ETHUSDT",
      i: "5m",
      o: "1765.86000000",
      c: "1764.32000000",
      h: "1766.16000000",
      l: "1764.05000000",
      v: "1696.40950000",
      x: false
    }
  }
}));
assert.equal(event?.symbol, "ETHUSDT");
assert.equal(event?.displaySymbol, "ETH");
assert.equal(event?.timeframe, "5m");
assert.equal(event?.closed, false);
assert.deepEqual(event?.candle, {
  open_time: 1783229700000,
  close_time: 1783229999999,
  open: 1765.86,
  high: 1766.16,
  low: 1764.05,
  close: 1764.32,
  volume: 1696.4095
});
assert.equal(parseKlineStreamMessage("{bad json"), null);
assert.equal(parseKlineStreamMessage(JSON.stringify({ data: { e: "ticker" } })), null);

rmSync(outDir, { recursive: true, force: true });
console.log("market stream tests passed");
