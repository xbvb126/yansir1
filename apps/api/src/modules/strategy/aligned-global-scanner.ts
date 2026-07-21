import {
  nextGlobalScanSlot,
  type GlobalScanSlot,
  type GlobalScanTimeframe
} from "./global-scan-schedule";

export type GlobalScanExecutionResult = {
  scannedSymbols: number;
  matchedSignals: number;
  failedSymbols: number;
  errors: string[];
};

export type GlobalScanStatus = {
  enabled: boolean;
  running: boolean;
  lastSlotAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  lastTimeframes: GlobalScanTimeframe[];
  scannedSymbols: number;
  matchedSignals: number;
  failedSymbols: number;
  skippedOverlappingRuns: number;
  errors: string[];
};

export type AlignedGlobalScannerOptions = {
  now: () => Date;
  setTimer: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  clearTimer: (timer: unknown) => void;
  executeSlot: (slot: GlobalScanSlot) => Promise<GlobalScanExecutionResult>;
};

export class AlignedGlobalScanner {
  private activeTimer: unknown | null = null;

  private readonly status: GlobalScanStatus = {
    enabled: false,
    running: false,
    lastSlotAt: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    nextRunAt: null,
    lastTimeframes: [],
    scannedSymbols: 0,
    matchedSignals: 0,
    failedSymbols: 0,
    skippedOverlappingRuns: 0,
    errors: []
  };

  constructor(private readonly options: AlignedGlobalScannerOptions) {}

  start(): void {
    if (this.status.enabled) return;

    this.status.enabled = true;
    this.schedule();
  }

  stop(): void {
    this.status.enabled = false;
    this.status.nextRunAt = null;

    if (this.activeTimer !== null) {
      this.options.clearTimer(this.activeTimer);
      this.activeTimer = null;
    }
  }

  getStatus(): GlobalScanStatus {
    return {
      ...this.status,
      lastTimeframes: [...this.status.lastTimeframes],
      errors: [...this.status.errors]
    };
  }

  private schedule(): void {
    if (this.activeTimer !== null) {
      this.options.clearTimer(this.activeTimer);
      this.activeTimer = null;
    }

    const now = this.options.now();
    const slot = nextGlobalScanSlot(now);

    this.status.nextRunAt = slot.runAt.toISOString();
    let timer: unknown | null = null;
    timer = this.options.setTimer(
      () => {
        if (this.activeTimer === timer) this.activeTimer = null;
        return this.run(slot);
      },
      slot.runAt.getTime() - now.getTime()
    );
    this.activeTimer = timer;
  }

  private async run(slot: GlobalScanSlot): Promise<void> {
    if (!this.status.enabled) return;

    if (this.status.running) {
      this.status.skippedOverlappingRuns += 1;
      return;
    }

    this.status.running = true;
    this.status.lastSlotAt = slot.closedAt.toISOString();
    this.status.lastStartedAt = this.options.now().toISOString();
    this.status.lastTimeframes = [...slot.timeframes];

    try {
      const result = await this.options.executeSlot(slot);
      this.status.scannedSymbols = result.scannedSymbols;
      this.status.matchedSignals = result.matchedSignals;
      this.status.failedSymbols = result.failedSymbols;
      this.status.errors = [...result.errors];
    } catch (error) {
      this.status.errors = [error instanceof Error ? error.message : String(error)];
    } finally {
      this.status.running = false;
      this.status.lastFinishedAt = this.options.now().toISOString();
      if (this.status.enabled) this.schedule();
    }
  }
}
