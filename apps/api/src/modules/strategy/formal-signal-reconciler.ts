import { closedCandleOpenTimesBetween, formalSignalJobKey, type FormalSignalJob } from "./closed-candle-job";

const DEFAULT_INTERVAL_SECONDS = 900;
const DEFAULT_LOOKBACK_MINUTES = 1_440;
const DEFAULT_BATCH_SIZE = 300;
const DEFAULT_RETENTION_DAYS = 7;
const COMPLETED_KEY_CHUNK_SIZE = 1_000;

export type ReconciliationStatus = {
  enabled: boolean;
  running: boolean;
  intervalSeconds: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  candidates: number;
  enqueued: number;
  duplicates: number;
  pressure: number;
  lastError: string | null;
};

type ReconciliationTargets = {
  symbols: string[];
  timeframes: FormalSignalJob["timeframe"][];
};

type CloseEvaluations = {
  getLatestPersistedCloseAt(): Promise<Date | null>;
  getEarliestIncompleteCloseAt(): Promise<Date | null>;
  findCompletedKeys(keys: string[]): Promise<Set<string>>;
  purgeFinishedBefore?(cutoff: Date): Promise<number>;
};

export type FormalSignalReconcilerOptions = {
  targets: () => Promise<ReconciliationTargets>;
  closeEvaluations: CloseEvaluations;
  enqueue: (job: FormalSignalJob) => "accepted" | "duplicate" | "pressure";
  intervalSeconds?: number;
  lookbackMinutes?: number;
  retentionDays?: number;
  batchSize?: number;
  now?: () => Date;
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearInterval?: (timer: ReturnType<typeof setInterval>) => void;
};

export class FormalSignalReconciler {
  private readonly intervalSeconds: number;
  private readonly lookbackMinutes: number;
  private readonly batchSize: number;
  private readonly retentionDays: number;
  private readonly now: () => Date;
  private readonly setIntervalFn: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (timer: ReturnType<typeof setInterval>) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialBaseline: Date | null = null;
  private status: ReconciliationStatus;

  constructor(private readonly options: FormalSignalReconcilerOptions) {
    this.intervalSeconds = positiveInteger(options.intervalSeconds, DEFAULT_INTERVAL_SECONDS);
    this.lookbackMinutes = positiveInteger(options.lookbackMinutes, DEFAULT_LOOKBACK_MINUTES);
    this.batchSize = positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
    this.retentionDays = positiveInteger(options.retentionDays, DEFAULT_RETENTION_DAYS);
    this.now = options.now ?? (() => new Date());
    this.setIntervalFn = options.setInterval ?? ((callback, delayMs) => setInterval(callback, delayMs));
    this.clearIntervalFn = options.clearInterval ?? ((timer) => clearInterval(timer));
    this.status = {
      enabled: false,
      running: false,
      intervalSeconds: this.intervalSeconds,
      lastStartedAt: null,
      lastFinishedAt: null,
      nextRunAt: null,
      candidates: 0,
      enqueued: 0,
      duplicates: 0,
      pressure: 0,
      lastError: null
    };
  }

