import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..", "..");
const webRoot = path.resolve(testDir, "..");
const outDir = path.join(testDir, ".tmp-kline-realtime");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "klineRealtime.mjs");
const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");

execFileSync(process.execPath, [
  esbuildBin,
  "src/features/klineLab/klineRealtime.ts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  `--outfile=${outFile}`
], { cwd: webRoot, stdio: "inherit" });

const {
  buildBinanceKlineStreamUrl,
  KLINE_TIMEFRAME_MS,
  mergeKlineCandles,
  mergeLivePriceIntoCandles,
  parseBinanceKlineStreamEvent,
  parseYansirKlineStreamEvent,
  parseMarketPrice
} = await import(pathToFileURL(outFile));

function candle(index, close) {
  const openTime = 1700000000000 + index * KLINE_TIMEFRAME_MS["5m"];
  return {
    open_time: openTime,
    close_time: openTime + KLINE_TIMEFRAME_MS["5m"] - 1,
    open: close - 1,
    high: close + 0.5,
    low: close - 1.5,
    close,
    volume: 1000 + index
  };
}

const baseCandles = [candle(0, 100), candle(1, 102)];

const sameCandle = mergeLivePriceIntoCandles(baseCandles, 104, "5m", baseCandles[1].open_time + 120000);
assert.equal(sameCandle.length, 2);
assert.equal(sameCandle[1].close, 104);
assert.equal(sameCandle[1].high, 104);
assert.equal(sameCandle[1].low, 100.5);
assert.equal(baseCandles[1].close, 102);

const nextCandle = mergeLivePriceIntoCandles(baseCandles, 99, "5m", baseCandles[1].open_time + KLINE_TIMEFRAME_MS["5m"] + 5000);
assert.equal(nextCandle.length, 3);
assert.equal(nextCandle[2].open_time, baseCandles[1].open_time + KLINE_TIMEFRAME_MS["5m"]);
assert.equal(nextCandle[2].open, 102);
assert.equal(nextCandle[2].close, 99);
assert.equal(nextCandle[2].high, 102);
assert.equal(nextCandle[2].low, 99);

const merged = mergeKlineCandles(baseCandles, [
  { ...candle(1, 105), volume: 2000 },
  candle(2, 106)
], 2);
assert.deepEqual(merged.map((item) => item.open_time), [baseCandles[1].open_time, baseCandles[1].open_time + KLINE_TIMEFRAME_MS["5m"]]);
assert.equal(merged[0].close, 105);
assert.equal(merged[0].volume, 2000);

assert.equal(parseMarketPrice("$1,234.50"), 1234.5);
assert.equal(parseMarketPrice("--"), null);
assert.equal(parseMarketPrice(null), null);

assert.equal(
  buildBinanceKlineStreamUrl("eth", "15m"),
  "wss://stream.binance.com:9443/stream?streams=ethusdt%40kline_15m"
);
assert.equal(
  buildBinanceKlineStreamUrl("BTCUSDT", "bad", "wss://example.test/ws"),
  "wss://example.test/ws?streams=btcusdt%40kline_5m"
);

const streamEvent = parseBinanceKlineStreamEvent({
  stream: "ethusdt@kline_5m",
  data: {
    e: "kline",
    s: "ETHUSDT",
    k: {
      t: 1700000600000,
      T: 1700000899999,
      s: "ETHUSDT",
      i: "5m",
      o: "1800.10",
      h: "1812.20",
      l: "1798.50",
      c: "1809.70",
      v: "423.12",
      x: false
    }
  }
});
assert.equal(streamEvent?.symbol, "ETH");
assert.equal(streamEvent?.timeframe, "5m");
assert.equal(streamEvent?.closed, false);
assert.deepEqual(streamEvent?.candle, {
  open_time: 1700000600000,
  close_time: 1700000899999,
  open: 1800.1,
  high: 1812.2,
  low: 1798.5,
  close: 1809.7,
  volume: 423.12
});
assert.equal(parseBinanceKlineStreamEvent({ data: { e: "ticker" } }), null);
const proxiedEvent = parseYansirKlineStreamEvent(JSON.stringify({
  symbol: "ETHUSDT",
  displaySymbol: "ETH",
  timeframe: "5m",
  source: "binance-spot-stream",
  closed: false,
  candle: {
    open_time: 1700000600000,
    close_time: 1700000899999,
    open: 1800.1,
    high: 1812.2,
    low: 1798.5,
    close: 1809.7,
    volume: 423.12
  }
}));
assert.equal(proxiedEvent?.symbol, "ETH");
assert.equal(proxiedEvent?.timeframe, "5m");
assert.equal(proxiedEvent?.source, "binance-spot-stream");
assert.equal(proxiedEvent?.candle.close, 1809.7);
assert.equal(parseYansirKlineStreamEvent("{bad json"), null);
assert.equal(parseYansirKlineStreamEvent(JSON.stringify({ symbol: "ETH", timeframe: "bad", candle: {} })), null);

rmSync(outDir, { recursive: true, force: true });
console.log("kline realtime tests passed");
