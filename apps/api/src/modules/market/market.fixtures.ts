import { Candle } from "./market.types";

export const btcusdt5mFixture: Candle[] = [
  { open_time: 1710000000000, open: 60000, high: 60220, low: 59880, close: 60120, volume: 1200 },
  { open_time: 1710000300000, open: 60120, high: 60350, low: 60040, close: 60280, volume: 1410 },
  { open_time: 1710000600000, open: 60280, high: 60420, low: 60160, close: 60360, volume: 1320 },
  { open_time: 1710000900000, open: 60360, high: 60580, low: 60290, close: 60510, volume: 1650 },
  { open_time: 1710001200000, open: 60510, high: 60680, low: 60440, close: 60640, volume: 1710 },
  { open_time: 1710001500000, open: 60640, high: 60850, low: 60570, close: 60790, volume: 1840 },
  { open_time: 1710001800000, open: 60790, high: 60920, low: 60680, close: 60860, volume: 1600 },
  { open_time: 1710002100000, open: 60860, high: 61050, low: 60800, close: 61010, volume: 1920 },
  { open_time: 1710002400000, open: 61010, high: 61220, low: 60930, close: 61180, volume: 2100 },
  { open_time: 1710002700000, open: 61180, high: 61380, low: 61100, close: 61310, volume: 2260 },
  { open_time: 1710003000000, open: 61310, high: 61520, low: 61250, close: 61490, volume: 2400 },
  { open_time: 1710003300000, open: 61490, high: 61610, low: 61380, close: 61540, volume: 1980 },
  { open_time: 1710003600000, open: 61540, high: 61780, low: 61480, close: 61720, volume: 2500 },
  { open_time: 1710003900000, open: 61720, high: 61840, low: 61620, close: 61780, volume: 2160 },
  { open_time: 1710004200000, open: 61780, high: 62020, low: 61700, close: 61970, volume: 2680 },
  { open_time: 1710004500000, open: 61970, high: 62150, low: 61890, close: 62080, volume: 2740 },
  { open_time: 1710004800000, open: 62080, high: 62280, low: 62000, close: 62210, volume: 2900 },
  { open_time: 1710005100000, open: 62210, high: 62370, low: 62130, close: 62320, volume: 2550 },
  { open_time: 1710005400000, open: 62320, high: 62510, low: 62260, close: 62470, volume: 3010 },
  { open_time: 1710005700000, open: 62470, high: 62650, low: 62390, close: 62620, volume: 3180 }
];

const symbolProfiles: Record<string, { base: number; trend: number; wave: number; volume: number }> = {
  BTCUSDT: { base: 58986, trend: 126, wave: 240, volume: 3200 },
  ETHUSDT: { base: 1812, trend: 6.4, wave: 22, volume: 5200 },
  SOLUSDT: { base: 65.68, trend: 0.18, wave: 1.6, volume: 3800 },
  BCHUSDT: { base: 230.1, trend: 1.1, wave: 5.2, volume: 2800 },
  ZECUSDT: { base: 526.8, trend: 0.9, wave: 8.1, volume: 980 },
  XRPUSDT: { base: 1.36, trend: 0.004, wave: 0.025, volume: 8600 },
  ONDOUSDT: { base: 0.82, trend: 0.006, wave: 0.031, volume: 7600 },
  UBUSDT: { base: 0.1543, trend: 0.0022, wave: 0.018, volume: 12800 }
};

export function fixtureCandlesForSymbol(symbol: string, limit = 120): Candle[] {
  const normalizedSymbol = normalizeSymbol(symbol);
  const profile = symbolProfiles[normalizedSymbol] || profileFromSymbol(normalizedSymbol);
  const count = Math.max(1, Math.min(Number(limit) || 120, 500));
  const start = 1710000000000;
  const candles: Candle[] = [];

  for (let index = 0; index < count; index += 1) {
    const previousClose = candles[index - 1]?.close ?? profile.base;
    const wave = Math.sin(index / 3) * profile.wave + Math.cos(index / 7) * profile.wave * 0.55;
    const drift = profile.trend * index;
    const close = Math.max(profile.base * 0.02, profile.base + drift + wave);
    const open = previousClose;
    const high = Math.max(open, close) + profile.wave * (0.45 + (index % 5) * 0.08);
    const low = Math.max(0.0001, Math.min(open, close) - profile.wave * (0.4 + (index % 4) * 0.07));
    const volume = Math.max(1, profile.volume * (0.68 + ((index * 17) % 41) / 50));

    candles.push({
      open_time: start + index * 300000,
      open: roundMarketNumber(open),
      high: roundMarketNumber(high),
      low: roundMarketNumber(low),
      close: roundMarketNumber(close),
      volume: roundMarketNumber(volume),
      close_time: start + (index + 1) * 300000 - 1
    });
  }

  return candles;
}

function normalizeSymbol(symbol: string) {
  const value = symbol.trim().toUpperCase();
  return value.endsWith("USDT") ? value : `${value}USDT`;
}

function profileFromSymbol(symbol: string) {
  const seed = symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = seed % 2 === 0 ? (seed % 1000) / 9 + 0.08 : (seed % 20000) / 4 + 1;
  return {
    base,
    trend: base * (((seed % 7) - 2) / 900),
    wave: Math.max(base * 0.018, 0.008),
    volume: 900 + (seed % 9000)
  };
}

function roundMarketNumber(value: number) {
  if (value >= 1000) return Number(value.toFixed(2));
  if (value >= 1) return Number(value.toFixed(4));
  return Number(value.toPrecision(5));
}