  start(): void {
    if (this.timer) return;
    this.status = { ...this.status, enabled: true, nextRunAt: new Date(this.now().getTime() + this.intervalSeconds * 1000).toISOString() };
    this.timer = this.setIntervalFn(() => {
      void this.runOnce();
    }, this.intervalSeconds * 1000);
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) this.clearIntervalFn(this.timer);
    this.timer = null;
    this.status = { ...this.status, enabled: false, nextRunAt: null };
  }

  async runOnce(runAt = this.now()): Promise<ReconciliationStatus> {
    if (this.status.running) return this.getStatus();
    const startedAt = new Date(runAt);
    this.status = { ...this.status, running: true, lastStartedAt: startedAt.toISOString(), lastError: null };
    try {
      const latestPersistedCloseAt = await this.options.closeEvaluations.getLatestPersistedCloseAt();
      const earliestIncompleteCloseAt = await this.options.closeEvaluations.getEarliestIncompleteCloseAt();
      const baseline = this.resolveWindowStart(latestPersistedCloseAt, earliestIncompleteCloseAt, startedAt);
      const oldestKnownCloseAt = earliestIncompleteCloseAt ?? latestPersistedCloseAt;
      const recoveryWindowExceeded = oldestKnownCloseAt !== null
        && oldestKnownCloseAt.getTime() < startedAt.getTime() - this.lookbackMinutes * 60_000;
      const { symbols, timeframes } = await this.options.targets();
      const candidates = buildCandidates(symbols, timeframes, baseline, startedAt);
      const completedKeys = await this.findCompletedKeys(candidates.map((candidate) => candidate.key));
      const missingCandidates = candidates.filter((candidate) => !completedKeys.has(candidate.key)).slice(0, this.batchSize);
      let enqueued = 0;
      let duplicates = 0;
      let pressure = 0;
      for (const candidate of missingCandidates) {
        const outcome = this.options.enqueue(candidate);
        if (outcome === "accepted") enqueued += 1;
        else if (outcome === "duplicate") duplicates += 1;
        else pressure += 1;
      }
      await this.options.closeEvaluations.purgeFinishedBefore?.(
        new Date(startedAt.getTime() - this.retentionDays * 24 * 60 * 60_000)
      );
      const finishedAt = this.now();
      this.status = {
        ...this.status,
        running: false,
        lastFinishedAt: finishedAt.toISOString(),
        nextRunAt: this.status.enabled ? new Date(finishedAt.getTime() + this.intervalSeconds * 1000).toISOString() : null,
        candidates: missingCandidates.length,
        enqueued,
        duplicates,
        pressure,
        lastError: recoveryWindowExceeded ? "recovery_window_exceeded" : null
      };
    } catch (error) {
      const finishedAt = this.now();
      this.status = {
        ...this.status,
        running: false,
        lastFinishedAt: finishedAt.toISOString(),
        nextRunAt: this.status.enabled ? new Date(finishedAt.getTime() + this.intervalSeconds * 1000).toISOString() : null,
        lastError: error instanceof Error ? error.message : String(error)
      };
    }
    return this.getStatus();
  }

  getStatus(): ReconciliationStatus {
    return { ...this.status };
  }

  private resolveWindowStart(latestPersistedCloseAt: Date | null, earliestIncompleteCloseAt: Date | null, now: Date): Date {
    const lookbackFloor = new Date(now.getTime() - this.lookbackMinutes * 60_000);
    if (this.initialBaseline) return new Date(Math.max(this.initialBaseline.getTime(), lookbackFloor.getTime()));
    if (latestPersistedCloseAt || earliestIncompleteCloseAt) return lookbackFloor;
    if (!this.initialBaseline) this.initialBaseline = new Date(now);
    return new Date(Math.max(this.initialBaseline.getTime(), lookbackFloor.getTime()));
  }

  private async findCompletedKeys(keys: string[]): Promise<Set<string>> {
    const completed = new Set<string>();
    for (let index = 0; index < keys.length; index += COMPLETED_KEY_CHUNK_SIZE) {
      const found = await this.options.closeEvaluations.findCompletedKeys(keys.slice(index, index + COMPLETED_KEY_CHUNK_SIZE));
      for (const key of found) completed.add(key);
    }
    return completed;
  }
}

function buildCandidates(
  symbols: string[],
  timeframes: FormalSignalJob["timeframe"][],
  fromExclusive: Date,
  toInclusive: Date
): FormalSignalJob[] {
  const candidates = symbols.flatMap((rawSymbol) => {
    const symbol = rawSymbol.trim().toUpperCase();
    return timeframes.flatMap((timeframe) => closedCandleOpenTimesBetween(timeframe, fromExclusive, toInclusive).map((klineOpenTime) => ({
      key: formalSignalJobKey(symbol, timeframe, klineOpenTime),
      symbol,
      timeframe,
      klineOpenTime,
      closedAt: new Date(klineOpenTime + timeframeMs(timeframe)),
      enqueuedAt: new Date(),
      source: "reconciliation" as const
    })));
  });
  return candidates.sort((left, right) => left.closedAt.getTime() - right.closedAt.getTime()
    || left.symbol.localeCompare(right.symbol)
    || left.timeframe.localeCompare(right.timeframe));
}

function timeframeMs(timeframe: FormalSignalJob["timeframe"]): number {
  const match = /^(\d+)(m|h)$/.exec(timeframe);
  if (!match) throw new Error(`unsupported_formal_timeframe:${timeframe}`);
  return Number(match[1]) * (match[2] === "h" ? 60 : 1) * 60_000;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}
