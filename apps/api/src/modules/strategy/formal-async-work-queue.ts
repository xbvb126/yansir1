const DEFAULT_CAPACITY = 10_000;
const DEFAULT_CONCURRENCY = 16;
const MAX_LATENCY_SAMPLES = 1_000;

export type FormalAsyncWork = {
  key: string;
  closedAt: Date;
  enqueuedAt: Date;
  execute: () => Promise<void>;
};

export type FormalAsyncWorkQueueStatus = {
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
  latestCompletedAt: string | null;
  latestFailure: { at: string; key: string; error: string } | null;
  latencyMs: {
    p50: number | null;
    p95: number | null;
  };
};

export type FormalAsyncWorkQueueOptions = {
  capacity?: number | string;
  concurrency?: number | string;
};

export class FormalAsyncWorkQueue {
  private readonly pendingWork = new Map<string, FormalAsyncWork>();
  private readonly queue: FormalAsyncWork[] = [];
  private readonly latencySamples: number[] = [];
  private readonly capacity: number;
  private readonly concurrency: number;
  private activeWorkers = 0;
  private accepted = 0;
  private duplicates = 0;
  private pressureRejected = 0;
  private completed = 0;
  private failed = 0;
  private latestCompletedAt: string | null = null;
  private latestFailure: { at: string; key: string; error: string } | null = null;
  private stopped = false;

  constructor(options: FormalAsyncWorkQueueOptions = {}) {
    this.capacity = positiveInteger(options.capacity, DEFAULT_CAPACITY);
    this.concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY);
  }

  enqueue(work: FormalAsyncWork): "accepted" | "duplicate" | "pressure" {
    if (this.pendingWork.has(work.key)) {
      this.duplicates += 1;
      return "duplicate";
    }
    if (this.stopped || this.pendingWork.size >= this.capacity) {
      this.pressureRejected += 1;
      return "pressure";
    }
    this.pendingWork.set(work.key, work);
    this.queue.push(work);
    this.accepted += 1;
    this.drain();
    return "accepted";
  }

  getStatus(): FormalAsyncWorkQueueStatus {
    const sortedLatencies = [...this.latencySamples].sort((left, right) => left - right);
    return {
      capacity: this.capacity,
      concurrency: this.concurrency,
      depth: this.queue.length,
      activeWorkers: this.activeWorkers,
      oldestQueuedAt: this.pendingWork.size
        ? new Date(Math.min(...Array.from(this.pendingWork.values(), (work) => work.enqueuedAt.getTime()))).toISOString()
        : null,
      accepted: this.accepted,
      duplicates: this.duplicates,
      pressureRejected: this.pressureRejected,
      completed: this.completed,
      failed: this.failed,
      latestCompletedAt: this.latestCompletedAt,
      latestFailure: this.latestFailure ? { ...this.latestFailure } : null,
      latencyMs: {
        p50: percentile(sortedLatencies, 0.5),
        p95: percentile(sortedLatencies, 0.95)
      }
    };
  }

  stop(): void {
    this.stopped = true;
    for (const work of this.queue) this.pendingWork.delete(work.key);
    this.queue.length = 0;
  }

  private drain() {
    while (!this.stopped && this.activeWorkers < this.concurrency && this.queue.length) {
      const work = this.queue.shift();
      if (!work) return;
      this.activeWorkers += 1;
      void this.run(work);
    }
  }

  private async run(work: FormalAsyncWork) {
    try {
      await work.execute();
      const completedAt = new Date();
      this.completed += 1;
      this.latestCompletedAt = completedAt.toISOString();
      this.latencySamples.push(Math.max(0, completedAt.getTime() - work.closedAt.getTime()));
      if (this.latencySamples.length > MAX_LATENCY_SAMPLES) this.latencySamples.shift();
    } catch (error) {
      const at = new Date().toISOString();
      this.failed += 1;
      this.latestFailure = {
        at,
        key: work.key,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      this.pendingWork.delete(work.key);
      this.drain();
    }
  }
}

function positiveInteger(value: number | string | undefined, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}
