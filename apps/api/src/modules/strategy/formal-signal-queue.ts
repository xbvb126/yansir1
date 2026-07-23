import type { FormalSignalJob } from "./closed-candle-job";
import type { FormalSignalExecution } from "./strategy.service";

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_CONCURRENCY = 16;
const MAX_LATENCY_SAMPLES = 1_000;

export type FormalQueueStatus = {
  capacity: number;
  concurrency: number;
  depth: number;
  activeWorkers: number;
  oldestQueuedAt: string | null;
  accepted: number;
  duplicates: number;
  pressureRejected: number;
  completed: number;
  failed: number;
  latencyMs: {
    p50: number | null;
    p95: number | null;
  };
};

export type FormalSignalQueueOptions = {
  execute: (job: FormalSignalJob, reportPersistence: (completedAt: Date) => void) => Promise<FormalSignalExecution>;
  onPressure?: (job: FormalSignalJob) => void;
  onFailure?: (job: FormalSignalJob, error: Error) => void;
  capacity?: number;
  concurrency?: number;
};

export class FormalSignalQueue {
  private readonly execute: (job: FormalSignalJob, reportPersistence: (completedAt: Date) => void) => Promise<FormalSignalExecution>;
  private readonly onPressure?: (job: FormalSignalJob) => void;
  private readonly onFailure?: (job: FormalSignalJob, error: Error) => void;
  private readonly pendingKeys = new Set<string>();
  private readonly activeLanes = new Set<string>();
  private readonly queue: FormalSignalJob[] = [];
  private readonly latencySamples: number[] = [];
  private activeWorkers = 0;
  private accepted = 0;
  private duplicates = 0;
  private pressureRejected = 0;
  private completed = 0;
  private failed = 0;
  private stopped = false;
  private readonly capacity: number;
  private readonly concurrency: number;

  constructor(options: FormalSignalQueueOptions) {
    this.execute = options.execute;
    this.onPressure = options.onPressure;
    this.onFailure = options.onFailure;
    this.capacity = normalizePositiveInteger(options.capacity ?? process.env.STRATEGY_FORMAL_QUEUE_CAPACITY, DEFAULT_CAPACITY);
    this.concurrency = normalizePositiveInteger(options.concurrency ?? process.env.STRATEGY_REALTIME_CONCURRENCY, DEFAULT_CONCURRENCY);
  }

  enqueue(job: FormalSignalJob): "accepted" | "duplicate" | "pressure" {
    if (this.pendingKeys.has(job.key)) {
      this.duplicates += 1;
      return "duplicate";
    }
    if (this.stopped || this.pendingKeys.size >= this.capacity) {
      this.pressureRejected += 1;
      try {
        this.onPressure?.(job);
      } catch {
        // Reconciliation remains available even if an optional observer fails.
      }
      return "pressure";
    }

    this.pendingKeys.add(job.key);
    this.queue.push(job);
    this.accepted += 1;
    this.drain();
    return "accepted";
  }

  getStatus(): FormalQueueStatus {
    const sortedLatencies = [...this.latencySamples].sort((left, right) => left - right);
    return {
      capacity: this.capacity,
      concurrency: this.concurrency,
      depth: this.queue.length,
      activeWorkers: this.activeWorkers,
      oldestQueuedAt: oldestQueuedAt(this.queue),
      accepted: this.accepted,
      duplicates: this.duplicates,
      pressureRejected: this.pressureRejected,
      completed: this.completed,
      failed: this.failed,
      latencyMs: {
        p50: percentile(sortedLatencies, 0.5),
        p95: percentile(sortedLatencies, 0.95)
      }
    };
  }

  stop(): void {
    this.stopped = true;
    for (const job of this.queue) this.pendingKeys.delete(job.key);
    this.queue.length = 0;
  }

  private drain() {
    while (!this.stopped && this.activeWorkers < this.concurrency) {
      const nextIndex = this.nextRunnableIndex();
      if (nextIndex < 0) return;
      const [job] = this.queue.splice(nextIndex, 1);
      this.activeWorkers += 1;
      this.activeLanes.add(laneKey(job));
      void this.run(job);
    }
  }

  private async run(job: FormalSignalJob) {
    let settled = false;
    let persistenceReported = false;
    const reportPersistence = (completedAt: Date) => {
      if (settled || persistenceReported) return;
      persistenceReported = true;
      this.recordLatency(job, completedAt);
    };
    try {
      const execution = await this.execute(job, reportPersistence);
      if (execution.status === "completed") {
        this.completed += 1;
      } else if (execution.status === "failed") {
        this.failed += 1;
      }
    } catch (error) {
      this.failed += 1;
      try {
        this.onFailure?.(job, toError(error));
      } catch {
        // Failure observers must not break queue cleanup.
      }
    } finally {
      settled = true;
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this.activeLanes.delete(laneKey(job));
      this.pendingKeys.delete(job.key);
      this.drain();
    }
  }

  private recordLatency(job: FormalSignalJob, completedAt: Date) {
    const duration = Math.max(0, completedAt.getTime() - job.closedAt.getTime());
    this.latencySamples.push(duration);
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) this.latencySamples.shift();
  }

  private nextRunnableIndex() {
    let selectedIndex = -1;
    for (let index = 0; index < this.queue.length; index += 1) {
      const job = this.queue[index];
      if (this.activeLanes.has(laneKey(job))) continue;
      if (selectedIndex < 0 || compareFormalJobs(job, this.queue[selectedIndex]) < 0) selectedIndex = index;
    }
    return selectedIndex;
  }
}

function laneKey(job: FormalSignalJob) {
  return `${job.symbol}:${job.timeframe}`;
}

function compareFormalJobs(left: FormalSignalJob, right: FormalSignalJob) {
  return left.closedAt.getTime() - right.closedAt.getTime()
    || left.symbol.localeCompare(right.symbol)
    || left.timeframe.localeCompare(right.timeframe)
    || left.klineOpenTime - right.klineOpenTime
    || left.key.localeCompare(right.key);
}

function oldestQueuedAt(jobs: FormalSignalJob[]) {
  if (!jobs.length) return null;
  return new Date(Math.min(...jobs.map((job) => job.enqueuedAt.getTime()))).toISOString();
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizePositiveInteger(value: number | string | undefined, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.trunc(numeric));
}

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}
