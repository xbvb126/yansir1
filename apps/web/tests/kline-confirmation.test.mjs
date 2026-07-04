import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const webRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "klineConfirmation.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");

execFileSync(process.execPath, [
  esbuildBin,
  "src/features/klineLab/klineConfirmation.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--outfile=${outFile}`
], { cwd: webRoot, stdio: "inherit" });

const {
  classifyKlineSignal,
  normalizeLabSymbol,
  normalizeLabTimeframe
} = await import(pathToFileURL(outFile));

function candle(index, open, high, low, close) {
  return {
    open_time: 1700000000000 + index * 300000,
    close_time: 1700000000000 + (index + 1) * 300000 - 1,
    open,
    high,
    low,
    close,
    volume: 1000 + index
  };
}

function upCandles() {
  return [
    candle(0, 100, 101, 99, 100.4),
    candle(1, 100.4, 102, 100, 101.5),
    candle(2, 101.4, 103, 101, 102.4),
    candle(3, 102.5, 104, 102.2, 103.5),
    candle(4, 103.4, 105, 103.1, 104.6),
    candle(5, 104.8, 106.5, 104.5, 106.1),
    candle(6, 106.0, 107.2, 105.8, 106.9),
    candle(7, 107.0, 108.4, 106.9, 108.1),
    candle(8, 108.2, 109.8, 108, 109.4),
    candle(9, 109.5, 111.2, 109.3, 110.9),
    candle(10, 110.8, 112.5, 110.6, 112.1),
    candle(11, 112.0, 113.4, 111.9, 113.0),
    candle(12, 113.1, 114.5, 112.8, 114.2),
    candle(13, 114.3, 115.8, 114.1, 115.5),
    candle(14, 115.6, 117.4, 115.4, 117.0),
    candle(15, 117.1, 118.6, 116.9, 118.2),
    candle(16, 118.3, 120.2, 118.1, 119.8),
    candle(17, 119.9, 121.3, 119.6, 120.9),
    candle(18, 121.0, 122.8, 120.8, 122.4),
    candle(19, 122.5, 124.0, 122.2, 123.7)
  ];
}

const confirmedLong = classifyKlineSignal({
  candles: upCandles(),
  signal: { direction: "long", price: 121.5, timeframe: "5m" }
});
assert.equal(confirmedLong.state, "confirmed");
assert.equal(confirmedLong.direction, "long");
assert.ok(confirmedLong.score >= 75);
assert.ok(confirmedLong.evidence.some((item) => item.key === "close-stability" && item.status === "pass"));

const noSignal = classifyKlineSignal({ candles: upCandles(), signal: null });
assert.equal(noSignal.state, "no-signal");
assert.equal(noSignal.score, 0);

const weakLong = classifyKlineSignal({
  candles: [
    ...upCandles().slice(0, 17),
    candle(17, 119.8, 122.8, 119.7, 120.1),
    candle(18, 120.2, 123.5, 120.0, 120.4),
    candle(19, 120.4, 124.0, 120.2, 120.6)
  ],
  signal: { direction: "long", price: 120.4, timeframe: "5m" }
});
assert.equal(weakLong.state, "warning");
assert.ok(weakLong.evidence.some((item) => item.key === "body-quality" && item.status === "fail"));

const waitingLong = classifyKlineSignal({
  candles: upCandles().slice(0, 4),
  signal: { direction: "long", price: 103.2, timeframe: "5m" }
});
assert.equal(waitingLong.state, "watch-next");

const invalidShort = classifyKlineSignal({
  candles: upCandles(),
  signal: { direction: "short", price: 116.2, timeframe: "5m" }
});
assert.equal(invalidShort.state, "invalidated");

assert.equal(normalizeLabSymbol("btcusdt"), "BTC");
assert.equal(normalizeLabSymbol(" eth "), "ETH");
assert.equal(normalizeLabTimeframe("15m"), "15m");
assert.equal(normalizeLabTimeframe("bad"), "5m");

rmSync(outDir, { recursive: true, force: true });
console.log("kline confirmation tests passed");
