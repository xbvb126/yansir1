export const GLOBAL_SCAN_GRACE_MS = 5_000;

export type GlobalScanTimeframe = "5m" | "15m" | "30m" | "1h" | "4h";

export type GlobalScanSlot = {
  key: string;
  closedAt: Date;
  runAt: Date;
  timeframes: GlobalScanTimeframe[];
};

export function timeframesForClosedSlot(closedAt: Date): GlobalScanTimeframe[] {
  const minute = closedAt.getUTCMinutes();
  const hour = closedAt.getUTCHours();
  const result: GlobalScanTimeframe[] = ["5m"];

  if (minute % 15 === 0) result.push("15m");
  if (minute % 30 === 0) result.push("30m");
  if (minute === 0) result.push("1h");
  if (minute === 0 && hour % 4 === 0) result.push("4h");

  return result;
}

export function nextGlobalScanSlot(now: Date): GlobalScanSlot {
  const currentClosedAtMs = Math.floor(now.getTime() / 300_000) * 300_000;
  const currentRunAtMs = currentClosedAtMs + GLOBAL_SCAN_GRACE_MS;
  const closedAtMs = now.getTime() < currentRunAtMs ? currentClosedAtMs : currentClosedAtMs + 300_000;
  const closedAt = new Date(closedAtMs);

  return {
    key: closedAt.toISOString(),
    closedAt,
    runAt: new Date(closedAtMs + GLOBAL_SCAN_GRACE_MS),
    timeframes: timeframesForClosedSlot(closedAt)
  };
}
