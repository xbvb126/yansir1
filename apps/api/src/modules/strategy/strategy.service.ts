import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WebSocket as WsWebSocket } from "ws";
import { AlertsService } from "../alerts/alerts.service";
import { DatabaseService, DatabaseTransaction } from "../database/database.service";
import { MarketService } from "../market/market.service";
import { Candle, MarketKlinesResult } from "../market/market.types";
import { SignalsService } from "../signals/signals.service";
import { UserEntitlements } from "../users/entitlements";
import { UsersService } from "../users/users.service";
import { AlertDirection, AlertRuleDto } from "./dto/alert-rule.dto";
import { AlignedGlobalScanner } from "./aligned-global-scanner";
import { CloseEvaluationRepository, type CloseEvaluationReservation } from "./close-evaluation.repository";
import { FormalSignalJob, formalSignalJobFromClosedKline, formalSignalJobKey } from "./closed-candle-job";
import { FormalSignalQueue } from "./formal-signal-queue";
import { FormalSignalReconciler } from "./formal-signal-reconciler";
import { FormalDeliveryRetry, type FormalDeliveryRetryCandidate } from "./formal-delivery-retry";
import { FormalAsyncWorkQueue } from "./formal-async-work-queue";
import {
  FORMAL_STRATEGY_VERSION,
  PUBLIC_FORMAL_SIGNAL_DELAY_HOURS,
  PUBLIC_FORMAL_SIGNAL_HISTORY_DAYS,
  PUBLIC_FORMAL_SIGNAL_TIMEFRAMES
} from "./formal-signal-policy";
import { GlobalScanSlot } from "./global-scan-schedule";
import {
  StrategyRunPayload,
  StrategyRealtimePayload,
  StrategyRunResult,
  StrategySchedulePayload,
  StrategyScanPayload,
  StrategyClient
} from "./strategy.client";

const DEFAULT_SCAN_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TONUSDT", "TRXUSDT", "DOTUSDT", "BCHUSDT", "LTCUSDT", "UNIUSDT", "ARBUSDT", "OPUSDT", "APTUSDT", "SUIUSDT", "FILUSDT"];
const DEFAULT_STRATEGY_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h"];
const MAX_SCAN_SYMBOLS = 600;
const MAX_SCAN_TIMEFRAMES = 5;
const DEFAULT_SCHEDULE_INTERVAL_SECONDS = 300;
const MIN_SCHEDULE_INTERVAL_SECONDS = 30;
const MAX_SCHEDULE_INTERVAL_SECONDS = 86400;
const DEFAULT_REALTIME_STREAM_URL = "wss://data-stream.binance.vision/stream";
const PERFORMANCE_CANDLE_MS = 5 * 60_000;
const PUBLIC_LEDGER_ELIGIBILITY = [
  "se.direction in ('long', 'short')",
  "coalesce(se.signal_type, '') <> 'market_observation'"
] as const;
const DEFAULT_ALERT_RULE: Required<AlertRuleDto> = {
  symbols: ["BTCUSDT", "ETHUSDT", "XRPUSDT"],
  timeframe: "5m",
  minScore: 65,
  directions: ["long", "short"],
  cooldownMinutes: 15,
  intervalSeconds: DEFAULT_SCHEDULE_INTERVAL_SECONDS
};

type SuccessfulScanItem = {
  symbol: string;
  ok: true;
  signalCount: number;
  marketData: {
    source: string;
    candles: number;
  };
  persistence: {
    persisted: boolean;
    count: number;
  };
  result: StrategyRunResult;
};

type FailedScanItem = {
  symbol: string;
  ok: false;
  signalCount: 0;
  error: string;
};

type ScanItem = SuccessfulScanItem | FailedScanItem;
type ScanResult = Awaited<ReturnType<StrategyService["scanSymbols"]>>;
type AlertResult = Awaited<ReturnType<StrategyService["scanAndAlert"]>>;

type ScheduleState = {
  enabled: boolean;
  intervalSeconds: number;
  payload: StrategySchedulePayload;
  startedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  running: boolean;
  lastResult: AlertResult | null;
  lastError: string | null;
};

type RealtimeState = {
  enabled: boolean;
  symbols: string[];
  timeframes: string[];
  payload: StrategyRealtimePayload;
  startedAt: string | null;
  lastEventAt: string | null;
  lastSignalAt: string | null;
  lastError: string | null;
  connected: boolean;
  reconnects: number;
  recentSignals: ScanResult[];
};

export type FormalSignalExecution = {
  status: "completed" | "duplicate" | "failed";
  job: FormalSignalJob;
  signalCount: number;
  error?: string;
};

type FormalPipelineState = {
  latestSuccessfulCalculationAt: string | null;
  latestPersistenceAt: string | null;
  latestMatchedAt: string | null;
  latestPersistenceFailureAt: string | null;
  recentSuccesses: number;
  recentFailures: number;
  recentTimedOut: number;
  recentReconciled: number;
  latestFailure: { at: string; key: string; error: string } | null;
};

type FormalOutcome = {
  at: number;
  outcome: "succeeded" | "failed";
  source: FormalSignalJob["source"];
  timedOut: boolean;
};

type BinanceKlineEvent = {
  stream?: string;
  data?: {
    e?: string;
    s?: string;
    k?: {
      t: number;
      T: number;
      s: string;
      i: string;
      x: boolean;
    };
  };
};

type RuntimeWebSocket = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: () => void;
};
type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

export function resolveRuntimeWebSocketCtor(): RuntimeWebSocketConstructor | undefined {
  const GlobalWebSocket = (globalThis as unknown as { WebSocket?: RuntimeWebSocketConstructor }).WebSocket;
  return GlobalWebSocket ?? (WsWebSocket as unknown as RuntimeWebSocketConstructor);
}

export function normalizeRealtimeSymbols(symbols?: string[]) {
  return normalizeScanSymbols(symbols);
}

export function buildRealtimeStreamUrl(streams: string[], baseUrl = process.env.BINANCE_REALTIME_STREAM_URL || DEFAULT_REALTIME_STREAM_URL) {
  return `${baseUrl}?streams=${streams.join("/")}`;
}

type AlertRuleRow = {
  symbols: string[];
  timeframe: string;
  min_score: number;
  directions: AlertDirection[];
  cooldown_minutes: number;
  interval_seconds: number;
};

type WatchlistRow = {
  id: string;
  user_id: string;
  symbol: string;
  timeframes: string[];
  enabled: boolean;
  min_score: number;
  signal_scope: string;
  push_enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  disabled_at: Date | string | null;
};

type SignalEventRow = {
  id: string;
  dedupe_key: string;
  symbol: string;
  timeframe: string;
  direction: AlertDirection;
  signal_type: string | null;
  title: string | null;
  reason: string | null;
  engine: string | null;
  price: string;
  score: number;
  bar_time?: Date | string | null;
  strategy_version?: string;
  is_formal?: boolean;
  emitted_at: Date | string;
  payload: Record<string, unknown> | string | null;
  performance_entry_price: string | null;
  performance_price_15m: string | null;
  performance_price_1h: string | null;
  performance_price_4h: string | null;
  performance_price_24h: string | null;
  performance_return_5m: string | null;
  performance_return_15m: string | null;
  performance_return_1h: string | null;
  performance_return_4h: string | null;
  performance_return_24h: string | null;
  performance_max_favorable_pct: string | null;
  performance_max_adverse_pct: string | null;
  performance_outcome_status: string | null;
  performance_evaluated_until: Date | string | null;
  performance_updated_at: Date | string | null;
};

type InboxRow = SignalEventRow & {
  inbox_id: string;
  inbox_status: string;
  inbox_created_at: Date | string;
};

type PublicSignalsQuery = Record<string, string | string[] | undefined>;

type NormalizedPublicSignalsQuery = {
  page: number;
  limit: number;
  offset: number;
  symbols: string[];
  timeframes: string[];
  directions: AlertDirection[];
  signalTypes: string[];
  minScore: number | null;
  from: Date | null;
  to: Date | null;
};

type SignalEventCountRow = {
  total_count: string | number;
};

type UserPushSettingRow = {
  enabled: boolean;
  min_score: number;
  cooldown_minutes: number;
  target_encrypted: string | null;
  target_masked: string | null;
  binding_webhook_url: string | null;
};

type PerformanceEventRow = {
  id: string;
  symbol: string;
  timeframe: string;
  direction: AlertDirection;
  price: string;
  emitted_at: Date | string;
  bar_time: Date | string | null;
};

type PerformanceRunSummary = {
  startedAt: string;
  finishedAt: string;
  requestedLimit: number;
  picked: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type PerformanceState = {
  enabled: boolean;
  intervalSeconds: number;
  timerActive: boolean;
  running: boolean;
  startedAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: PerformanceRunSummary | null;
  lastError: string | null;
};

type DeliveryPreparation = {
  candidate: ReturnType<typeof eventToAlertCandidate>;
  providerTarget: {
    userId: string;
    webhookUrl: string;
  };
  entitlements: UserEntitlements;
  pushSetting: UserPushSettingRow;
  rule: Required<AlertRuleDto>;
  dailyLimit: number;
  cooldownMinutes: number;
};

type MarketDataLoadOptions = {
  strictClosedAt?: Date;
  cache?: Map<string, Promise<MarketKlinesResult>>;
  expectedFormalJob?: ExpectedFormalBar;
  formalErrorCode?: string;
};

type ExpectedFormalBar = {
  symbol: string;
  timeframe: string;
  klineOpenTime: number;
};

@Injectable()
export class StrategyService implements OnModuleInit, OnModuleDestroy {
  private lastScan: ScanResult | null = null;
  private alertRule: Required<AlertRuleDto> = DEFAULT_ALERT_RULE;
  private alertRuleByUserId = new Map<string, Required<AlertRuleDto>>();
  private lastAlertAtByKey = new Map<string, number>();
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private performanceTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeStartupTimer: ReturnType<typeof setTimeout> | null = null;
  private performanceStartupTimer: ReturnType<typeof setTimeout> | null = null;
  private realtimeSockets: RuntimeWebSocket[] = [];
  private readonly openRealtimeSockets = new Set<RuntimeWebSocket>();
  private realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private formalSignalQueue: FormalSignalQueue;
  private readonly formalMatchQueue: FormalAsyncWorkQueue;
  private readonly formalDeliveryQueue: FormalAsyncWorkQueue;
  private readonly formalSignalReconciler: FormalSignalReconciler;
  private readonly formalDeliveryRetry: FormalDeliveryRetry;
  private formalPipeline: FormalPipelineState = {
    latestSuccessfulCalculationAt: null,
    latestPersistenceAt: null,
    latestMatchedAt: null,
    latestPersistenceFailureAt: null,
    recentSuccesses: 0,
    recentFailures: 0,
    recentTimedOut: 0,
    recentReconciled: 0,
    latestFailure: null
  };
  private formalOutcomeHistory: FormalOutcome[] = [];
  private readonly userDeliveryTails = new Map<string, Promise<void>>();
  private destroyed = false;
  private realtime: RealtimeState = {
    enabled: false,
    symbols: [],
    timeframes: [],
    payload: {},
    startedAt: null,
    lastEventAt: null,
    lastSignalAt: null,
    lastError: null,
    connected: false,
    reconnects: 0,
    recentSignals: []
  };
  private schedule: ScheduleState = {
    enabled: false,
    intervalSeconds: DEFAULT_SCHEDULE_INTERVAL_SECONDS,
    payload: {},
    startedAt: null,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    running: false,
    lastResult: null,
    lastError: null
  };
  private performance: PerformanceState = {
    enabled: false,
    intervalSeconds: 600,
    timerActive: false,
    running: false,
    startedAt: null,
    lastRunAt: null,
    nextRunAt: null,
    lastResult: null,
    lastError: null
  };
  private readonly globalScanner: AlignedGlobalScanner;

  constructor(
    private readonly strategyClient: StrategyClient,
    private readonly marketService: MarketService,
    private readonly signalsService: SignalsService,
    private readonly alertsService: AlertsService,
    private readonly usersService: UsersService,
    private readonly database: DatabaseService,
    private readonly closeEvaluations: CloseEvaluationRepository
  ) {
    this.globalScanner = new AlignedGlobalScanner({
      now: () => new Date(),
      setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
      executeSlot: (slot) => this.runGlobalScanSlot(slot)
    });
    this.formalSignalQueue = this.createFormalSignalQueue();
    this.formalMatchQueue = new FormalAsyncWorkQueue({
      capacity: process.env.STRATEGY_FORMAL_MATCH_QUEUE_CAPACITY,
      concurrency: process.env.STRATEGY_FORMAL_MATCH_CONCURRENCY
    });
    this.formalDeliveryQueue = new FormalAsyncWorkQueue({
      capacity: process.env.STRATEGY_FORMAL_DELIVERY_QUEUE_CAPACITY,
      concurrency: process.env.STRATEGY_FORMAL_DELIVERY_CONCURRENCY
    });
    this.formalSignalReconciler = new FormalSignalReconciler({
      targets: async () => ({
        symbols: await this.resolveGlobalScanSymbols(),
        timeframes: DEFAULT_STRATEGY_TIMEFRAMES.map((timeframe) => timeframe as FormalSignalJob["timeframe"])
      }),
      closeEvaluations: this.closeEvaluations,
      enqueue: (job) => this.formalSignalQueue.enqueue(job)
    });
    this.formalDeliveryRetry = new FormalDeliveryRetry({
      database: this.database,
      retryDelivery: (candidate) => this.retryFormalDelivery(candidate)
    });
  }

  onModuleInit() {
    if (process.env.STRATEGY_GLOBAL_SCAN_ENABLED === "true") this.globalScanner.start();
    this.formalDeliveryRetry.start();

    this.realtimeStartupTimer = setTimeout(() => {
      this.realtimeStartupTimer = null;
      if (this.destroyed) return;
      this.startRealtimeTracking({
        timeframes: DEFAULT_STRATEGY_TIMEFRAMES,
        minScore: DEFAULT_ALERT_RULE.minScore,
        directions: DEFAULT_ALERT_RULE.directions,
        cooldownMinutes: DEFAULT_ALERT_RULE.cooldownMinutes
      }).catch((error: unknown) => {
        this.realtime = {
          ...this.realtime,
          enabled: false,
          lastError: (error as Error).message
        };
      }).finally(() => {
        if (!this.destroyed) this.formalSignalReconciler.start();
      });
    }, 1000);

    this.performanceStartupTimer = setTimeout(() => {
      this.performanceStartupTimer = null;
      if (this.destroyed) return;
      this.startPerformanceUpdater({ runImmediately: true }).catch((error: unknown) => {
        this.performance = {
          ...this.performance,
          enabled: false,
          timerActive: false,
          lastError: (error as Error).message
        };
      });
    }, 4000);
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.realtimeStartupTimer) {
      clearTimeout(this.realtimeStartupTimer);
      this.realtimeStartupTimer = null;
    }
    if (this.performanceStartupTimer) {
      clearTimeout(this.performanceStartupTimer);
      this.performanceStartupTimer = null;
    }
    this.closeRealtimeSocket(false);
    this.globalScanner.stop();
    this.formalSignalReconciler.stop();
    this.formalSignalQueue.stop();
    this.formalMatchQueue.stop();
    this.formalDeliveryQueue.stop();
    this.formalDeliveryRetry.stop();
  }

  getGlobalScanStatus() {
    return {
      scanner: this.globalScanner.getStatus(),
      reconciliation: this.formalSignalReconciler.getStatus(),
      deliveryRetry: this.formalDeliveryRetry.getStatus()
    };
  }

  private async runGlobalScanSlot(slot: GlobalScanSlot) {
    const symbols = await this.resolveGlobalScanSymbols();
    const marketDataCaches = new Map<string, Map<string, Promise<MarketKlinesResult>>>();
    const remainingJobsBySymbol = new Map(symbols.map((symbol) => [symbol, slot.timeframes.length]));
    const jobs = symbols.flatMap((symbol) => slot.timeframes.map((timeframe) => {
      const klineOpenTime = slot.closedAt.getTime() - timeframeDurationMs(timeframe);
      return {
        key: formalSignalJobKey(symbol, timeframe as FormalSignalJob["timeframe"], klineOpenTime),
        symbol,
        timeframe: timeframe as FormalSignalJob["timeframe"],
        klineOpenTime,
        closedAt: slot.closedAt,
        enqueuedAt: slot.runAt,
        source: "reconciliation" as const
      } satisfies FormalSignalJob;
    }));
    const outcomes = await mapWithConcurrency(jobs, globalScanJobConcurrency(slot.timeframes.length), async (job) => {
      const { symbol, timeframe } = job;
      let marketDataCache = marketDataCaches.get(symbol);
      if (!marketDataCache) {
        marketDataCache = new Map<string, Promise<MarketKlinesResult>>();
        marketDataCaches.set(symbol, marketDataCache);
      }
      try {
        const execution = await this.executeFormalSignalJob(
          job,
          () => undefined,
          marketDataCache,
          "unexpected_global_scan_bar_time",
          true
        );
        if (execution.status === "failed") throw new Error(execution.error ?? "formal_global_scan_failed");
        return { ok: true, matchedSignals: execution.signalCount } as const;
      } catch (error) {
        return { ok: false, error: `${symbol}:${timeframe}: ${(error as Error).message}` } as const;
      } finally {
        const remainingJobs = (remainingJobsBySymbol.get(symbol) ?? 1) - 1;
        if (remainingJobs <= 0) {
          marketDataCache.clear();
          marketDataCaches.delete(symbol);
          remainingJobsBySymbol.delete(symbol);
        } else {
          remainingJobsBySymbol.set(symbol, remainingJobs);
        }
      }
    });
    const failedSymbols = new Set<string>();
    const errors: string[] = [];
    let matchedSignals = 0;

    outcomes.forEach((outcome, index) => {
      if (outcome.ok) {
        matchedSignals += outcome.matchedSignals;
        return;
      }
      failedSymbols.add(jobs[index].symbol);
      if (errors.length < 8) errors.push(outcome.error);
    });

    return {
      scannedSymbols: symbols.length,
      matchedSignals,
      failedSymbols: failedSymbols.size,
      errors
    };
  }

  async runStrategy(payload: StrategyRunPayload, userId?: string) {
    if (userId !== undefined) await this.assertApiAccess(userId);
    return this.executeStrategy(payload);
  }

  private async executeStrategy(
    payload: StrategyRunPayload,
    marketDataOptions?: MarketDataLoadOptions,
    onCalculationComplete?: () => void
  ) {
    const enrichedPayload = await this.withMarketData(payload, marketDataOptions);
    const result = await this.strategyClient.runStrategy(enrichedPayload);
    if (marketDataOptions?.strictClosedAt) {
      assertExpectedFormalBarTime(
        result,
        marketDataOptions.expectedFormalJob ?? {
          symbol: payload.symbol,
          timeframe: payload.timeframe ?? "5m",
          klineOpenTime: marketDataOptions.strictClosedAt.getTime() - timeframeDurationMs(payload.timeframe ?? "5m")
        },
        marketDataOptions.formalErrorCode
      );
    }
    onCalculationComplete?.();

    return {
      result,
      marketData: {
        source: enrichedPayload.market_data_source ?? "request",
        candles: enrichedPayload.candles?.length ?? 0
      },
      persistence: {
        persisted: false,
        count: 0
      }
    };
  }

  private async executeFormalSignalJob(
    job: FormalSignalJob,
    reportPersistence: (completedAt: Date) => void = () => undefined,
    marketDataCache = new Map<string, Promise<MarketKlinesResult>>(),
    formalErrorCode = "unexpected_formal_bar_time",
    retryTransientTransport = false
  ): Promise<FormalSignalExecution> {
    let reservation: CloseEvaluationReservation | null = null;
    let calculationCompleted = false;
    let persistenceCompleted = false;

    try {
      reservation = await this.closeEvaluations.reserve(job);
      if (!reservation) return { status: "duplicate", job, signalCount: 0 };
      const onCalculationComplete = () => {
        calculationCompleted = true;
        this.formalPipeline = {
          ...this.formalPipeline,
          latestSuccessfulCalculationAt: new Date().toISOString()
        };
      };
      const calculate = () => withPromiseTimeout(
        this.executeStrategy(
          { symbol: job.symbol, timeframe: job.timeframe, limit: 180 },
          {
            strictClosedAt: job.closedAt,
            cache: marketDataCache,
            expectedFormalJob: job,
            formalErrorCode
          },
          onCalculationComplete
        ),
        formalStrategyTimeoutMs(),
        `formal_strategy_timeout:${job.key}`
      );
      let run;
      try {
        run = await calculate();
      } catch (error) {
        if (!retryTransientTransport || !isTransientGlobalScanTransportError(error)) throw error;
        marketDataCache.clear();
        run = await calculate();
      }
      assertExpectedFormalBarTime(run.result, job, formalErrorCode);
      const formalSignals = mapFormalStrategySignals(run.result, job);
      if (formalSignals.length) {
        const persistence = await this.signalsService.saveStrategySignals(formalSignals, { strict: true });
        if (!persistence.persisted) throw new Error("signal_persistence_unavailable");
        if (persistence.count !== formalSignals.length) {
          throw new Error(
            `signal_persistence_incomplete:expected=${formalSignals.length}:actual=${persistence.count}`
          );
        }
      }
      const persistenceCompletedAt = new Date();
      reportPersistence(persistenceCompletedAt);
      this.formalPipeline = {
        ...this.formalPipeline,
        latestPersistenceAt: persistenceCompletedAt.toISOString()
      };
      persistenceCompleted = true;

      const dedupeKeys = formalSignals.map((signal) => signal.dedupeKey);
      const matchOutcome = this.formalMatchQueue.enqueue({
        key: job.key,
        closedAt: job.closedAt,
        enqueuedAt: new Date(),
        execute: () => this.finishFormalMatching(job, reservation!.id, dedupeKeys)
      });
      if (matchOutcome === "pressure") {
        throw new Error(`formal_match_queue_${matchOutcome}:${job.key}`);
      }
      return { status: "completed", job, signalCount: formalSignals.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (reservation) {
        try {
          await this.closeEvaluations.fail(reservation.id, message, new Date());
        } catch {
          // The original execution failure remains the observable failure; reconciliation retries the ledger write.
        }
      }
      this.recordFormalFailure(job, message, calculationCompleted && !persistenceCompleted);
      return { status: "failed", job, signalCount: 0, error: message };
    }
  }

  private async finishFormalMatching(
    job: FormalSignalJob,
    reservationId: string,
    dedupeKeys: string[]
  ) {
    try {
      const events = await this.loadSignalEventsForKeys(dedupeKeys, true);
      await this.matchSignalEventsToUsers(events, {
        source: job.source,
        closedAt: job.closedAt
      });
      const matchedAt = new Date();
      await this.closeEvaluations.complete(reservationId, events.length, matchedAt);
      this.formalPipeline = {
        ...this.formalPipeline,
        latestMatchedAt: matchedAt.toISOString()
      };
      this.recordFormalSuccess(job, events.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.closeEvaluations.fail(reservationId, message, new Date());
      } catch {
        // The match queue exposes the original failure; stale running rows remain reconcilable.
      }
      this.recordFormalFailure(job, message);
      throw error;
    }
  }

  private recordFormalSuccess(job: FormalSignalJob, signalCount: number) {
    this.formalOutcomeHistory.push({
      at: Date.now(),
      outcome: "succeeded",
      source: job.source,
      timedOut: false
    });
    this.formalPipeline = {
      ...this.formalPipeline,
      recentSuccesses: Math.min(1_000, this.formalPipeline.recentSuccesses + 1),
      recentReconciled: job.source === "reconciliation"
        ? Math.min(1_000, this.formalPipeline.recentReconciled + 1)
        : this.formalPipeline.recentReconciled
    };
    if (job.source === "realtime" && signalCount) {
      this.realtime = {
        ...this.realtime,
        lastSignalAt: new Date().toISOString()
      };
    }
  }

  private recordFormalFailure(job: FormalSignalJob, error: string, persistenceFailure = false) {
    const at = new Date().toISOString();
    this.formalOutcomeHistory.push({
      at: Date.now(),
      outcome: "failed",
      source: job.source,
      timedOut: error.startsWith("formal_strategy_timeout:")
    });
    this.formalPipeline = {
      ...this.formalPipeline,
      recentFailures: Math.min(1_000, this.formalPipeline.recentFailures + 1),
      recentTimedOut: error.startsWith("formal_strategy_timeout:")
        ? Math.min(1_000, this.formalPipeline.recentTimedOut + 1)
        : this.formalPipeline.recentTimedOut,
      latestPersistenceFailureAt: persistenceFailure ? at : this.formalPipeline.latestPersistenceFailureAt,
      latestFailure: { at, key: job.key, error }
    };
    if (job.source === "realtime") this.realtime = { ...this.realtime, lastError: error };
  }

  private createFormalSignalQueue() {
    return new FormalSignalQueue({
      execute: (job, reportPersistence) => this.executeFormalSignalJob(job, reportPersistence),
      onPressure: (job) => this.recordFormalFailure(job, "formal_queue_pressure"),
      onFailure: (job, error) => this.recordFormalFailure(job, error.message)
    });
  }

  async scanSymbols(payload: StrategyScanPayload = {}, userId?: string) {
    const entitlementResponse = await this.usersService.getCurrentEntitlements(userId);
    const entitlements = entitlementResponse.entitlements;
    if (!entitlements.apiAccess) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持批量扫描 API，请升级到 SVIP。`);
    }
    const requestedSymbols = normalizeScanSymbols(payload.symbols);
    const timeframes = normalizeScanTimeframes(payload, entitlements);
    this.assertTimeframesAllowed(timeframes, entitlements);
    const allowedSymbols = requestedSymbols.slice(0, Math.min(entitlements.maxScanSymbols, MAX_SCAN_SYMBOLS));
    const quotaLimitedSymbols = allowedSymbols.slice(0, entitlements.remainingSignals);
    const startedAt = new Date().toISOString();
    const scanTasks = quotaLimitedSymbols.flatMap((symbol) =>
      timeframes.map(async (timeframe): Promise<ScanItem> => {
        try {
          const run = await this.runStrategy({ symbol, timeframe, limit: payload.limit });

          return {
            symbol,
            ok: true,
            signalCount: run.result.signals.length,
            marketData: run.marketData,
            persistence: run.persistence,
            result: run.result
          };
        } catch (error) {
          return {
            symbol,
            ok: false,
            signalCount: 0,
            error: (error as Error).message
          };
        }
      })
    );
    const results = await Promise.all(scanTasks);

    const scan = {
      startedAt,
      finishedAt: new Date().toISOString(),
      timeframe: timeframes[0],
      timeframes,
      symbols: quotaLimitedSymbols,
      permission: {
        plan: entitlements.plan,
        requestedSymbols: requestedSymbols.length,
        maxScanSymbols: entitlements.maxScanSymbols,
        remainingSignals: entitlements.remainingSignals,
        limitedBySymbols: requestedSymbols.length > allowedSymbols.length,
        limitedByQuota: allowedSymbols.length > quotaLimitedSymbols.length,
        requestedTimeframe: payload.timeframe ?? "5m",
        requestedTimeframes: payload.timeframes ?? [payload.timeframe ?? "5m"],
        timeframeAllowed: timeframes.every((timeframe) => entitlements.allowedTimeframes.includes(timeframe))
      },
      summary: {
        scanned: results.length,
        succeeded: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
        signals: results.reduce((sum, item) => sum + item.signalCount, 0)
      },
      results
    };

    this.lastScan = scan;
    return scan;
  }

  async getAlertRule(userId?: string) {
    return {
      rule: await this.currentAlertRule(userId)
    };
  }

  async updateAlertRule(payload: AlertRuleDto = {}, userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    const nextRule = normalizeAlertRule({
      ...(await this.currentAlertRule(currentUserId)),
      ...payload
    });
    this.assertAlertRuleAllowed(nextRule, entitlements);
    nextRule.minScore = Math.max(nextRule.minScore, entitlements.minAlertScore);
    this.alertRuleByUserId.set(currentUserId, nextRule);

    if (this.database.enabled) {
      await this.database.query(
        `
          insert into alert_rules (
            user_id,
            name,
            symbols,
            timeframe,
            min_score,
            directions,
            cooldown_minutes,
            interval_seconds,
            status
          )
          values ($1, 'default', $2, $3, $4, $5, $6, $7, 'active')
          on conflict (user_id, name) do update set
            symbols = excluded.symbols,
            timeframe = excluded.timeframe,
            min_score = excluded.min_score,
            directions = excluded.directions,
            cooldown_minutes = excluded.cooldown_minutes,
            interval_seconds = excluded.interval_seconds,
            status = excluded.status,
            updated_at = now()
        `,
        [
          currentUserId,
          nextRule.symbols,
          nextRule.timeframe,
          nextRule.minScore,
          nextRule.directions,
          nextRule.cooldownMinutes,
          nextRule.intervalSeconds
        ]
      );
    }

    return {
      rule: nextRule
    };
  }

  async scanAndAlert(payload: StrategyScanPayload & AlertRuleDto & { dryRun?: boolean } = {}, userId?: string) {
    const entitlementResponse = await this.usersService.getCurrentEntitlements(userId);
    const entitlements = entitlementResponse.entitlements;
    if (!entitlements.apiAccess) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持扫描告警 API，请升级到 SVIP。`);
    }
    const currentUserId = await this.currentUserId(userId);
    const rule = normalizeAlertRule({ ...(await this.currentAlertRule(currentUserId)), ...payload });
    this.assertAlertRuleAllowed(rule, entitlements);
    const scan = await this.scanSymbols({
      symbols: payload.symbols ?? rule.symbols,
      timeframe: payload.timeframe ?? rule.timeframe,
      timeframes: payload.timeframes
    }, userId);
    const minScore = Math.max(rule.minScore, entitlements.minAlertScore);
    const candidates = extractAlertCandidates(scan, minScore).filter((signal) => rule.directions.includes(signal.direction));
    const deliverableCandidates = payload.dryRun ? candidates : filterCooldownCandidates(candidates, rule, this.lastAlertAtByKey, currentUserId);

    if (!entitlements.feishuAlerts) {
      return {
        scan,
        alert: {
          dryRun: Boolean(payload.dryRun),
          blocked: true,
          reason: "当前套餐或用户飞书开关不支持信号推送。",
          minScore,
          candidates,
          rule,
          sent: 0,
          skipped: deliverableCandidates.length,
          permission: summarizeAlertPermission(entitlements)
        }
      };
    }

    if (payload.dryRun) {
      return {
        scan,
        alert: {
          dryRun: true,
          blocked: false,
          minScore,
          candidates,
          rule,
          sent: 0,
          skipped: candidates.length,
          permission: summarizeAlertPermission(entitlements)
        }
      };
    }

    const deliveries = [];
    for (const candidate of deliverableCandidates) {
      deliveries.push(await this.alertsService.sendFeishu(candidate, userId));
      this.lastAlertAtByKey.set(alertCooldownKey(candidate, currentUserId), Date.now());
    }

    return {
      scan,
      alert: {
        dryRun: false,
        blocked: false,
        minScore,
        candidates,
        suppressedByCooldown: candidates.length - deliverableCandidates.length,
        rule,
        sent: deliveries.filter((item) => Boolean((item as { sent?: boolean }).sent)).length,
        skipped: deliveries.filter((item) => Boolean((item as { skipped?: boolean }).skipped)).length + candidates.length - deliverableCandidates.length,
        deliveries,
        permission: summarizeAlertPermission(entitlements)
      }
    };
  }

  async getUserWatchlist(userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    const rows = await this.loadUserWatchlists(currentUserId, true);
    return {
      watchlist: rows.map(mapWatchlistRow),
      limits: watchlistLimitSummary(entitlements, rows)
    };
  }

  async updateUserWatchlist(payload: { items?: Array<{ symbol?: string; timeframes?: string[]; enabled?: boolean; minScore?: number; signalScope?: string; pushEnabled?: boolean }> } = {}, userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    const items = (payload.items ?? []).map((item) => normalizeWatchlistInput(item, entitlements)).filter((item) => item.symbol);
    this.assertWatchlistAllowed(items, entitlements);

    if (this.database.enabled) {
      const existingRows = await this.loadUserWatchlists(currentUserId, true);
      this.assertWatchlistCapacity(existingRows, items, entitlements);
      for (const item of items) {
        await this.database.query(
          `
            insert into watchlists (user_id, symbol, market, enabled, timeframes, min_score, signal_scope, push_enabled, disabled_at)
            values ($1, $2, 'futures', $3, $4, $5, $6, $7, case when $3 then null else now() end)
            on conflict (user_id, symbol, market) do update set
              enabled = excluded.enabled,
              timeframes = excluded.timeframes,
              min_score = excluded.min_score,
              signal_scope = excluded.signal_scope,
              push_enabled = excluded.push_enabled,
              disabled_at = case when excluded.enabled then null else coalesce(watchlists.disabled_at, now()) end,
              updated_at = now()
          `,
          [currentUserId, item.symbol, item.enabled, item.timeframes, item.minScore, item.signalScope, item.pushEnabled]
        );
      }
    }
    return this.getUserWatchlist(currentUserId);
  }

  async getUserSignalInbox(userId?: string, query: PublicSignalsQuery = {}) {
    const currentUserId = await this.currentUserId(userId);
    const entitlements = (await this.usersService.getCurrentEntitlements(currentUserId)).entitlements;
    const filters = normalizePublicSignalsQuery(query);
    const mode = normalizeInboxMode(query.mode ?? query.scope);
    if (!this.database.enabled) {
      return {
        signals: [],
        source: "memory",
        mode,
        access: signalAccessSummary(entitlements),
        filters: publicSignalFiltersResponse(filters),
        pagination: publicSignalPagination(filters, 0)
      };
    }

    const params: Array<string | string[] | AlertDirection[] | number | Date> = [currentUserId];
    const where = ["inbox.user_id = $1::uuid", "se.is_formal = true"];
    params.push(entitlements.allowedTimeframes);
    where.push(`se.timeframe = any($${params.length}::varchar[])`);
    if (entitlements.formalSignalAccess === "delayed" && entitlements.formalSignalDelayHours > 0) {
      params.push(entitlements.formalSignalDelayHours);
      where.push(`se.emitted_at <= now() - ($${params.length}::integer * interval '1 hour')`);
    }
    if (entitlements.formalSignalHistoryDays > 0) {
      params.push(entitlements.formalSignalHistoryDays);
      where.push(`se.emitted_at >= now() - ($${params.length}::integer * interval '1 day')`);
    }
    if (mode === "current") {
      where.push(`exists (
        select 1
        from watchlists wl
        where wl.user_id = inbox.user_id
          and wl.enabled = true
          and wl.symbol = se.symbol
          and se.timeframe = any(wl.timeframes)
      )`);
    }
    if (filters.symbols.length) {
      params.push(filters.symbols);
      where.push(`se.symbol = any($${params.length}::varchar[])`);
    }
    if (filters.timeframes.length) {
      params.push(filters.timeframes);
      where.push(`se.timeframe = any($${params.length}::varchar[])`);
    }
    if (filters.directions.length) {
      params.push(filters.directions);
      where.push(`se.direction = any($${params.length}::varchar[])`);
    }
    if (filters.signalTypes.length) {
      params.push(filters.signalTypes);
      where.push(`se.signal_type = any($${params.length}::varchar[])`);
    }
    if (filters.minScore !== null) {
      params.push(filters.minScore);
      where.push(`se.score >= $${params.length}::integer`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`se.emitted_at >= $${params.length}::timestamptz`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`se.emitted_at <= $${params.length}::timestamptz`);
    }

    const whereSql = where.join(" and ");
    const countRows = await this.database.query<SignalEventCountRow>(
      `
        select count(*)::text as total_count
        from user_signal_inbox inbox
        join signal_events se on se.id = inbox.signal_event_id
        where ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total_count ?? 0);
    const rows = await this.database.query<InboxRow>(
      `
        select
          inbox.id::text as inbox_id,
          inbox.status as inbox_status,
          inbox.created_at as inbox_created_at,
          se.id::text as id,
          se.symbol,
          se.timeframe,
          se.direction,
          se.signal_type,
          se.title,
          se.reason,
          se.engine,
          se.price::text,
          se.score,
          se.emitted_at,
          se.payload,
          sp.entry_price::text as performance_entry_price,
          sp.price_15m::text as performance_price_15m,
          sp.price_1h::text as performance_price_1h,
          sp.price_4h::text as performance_price_4h,
          sp.price_24h::text as performance_price_24h,
          sp.return_5m::text as performance_return_5m,
          sp.return_15m::text as performance_return_15m,
          sp.return_1h::text as performance_return_1h,
          sp.return_4h::text as performance_return_4h,
          sp.return_24h::text as performance_return_24h,
          coalesce(sp.max_favorable_pct, sp.max_favorable_excursion)::text as performance_max_favorable_pct,
          coalesce(sp.max_adverse_pct, sp.max_adverse_excursion)::text as performance_max_adverse_pct,
          sp.outcome_status as performance_outcome_status,
          sp.evaluated_until as performance_evaluated_until,
          sp.updated_at as performance_updated_at
        from user_signal_inbox inbox
        join signal_events se on se.id = inbox.signal_event_id
        left join signal_performance sp on sp.signal_event_id = se.id
        where ${whereSql}
        order by se.emitted_at desc, inbox.created_at desc, se.id desc
        limit $${params.length + 1}::integer
        offset $${params.length + 2}::integer
      `,
      [...params, filters.limit, filters.offset]
    );

    return {
      signals: rows.map((row) => mapInboxRow(row, entitlements)),
      source: "user_signal_inbox",
      mode,
      access: signalAccessSummary(entitlements),
      filters: publicSignalFiltersResponse(filters),
      pagination: publicSignalPagination(filters, total)
    };
  }

  async getGlobalSignalEvents(userId?: string, query: PublicSignalsQuery = {}) {
    const entitlements = (await this.usersService.getCurrentEntitlements(userId)).entitlements;
    const filters = normalizePublicSignalsQuery(query);
    if (!this.database.enabled) {
      return {
        signals: [],
        source: "global_signal_events",
        mode: "global",
        access: signalAccessSummary(entitlements),
        filters: publicSignalFiltersResponse(filters),
        pagination: publicSignalPagination(filters, 0)
      };
    }

    const where: string[] = ["se.is_formal = true"];
    const params: Array<string[] | AlertDirection[] | number | Date> = [];
    if (entitlements.allowedTimeframes.length) {
      params.push(entitlements.allowedTimeframes);
      where.push(`se.timeframe = any($${params.length}::varchar[])`);
    }
    if (entitlements.formalSignalAccess === "delayed" && entitlements.formalSignalDelayHours > 0) {
      params.push(entitlements.formalSignalDelayHours);
      where.push(`se.emitted_at <= now() - ($${params.length}::integer * interval '1 hour')`);
    }
    if (entitlements.formalSignalHistoryDays > 0) {
      params.push(entitlements.formalSignalHistoryDays);
      where.push(`se.emitted_at >= now() - ($${params.length}::integer * interval '1 day')`);
    }
    if (filters.symbols.length) {
      params.push(filters.symbols);
      where.push(`se.symbol = any($${params.length}::varchar[])`);
    }
    if (filters.timeframes.length) {
      params.push(filters.timeframes);
      where.push(`se.timeframe = any($${params.length}::varchar[])`);
    }
    if (filters.directions.length) {
      params.push(filters.directions);
      where.push(`se.direction = any($${params.length}::varchar[])`);
    }
    if (filters.signalTypes.length) {
      params.push(filters.signalTypes);
      where.push(`se.signal_type = any($${params.length}::varchar[])`);
    }
    if (filters.minScore !== null) {
      params.push(filters.minScore);
      where.push(`se.score >= $${params.length}::integer`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`se.emitted_at >= $${params.length}::timestamptz`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`se.emitted_at <= $${params.length}::timestamptz`);
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";
    const countRows = await this.database.query<SignalEventCountRow>(
      `select count(*)::text as total_count from signal_events se ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total_count ?? 0);
    const rows = await this.database.query<SignalEventRow>(
      `
        select
          se.id::text,
          se.symbol,
          se.timeframe,
          se.direction,
          se.signal_type,
          se.title,
          se.reason,
          se.engine,
          se.price::text,
          se.score,
          se.emitted_at,
          se.payload,
          sp.entry_price::text as performance_entry_price,
          sp.price_15m::text as performance_price_15m,
          sp.price_1h::text as performance_price_1h,
          sp.price_4h::text as performance_price_4h,
          sp.price_24h::text as performance_price_24h,
          sp.return_5m::text as performance_return_5m,
          sp.return_15m::text as performance_return_15m,
          sp.return_1h::text as performance_return_1h,
          sp.return_4h::text as performance_return_4h,
          sp.return_24h::text as performance_return_24h,
          coalesce(sp.max_favorable_pct, sp.max_favorable_excursion)::text as performance_max_favorable_pct,
          coalesce(sp.max_adverse_pct, sp.max_adverse_excursion)::text as performance_max_adverse_pct,
          sp.outcome_status as performance_outcome_status,
          sp.evaluated_until as performance_evaluated_until,
          sp.updated_at as performance_updated_at
        from signal_events se
        left join signal_performance sp on sp.signal_event_id = se.id
        ${whereSql}
        order by se.emitted_at desc, se.id desc
        limit $${params.length + 1}::integer
        offset $${params.length + 2}::integer
      `,
      [...params, filters.limit, filters.offset]
    );

    return {
      signals: rows.map((row) => mapSignalEventRow(row, entitlements.signalOutcomes)),
      source: "global_signal_events",
      mode: "global",
      delayHours: entitlements.formalSignalDelayHours,
      historyDays: entitlements.formalSignalHistoryDays,
      access: signalAccessSummary(entitlements),
      filters: publicSignalFiltersResponse(filters),
      pagination: publicSignalPagination(filters, total)
    };
  }

  async getPublicDelayedSignals(query: PublicSignalsQuery = {}) {
    const delayHours = PUBLIC_FORMAL_SIGNAL_DELAY_HOURS;
    const historyDays = PUBLIC_FORMAL_SIGNAL_HISTORY_DAYS;
    const filters = normalizePublicSignalsQuery(query);
    if (!this.database.enabled) {
      return {
        signals: [],
        source: "public_delayed_signal_events",
        delayHours,
        historyDays,
        access: {
          plan: "Guest",
          formalSignalAccess: "delayed",
          formalSignalDelayHours: delayHours,
          formalSignalHistoryDays: historyDays,
          realtimeDelayHours: delayHours,
          historyDays,
          signalOutcomes: false,
          performancePreviewOnly: true,
          lockedPerformanceFields: ["4h", "24h", "maxFavorablePct", "maxAdversePct"]
        },
        filters: publicSignalFiltersResponse(filters),
        pagination: publicSignalPagination(filters, 0)
      };
    }

    const where = [
      "se.emitted_at <= now() - interval '8 hours'",
      "se.emitted_at >= now() - interval '7 days'",
      `se.timeframe = '${PUBLIC_FORMAL_SIGNAL_TIMEFRAMES[0]}'`,
      "se.is_formal = true",
      ...PUBLIC_LEDGER_ELIGIBILITY
    ];
    const params: Array<string[] | AlertDirection[] | number | Date> = [];
    if (filters.symbols.length) {
      params.push(filters.symbols);
      where.push(`se.symbol = any($${params.length}::varchar[])`);
    }
    if (filters.timeframes.length) {
      params.push(filters.timeframes);
      where.push(`se.timeframe = any($${params.length}::varchar[])`);
    }
    if (filters.directions.length) {
      params.push(filters.directions);
      where.push(`se.direction = any($${params.length}::varchar[])`);
    }
    if (filters.signalTypes.length) {
      params.push(filters.signalTypes);
      where.push(`se.signal_type = any($${params.length}::varchar[])`);
    }
    if (filters.minScore !== null) {
      params.push(filters.minScore);
      where.push(`se.score >= $${params.length}::integer`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`se.emitted_at >= $${params.length}::timestamptz`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`se.emitted_at <= $${params.length}::timestamptz`);
    }

    const whereSql = where.join(" and ");
    const countRows = await this.database.query<SignalEventCountRow>(
      `select count(*)::text as total_count from signal_events se where ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total_count ?? 0);
    const rows = await this.database.query<SignalEventRow>(
      `
        select
          se.id::text,
          se.symbol,
          se.timeframe,
          se.direction,
          se.signal_type,
          se.title,
          se.reason,
          se.engine,
          se.price::text,
          se.score,
          se.emitted_at,
          se.payload,
          sp.entry_price::text as performance_entry_price,
          sp.price_15m::text as performance_price_15m,
          sp.price_1h::text as performance_price_1h,
          sp.price_4h::text as performance_price_4h,
          sp.price_24h::text as performance_price_24h,
          sp.return_5m::text as performance_return_5m,
          sp.return_15m::text as performance_return_15m,
          sp.return_1h::text as performance_return_1h,
          sp.return_4h::text as performance_return_4h,
          sp.return_24h::text as performance_return_24h,
          coalesce(sp.max_favorable_pct, sp.max_favorable_excursion)::text as performance_max_favorable_pct,
          coalesce(sp.max_adverse_pct, sp.max_adverse_excursion)::text as performance_max_adverse_pct,
          sp.outcome_status as performance_outcome_status,
          sp.evaluated_until as performance_evaluated_until,
          sp.updated_at as performance_updated_at
        from signal_events se
        left join signal_performance sp on sp.signal_event_id = se.id
        where ${whereSql}
        order by se.emitted_at desc, se.id desc
        limit $${params.length + 1}::integer
        offset $${params.length + 2}::integer
      `,
      [...params, filters.limit, filters.offset]
    );
    return {
      signals: rows.map((row) => mapSignalEventRow(row, false)),
      source: "public_delayed_signal_events",
      delayHours,
      historyDays,
      access: {
        plan: "Guest",
        formalSignalAccess: "delayed",
        formalSignalDelayHours: delayHours,
        formalSignalHistoryDays: historyDays,
        realtimeDelayHours: delayHours,
        historyDays,
        signalOutcomes: false,
        performancePreviewOnly: true,
        lockedPerformanceFields: ["4h", "24h", "maxFavorablePct", "maxAdversePct"]
      },
      filters: publicSignalFiltersResponse(filters),
      pagination: publicSignalPagination(filters, total)
    };
  }

  async getPublicPerformanceSummary() {
    const empty = {
      windowDays: 7 as const,
      generatedAt: new Date().toISOString(),
      methodologyVersion: "fixed-window-v1",
      totalSignals: 0,
      completed24hCount: 0,
      pending24hCount: 0,
      directionalHitRate1h: null as number | null,
      averageDirectionalReturn1h: null as number | null
    };
    if (!this.database.enabled) return empty;
    const [row] = await this.database.query<Record<string, string | null>>(`
      select
        count(*)::text as total_signals,
        count(sp.return_24h)::text as completed_24h_count,
        (count(*) - count(sp.return_24h))::text as pending_24h_count,
        avg(case when sp.return_1h is null then null when se.direction = 'short' and sp.return_1h < 0 then 1 when se.direction <> 'short' and sp.return_1h > 0 then 1 else 0 end)::text as directional_hit_rate_1h,
        avg(case when sp.return_1h is null then null when se.direction = 'short' then -sp.return_1h else sp.return_1h end)::text as average_directional_return_1h
      from signal_events se
      left join signal_performance sp on sp.signal_event_id = se.id
      where se.emitted_at <= now() - interval '8 hours'
        and se.emitted_at >= now() - interval '7 days'
        and se.timeframe = '${PUBLIC_FORMAL_SIGNAL_TIMEFRAMES[0]}'
        and se.is_formal = true
        and ${PUBLIC_LEDGER_ELIGIBILITY.join("\n        and ")}
    `);
    return {
      ...empty,
      totalSignals: Number(row?.total_signals || 0),
      completed24hCount: Number(row?.completed_24h_count || 0),
      pending24hCount: Number(row?.pending_24h_count || 0),
      directionalHitRate1h: nullableNumber(row?.directional_hit_rate_1h),
      averageDirectionalReturn1h: nullableNumber(row?.average_directional_return_1h)
    };
  }

  async startPerformanceUpdater(payload: { intervalSeconds?: number; runImmediately?: boolean } = {}, userId?: string) {
    if (userId !== undefined) await this.assertApiAccess(userId);
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer);
      this.performanceTimer = null;
    }
    const intervalSeconds = Math.max(60, Math.min(Number(payload.intervalSeconds || process.env.STRATEGY_PERFORMANCE_INTERVAL_SECONDS || 600), 86400));
    this.performance = {
      ...this.performance,
      enabled: true,
      intervalSeconds,
      timerActive: true,
      startedAt: this.performance.startedAt ?? new Date().toISOString(),
      nextRunAt: nextRunAt(intervalSeconds),
      lastError: null
    };
    this.performanceTimer = setInterval(() => {
      void this.runPerformanceBackfill({ limit: Number(process.env.STRATEGY_PERFORMANCE_BATCH_SIZE || 80) }).catch(() => undefined);
    }, intervalSeconds * 1000);
    if (payload.runImmediately !== false) {
      void this.runPerformanceBackfill({ limit: Number(process.env.STRATEGY_PERFORMANCE_BATCH_SIZE || 80) }).catch(() => undefined);
    }
    return this.getPerformanceStatus();
  }

  async stopPerformanceUpdater(userId?: string) {
    if (userId !== undefined) await this.assertApiAccess(userId);
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer);
      this.performanceTimer = null;
    }
    this.performance = {
      ...this.performance,
      enabled: false,
      timerActive: false,
      running: false,
      nextRunAt: null
    };
    return this.getPerformanceStatus();
  }

  getPerformanceStatus() {
    return {
      performance: {
        ...this.performance,
        timerActive: Boolean(this.performanceTimer)
      }
    };
  }

  async runPerformanceBackfill(payload: { limit?: number } = {}, userId?: string) {
    if (userId !== undefined) await this.assertApiAccess(userId);
    const limit = Math.max(1, Math.min(Number(payload.limit || 80), 300));
    const startedAt = new Date().toISOString();
    if (!this.database.enabled) {
      const empty = { startedAt, finishedAt: new Date().toISOString(), requestedLimit: limit, picked: 0, updated: 0, skipped: 0, failed: 0, errors: ["database_disabled"] };
      this.performance = { ...this.performance, lastRunAt: empty.finishedAt, lastResult: empty, lastError: "database_disabled" };
      return empty;
    }
    if (this.performance.running) {
      return this.performance.lastResult ?? { startedAt, finishedAt: new Date().toISOString(), requestedLimit: limit, picked: 0, updated: 0, skipped: 0, failed: 0, errors: ["already_running"] };
    }

    this.performance = { ...this.performance, running: true, lastError: null };
    try {
      const events = await this.loadPerformanceBackfillEvents(limit);
      const summary: PerformanceRunSummary = { startedAt, finishedAt: startedAt, requestedLimit: limit, picked: events.length, updated: 0, skipped: 0, failed: 0, errors: [] };
      for (const event of events) {
        try {
          const result = await this.updateSignalPerformance(event);
          if (result.updated) summary.updated += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.failed += 1;
          if (summary.errors.length < 8) summary.errors.push(`${event.symbol} ${event.timeframe}: ${(error as Error).message}`);
        }
      }
      summary.finishedAt = new Date().toISOString();
      this.performance = {
        ...this.performance,
        running: false,
        lastRunAt: summary.finishedAt,
        nextRunAt: this.performance.enabled ? nextRunAt(this.performance.intervalSeconds) : null,
        lastResult: summary,
        lastError: summary.failed ? summary.errors[0] ?? "performance_backfill_failed" : null
      };
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.performance = {
        ...this.performance,
        running: false,
        lastRunAt: new Date().toISOString(),
        nextRunAt: this.performance.enabled ? nextRunAt(this.performance.intervalSeconds) : null,
        lastError: message
      };
      throw error;
    }
  }

  private async loadPerformanceBackfillEvents(limit: number) {
    return this.database.queryStrict<PerformanceEventRow>(
      `
        select
          se.id::text,
          se.symbol,
          se.timeframe,
          se.direction,
          se.price::text,
          se.emitted_at,
          se.bar_time
        from signal_events se
        left join signal_performance sp on sp.signal_event_id = se.id
        where se.is_formal = true
          and se.emitted_at <= now() - interval '5 minutes'
          and (
            sp.signal_event_id is null
            or sp.outcome_status in ('pending', 'partial')
            or sp.updated_at < now() - interval '30 minutes'
          )
        order by
          case when sp.signal_event_id is null then 0 else 1 end,
          se.emitted_at desc
        limit $1::integer
      `,
      [limit]
    );
  }

  private async updateSignalPerformance(event: PerformanceEventRow) {
    const entryPrice = Number(event.price);
    const signalTime = new Date(event.emitted_at).getTime();
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(signalTime)) return { updated: false };
    const now = Date.now();
    const startTime = Math.max(0, signalTime - 5 * 60 * 1000);
    const endTime = Math.min(now, signalTime + 24 * 60 * 60 * 1000 + 10 * 60 * 1000);
    if (endTime <= startTime) return { updated: false };
    const klines = await this.marketService.getKlinesBetween(event.symbol, "5m", startTime, endTime, 500);
    const candles = klines.candles.filter((candle) => (candle.close_time ?? candle.open_time) >= signalTime).sort((left, right) => left.open_time - right.open_time);
    if (!candles.length || klines.source === "fixture") return { updated: false };
    const metrics = calculateSignalPerformance(event, entryPrice, signalTime, candles, now);
    await this.database.queryStrict(
      `
        insert into signal_performance (
          signal_event_id,
          entry_price,
          price_15m,
          price_1h,
          price_4h,
          price_24h,
          return_5m,
          return_15m,
          return_1h,
          return_4h,
          return_24h,
          max_favorable_excursion,
          max_adverse_excursion,
          max_favorable_pct,
          max_adverse_pct,
          outcome_status,
          evaluated_until,
          measured_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::numeric,
          $3::numeric,
          $4::numeric,
          $5::numeric,
          $6::numeric,
          $7::numeric,
          $8::numeric,
          $9::numeric,
          $10::numeric,
          $11::numeric,
          $12::numeric,
          $13::numeric,
          $12::numeric,
          $13::numeric,
          $14::varchar,
          $15::timestamptz,
          now(),
          now()
        )
        on conflict (signal_event_id) do update set
          entry_price = excluded.entry_price,
          price_15m = excluded.price_15m,
          price_1h = excluded.price_1h,
          price_4h = excluded.price_4h,
          price_24h = excluded.price_24h,
          return_5m = excluded.return_5m,
          return_15m = excluded.return_15m,
          return_1h = excluded.return_1h,
          return_4h = excluded.return_4h,
          return_24h = excluded.return_24h,
          max_favorable_excursion = excluded.max_favorable_excursion,
          max_adverse_excursion = excluded.max_adverse_excursion,
          max_favorable_pct = excluded.max_favorable_pct,
          max_adverse_pct = excluded.max_adverse_pct,
          outcome_status = excluded.outcome_status,
          evaluated_until = excluded.evaluated_until,
          measured_at = now(),
          updated_at = now()
      `,
      [
        event.id,
        entryPrice,
        metrics.price15m,
        metrics.price1h,
        metrics.price4h,
        metrics.price24h,
        metrics.return5m,
        metrics.return15m,
        metrics.return1h,
        metrics.return4h,
        metrics.return24h,
        metrics.maxFavorablePct,
        metrics.maxAdversePct,
        metrics.outcomeStatus,
        new Date(metrics.evaluatedUntil)
      ]
    );
    return { updated: true };
  }

  getLastScan() {
    return {
      scan: this.lastScan
    };
  }

  getScanHistory() {
    return {
      scans: this.realtime.recentSignals.slice(0, 80)
    };
  }

  async startScanSchedule(payload: StrategySchedulePayload = {}, userId?: string) {
    await this.assertApiAccess(userId);
    this.stopTimer();

    const rule = await this.currentAlertRule(userId);
    const intervalSeconds = normalizeIntervalSeconds(payload.intervalSeconds);
    this.schedule = {
      enabled: true,
      intervalSeconds,
      payload: {
        symbols: payload.symbols ?? rule.symbols,
        timeframe: payload.timeframe ?? rule.timeframe,
        timeframes: payload.timeframes,
        minScore: payload.minScore ?? rule.minScore,
        directions: payload.directions ?? rule.directions,
        cooldownMinutes: payload.cooldownMinutes ?? rule.cooldownMinutes,
        dryRun: payload.dryRun ?? false,
        runImmediately: payload.runImmediately ?? true,
        userId
      },
      startedAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: nextRunAt(intervalSeconds),
      runCount: 0,
      running: false,
      lastResult: null,
      lastError: null
    };

    this.scheduleTimer = setInterval(() => {
      void this.runScheduledScan();
    }, intervalSeconds * 1000);

    if (this.schedule.payload.runImmediately) {
      await this.runScheduledScan();
    }

    return this.getScanSchedule();
  }

  async stopScanSchedule(userId?: string) {
    await this.assertApiAccess(userId);
    this.stopTimer();
    this.schedule = {
      ...this.schedule,
      enabled: false,
      running: false,
      nextRunAt: null
    };

    return this.getScanSchedule();
  }

  getScanSchedule() {
    return {
      schedule: {
        ...this.schedule,
        timerActive: Boolean(this.scheduleTimer)
      }
    };
  }

  async startRealtimeTracking(payload: StrategyRealtimePayload = {}, userId?: string) {
    if (userId) await this.assertApiAccess(userId);
    this.stopTimer();
    this.closeRealtimeSocket(false);
    this.formalSignalQueue.stop();
    this.formalSignalQueue = this.createFormalSignalQueue();

    const entitlements = (await this.usersService.getCurrentEntitlements(userId)).entitlements;
    const rule = normalizeAlertRule({ ...(await this.currentAlertRule(userId)), ...payload });
    const symbols = await this.resolveRealtimeSymbols(payload, rule);
    const timeframes = normalizeScanTimeframes(payload, entitlements);

    this.realtime = {
      enabled: true,
      symbols,
      timeframes,
      payload: {
        symbols,
        timeframes,
        minScore: payload.minScore ?? rule.minScore,
        directions: payload.directions ?? rule.directions,
        cooldownMinutes: payload.cooldownMinutes ?? rule.cooldownMinutes,
        userId
      },
      startedAt: new Date().toISOString(),
      lastEventAt: null,
      lastSignalAt: null,
      lastError: null,
      connected: false,
      reconnects: 0,
      recentSignals: this.realtime.recentSignals.slice(0, 20)
    };

    this.openRealtimeSocket();
    return this.getRealtimeStatus();
  }

  async stopRealtimeTracking(userId?: string) {
    await this.assertApiAccess(userId);
    this.realtime = {
      ...this.realtime,
      enabled: false,
      connected: false
    };
    this.formalSignalQueue.stop();
    this.closeRealtimeSocket(false);
    return this.getRealtimeStatus();
  }

  getRealtimeStatus() {
    const recent = this.recentFormalOutcomes();
    return {
      realtime: {
        ...this.realtime,
        socketActive: this.hasOpenRealtimeSocket(),
        recentSignals: this.realtime.recentSignals.slice(0, 20)
      },
      formalPipeline: {
        queue: this.formalSignalQueue.getStatus(),
        matchQueue: this.formalMatchQueue.getStatus(),
        deliveryQueue: this.formalDeliveryQueue.getStatus(),
        latestSuccessfulCalculationAt: this.formalPipeline.latestSuccessfulCalculationAt,
        latestPersistenceAt: this.formalPipeline.latestPersistenceAt,
        latestMatchedAt: this.formalPipeline.latestMatchedAt,
        recentSuccesses: recent.succeeded,
        recentFailures: recent.failed,
        latestFailure: this.formalPipeline.latestFailure ? { ...this.formalPipeline.latestFailure } : null
      }
    };
  }

  private openRealtimeSocket() {
    if (!this.realtime.enabled || !this.realtime.symbols.length || !this.realtime.timeframes.length) return;
    const WebSocketCtor = resolveRuntimeWebSocketCtor();
    if (!WebSocketCtor) {
      this.realtime = { ...this.realtime, lastError: "当前 Node 运行时不支持 WebSocket。" };
      return;
    }

    const streams = this.realtime.symbols.flatMap((symbol) =>
      this.realtime.timeframes.map((timeframe) => `${symbol.toLowerCase()}@kline_${toBinanceInterval(timeframe)}`)
    );
    // 当前服务器 Binance Futures WebSocket 会握手成功但不下发 K线消息；
    // 这里用 Binance Spot K线 WebSocket 作为“收盘事件触发器”，
    // 实际策略计算仍在 runStrategy() 中拉取 Binance Futures K线数据。
    const streamChunks = chunkArray(streams, 180);
    this.realtimeSockets = streamChunks.map((chunk) => {
      const url = buildRealtimeStreamUrl(chunk);
      const socket = new WebSocketCtor(url);
      socket.onopen = () => {
        this.openRealtimeSockets.add(socket);
        this.realtime = { ...this.realtime, connected: this.hasOpenRealtimeSocket(), lastError: null };
      };
      socket.onerror = (event: unknown) => {
        this.openRealtimeSockets.delete(socket);
        this.realtime = {
          ...this.realtime,
          connected: this.hasOpenRealtimeSocket(),
          lastError: `实时行情连接错误：${String(event)}`
        };
      };
      socket.onclose = () => {
        this.realtimeSockets = this.realtimeSockets.filter((item) => item !== socket);
        this.openRealtimeSockets.delete(socket);
        this.realtime = { ...this.realtime, connected: this.hasOpenRealtimeSocket() };
        if (this.realtime.enabled && !this.realtimeReconnectTimer) {
          this.realtimeReconnectTimer = setTimeout(() => {
            this.realtimeReconnectTimer = null;
            this.realtime = { ...this.realtime, reconnects: this.realtime.reconnects + 1 };
            this.closeRealtimeSocket(false);
            this.openRealtimeSocket();
          }, 3000);
        }
      };
      socket.onmessage = (event: { data: unknown }) => {
        this.handleRealtimeMessage(event.data);
      };
      return socket;
    });
  }

  private closeRealtimeSocket(scheduleReconnect: boolean) {
    if (this.realtimeReconnectTimer) {
      clearTimeout(this.realtimeReconnectTimer);
      this.realtimeReconnectTimer = null;
    }
    const sockets = this.realtimeSockets;
    this.realtimeSockets = [];
    this.openRealtimeSockets.clear();
    this.realtime = { ...this.realtime, connected: false };
    for (const socket of sockets) {
      if (!scheduleReconnect) socket.onclose = null;
      socket.close();
    }
  }

  async getFormalSignalStatus() {
    const database = await this.database.health();
    const queue = this.formalSignalQueue.getStatus();
    const matchQueue = this.formalMatchQueue.getStatus();
    const deliveryQueue = this.formalDeliveryQueue.getStatus();
    const reconciliation = this.formalSignalReconciler.getStatus();
    const deliveryRetry = this.formalDeliveryRetry.getStatus();
    const realtime = {
      enabled: this.realtime.enabled,
      connected: this.hasOpenRealtimeSocket(),
      lastClosedEventAt: this.realtime.lastEventAt
    };
    const recent = this.recentFormalOutcomes();
    const reasons = [
      database.mode === "mock" || !database.connected ? "database_unavailable" : null,
      !realtime.enabled ? "realtime_disabled" : null,
      !realtime.connected ? "realtime_disconnected" : null,
      !reconciliation.enabled ? "reconciliation_disabled" : null,
      reconciliation.lastError ? "reconciliation_error" : null,
      !deliveryRetry.enabled ? "delivery_retry_disabled" : null,
      deliveryRetry.lastError ? "delivery_retry_error" : null,
      queue.oldestInFlightAt && Date.now() - new Date(queue.oldestInFlightAt).getTime() > 60_000 ? "queue_latency_exceeded" : null,
      queue.pressureActive ? "queue_pressure" : null,
      matchQueue.oldestInFlightAt && Date.now() - new Date(matchQueue.oldestInFlightAt).getTime() > 60_000 ? "match_queue_latency_exceeded" : null,
      matchQueue.pressureActive ? "match_queue_pressure" : null,
      matchQueue.latestFailure && (
        !matchQueue.latestCompletedAt
        || new Date(matchQueue.latestFailure.at).getTime() > new Date(matchQueue.latestCompletedAt).getTime()
      ) ? "matching_failed" : null,
      deliveryQueue.oldestInFlightAt && Date.now() - new Date(deliveryQueue.oldestInFlightAt).getTime() > 60_000 ? "delivery_queue_latency_exceeded" : null,
      deliveryQueue.pressureActive ? "delivery_queue_pressure" : null,
      this.hasNewerPersistenceFailure() ? "persistence_failed" : null
    ].filter((reason): reason is string => Boolean(reason));

    return {
      ready: reasons.length === 0,
      reason: reasons[0] ?? null,
      realtime,
      queue,
      matchQueue,
      deliveryQueue,
      reconciliation,
      latestCalculationAt: this.formalPipeline.latestSuccessfulCalculationAt,
      latestPersistenceAt: this.formalPipeline.latestPersistenceAt,
      latestMatchedAt: this.formalPipeline.latestMatchedAt,
      recent: {
        succeeded: recent.succeeded,
        failed: recent.failed,
        timedOut: recent.timedOut,
        reconciled: recent.reconciled
      },
      deliveryRetry
    };
  }

  private recentFormalOutcomes() {
    const cutoff = Date.now() - 15 * 60_000;
    this.formalOutcomeHistory = this.formalOutcomeHistory.filter((outcome) => outcome.at >= cutoff);
    return {
      succeeded: this.formalOutcomeHistory.filter((outcome) => outcome.outcome === "succeeded").length,
      failed: this.formalOutcomeHistory.filter((outcome) => outcome.outcome === "failed").length,
      timedOut: this.formalOutcomeHistory.filter((outcome) => outcome.timedOut).length,
      reconciled: this.formalOutcomeHistory.filter(
        (outcome) => outcome.outcome === "succeeded" && outcome.source === "reconciliation"
      ).length
    };
  }

  private hasNewerPersistenceFailure() {
    const failedAt = this.formalPipeline.latestPersistenceFailureAt;
    if (!failedAt) return false;
    const persistedAt = this.formalPipeline.latestPersistenceAt;
    return !persistedAt || new Date(failedAt).getTime() > new Date(persistedAt).getTime();
  }

  private hasOpenRealtimeSocket() {
    for (const socket of this.openRealtimeSockets) {
      if (this.realtimeSockets.includes(socket)) return true;
    }
    return false;
  }

  private handleRealtimeMessage(raw: unknown) {
    let event: BinanceKlineEvent;
    try {
      event = JSON.parse(String(raw)) as BinanceKlineEvent;
    } catch {
      return;
    }
    const kline = event.data?.k;
    if (!kline?.s || !kline.i) return;
    let job: FormalSignalJob | null;
    try {
      job = formalSignalJobFromClosedKline(kline);
    } catch (error) {
      this.realtime = { ...this.realtime, lastError: error instanceof Error ? error.message : String(error) };
      return;
    }
    if (!job) return;
    const { symbol, timeframe } = job;
    if (!this.realtime.symbols.includes(symbol) || !this.realtime.timeframes.includes(timeframe)) return;

    this.realtime = { ...this.realtime, lastEventAt: new Date().toISOString() };
    this.formalSignalQueue.enqueue(job);
  }

  private async runScheduledScan() {
    if (!this.schedule.enabled || this.schedule.running) {
      return;
    }

    this.schedule = {
      ...this.schedule,
      running: true,
      lastError: null
    };

    try {
      const result = await this.scanAndAlert(this.schedule.payload, this.schedule.payload.userId);
      const stillEnabled = this.schedule.enabled;
      this.schedule = {
        ...this.schedule,
        running: false,
        lastRunAt: new Date().toISOString(),
        nextRunAt: stillEnabled ? nextRunAt(this.schedule.intervalSeconds) : null,
        runCount: this.schedule.runCount + 1,
        lastResult: result,
        lastError: null
      };
    } catch (error) {
      const stillEnabled = this.schedule.enabled;
      this.schedule = {
        ...this.schedule,
        running: false,
        lastRunAt: new Date().toISOString(),
        nextRunAt: stillEnabled ? nextRunAt(this.schedule.intervalSeconds) : null,
        runCount: this.schedule.runCount + 1,
        lastError: (error as Error).message
      };
    }
  }

  private stopTimer() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
  }

  private async resolveGlobalScanSymbols() {
    const configured = configuredFormalSymbols();
    if (configured.length) return configured;
    let discovered: string[];
    try {
      discovered = await this.marketService.getStrictRealtimeKlineTriggerSymbols();
    } catch {
      throw new Error("global_scan_symbols_unavailable");
    }
    if (!discovered.length) throw new Error("global_scan_symbols_unavailable");

    const symbols = normalizeScanSymbols(discovered).slice(0, MAX_SCAN_SYMBOLS);
    if (!symbols.length) throw new Error("global_scan_symbols_unavailable");
    return symbols;
  }

  private async resolveRealtimeSymbols(payload: StrategyRealtimePayload, rule: Required<AlertRuleDto>) {
    if (payload.symbols?.length) return normalizeScanSymbols(payload.symbols).slice(0, MAX_SCAN_SYMBOLS);
    const configured = configuredFormalSymbols();
    if (configured.length) return configured;
    try {
      const binanceSymbols = await this.marketService.getRealtimeKlineTriggerSymbols();
      if (binanceSymbols.length) return normalizeScanSymbols(binanceSymbols).slice(0, MAX_SCAN_SYMBOLS);
    } catch {
      // Fall back to configured/default symbols when Binance discovery is unavailable.
    }
    if (this.database.enabled) {
      const rows = await this.database.query<{ symbol: string }>(
        `select distinct symbol from watchlists where enabled = true order by symbol limit $1`,
        [MAX_SCAN_SYMBOLS]
      );
      if (rows.length) return normalizeScanSymbols([...DEFAULT_SCAN_SYMBOLS, ...rows.map((row) => row.symbol)]).slice(0, MAX_SCAN_SYMBOLS);
    }
    return normalizeScanSymbols(rule.symbols?.length ? rule.symbols : DEFAULT_SCAN_SYMBOLS).slice(0, MAX_SCAN_SYMBOLS);
  }

  private async loadSignalEventsForKeys(rawDedupeKeys: string[], strict = false) {
    if (!rawDedupeKeys.length) return [];
    if (!this.database.enabled) {
      if (strict) throw new Error("signal_event_lookup_incomplete:database_unavailable");
      return [];
    }
    const dedupeKeys = Array.from(new Set(rawDedupeKeys));
    if (!dedupeKeys.length) return [];
    const sql = `
        select
          id::text,
          dedupe_key,
          symbol,
          timeframe,
          direction,
          signal_type,
          title,
          reason,
          engine,
          price::text,
          score,
          bar_time,
          strategy_version,
          is_formal,
          emitted_at,
          payload
        from signal_events
        where dedupe_key = any($1::varchar[])
          and is_formal = true
        order by emitted_at desc
      `;
    const rows = strict
      ? await this.database.queryStrict<SignalEventRow>(sql, [dedupeKeys])
      : await this.database.query<SignalEventRow>(sql, [dedupeKeys]);

    if (strict) {
      const persistedKeys = new Set(rows.map((row) => row.dedupe_key));
      const found = dedupeKeys.filter((dedupeKey) => persistedKeys.has(dedupeKey)).length;
      if (found !== dedupeKeys.length) {
        throw new Error(`signal_event_lookup_incomplete:expected=${dedupeKeys.length}:actual=${found}`);
      }
    }

    return rows;
  }

  private async matchSignalEventsToUsers(
    events: SignalEventRow[],
    context: Pick<FormalSignalJob, "source" | "closedAt">
  ) {
    if (!this.database.enabled || !events.length) return;
    const entitlementsByUser = new Map<string, UserEntitlements>();
    for (const event of events) {
      const watchlists = await this.database.queryStrict<WatchlistRow>(
        `
          select
            id::text,
            user_id::text,
            symbol,
            timeframes,
            enabled,
            min_score,
            signal_scope,
            push_enabled,
            created_at,
            updated_at,
            disabled_at
          from watchlists
          where enabled = true
            and symbol = $1
            and $2 = any(timeframes)
            and min_score <= $3
        `,
        [event.symbol, event.timeframe, Number(event.score)]
      );
      for (const watchlist of watchlists.filter((item) => signalScopeMatches(item.signal_scope, event.signal_type))) {
        let entitlements = entitlementsByUser.get(watchlist.user_id);
        if (!entitlements) {
          entitlements = (await this.usersService.getFormalEntitlementsById(watchlist.user_id)).entitlements;
          entitlementsByUser.set(watchlist.user_id, entitlements);
        }
        if (!entitlements.allowedTimeframes.includes(event.timeframe)) continue;

        await this.database.queryStrict<{ id: string }>(
          `
            insert into user_signal_inbox (user_id, signal_event_id, symbol, timeframe, side, score, matched_rule)
            values ($1, $2, $3, $4, $5, $6, $7::jsonb)
            on conflict (user_id, signal_event_id) do nothing
            returning id::text
          `,
          [
            watchlist.user_id,
            event.id,
            event.symbol,
            event.timeframe,
            event.direction,
            Number(event.score),
            JSON.stringify({
              watchlistId: watchlist.id,
              minScore: Number(watchlist.min_score),
              signalScope: watchlist.signal_scope,
              pushEnabled: Boolean(watchlist.push_enabled),
              timeframes: watchlist.timeframes
            })
          ]
        );
        if (context.source === "reconciliation" && Date.now() - context.closedAt.getTime() > reconciliationPushMaxAgeMs()) {
          await this.recordSkippedDelivery(event, watchlist.user_id, "reconciliation_too_old");
          continue;
        }
        await this.enqueueInitialDelivery(event, watchlist, context.closedAt);
      }
    }
  }

  private async enqueueInitialDelivery(event: SignalEventRow, watchlist: WatchlistRow, closedAt: Date) {
    const pending = await this.ensurePendingDelivery(event, watchlist.user_id);
    if (!pending) return;
    const key = `${watchlist.user_id}:${event.id}:feishu`;
    const outcome = this.formalDeliveryQueue.enqueue({
      key,
      closedAt,
      enqueuedAt: new Date(),
      execute: async () => {
        try {
          await this.deliverInboxSignal(event, watchlist);
        } catch (error) {
          await this.recordFailedDelivery(
            event,
            watchlist.user_id,
            `initial_delivery_failed:${error instanceof Error ? error.message : String(error)}`
          );
          throw error;
        }
      }
    });
    // A pressure-rejected job remains durable as pending so the retry worker can claim it.
    if (outcome === "pressure") return;
  }

  private async ensurePendingDelivery(event: SignalEventRow, userId: string) {
    const rows = await this.database.queryStrict<{ id: string; status: string }>(
      `
        insert into alert_deliveries (
          user_id, signal_event_id, channel, symbol, timeframe, direction,
          signal_type, score, title, status, payload
        )
        values (
          $1::uuid, $2::uuid, 'feishu', $3::varchar, $4::varchar, $5::varchar,
          $6::varchar, $7::integer, $8::varchar, 'pending', $9::jsonb
        )
        on conflict (user_id, signal_event_id, channel) where signal_event_id is not null do update set
          status = alert_deliveries.status
        where alert_deliveries.status = 'pending'
        returning id::text, status
      `,
      [
        userId,
        event.id,
        event.symbol,
        event.timeframe,
        event.direction,
        event.signal_type,
        Number(event.score),
        event.title,
        JSON.stringify(event.payload ?? {})
      ]
    );
    return rows[0]?.status === "pending";
  }

  private async recordFailedDelivery(event: SignalEventRow, userId: string, reason: string) {
    await this.database.queryStrict(
      `
        insert into alert_deliveries (
          user_id, signal_event_id, channel, symbol, timeframe, direction,
          signal_type, score, title, status, reason, payload, next_retry_at
        )
        values (
          $1::uuid, $2::uuid, 'feishu', $3::varchar, $4::varchar, $5::varchar,
          $6::varchar, $7::integer, $8::varchar, 'failed', $9::text, $10::jsonb, now()
        )
        on conflict (user_id, signal_event_id, channel) where signal_event_id is not null do update set
          status = 'failed',
          reason = excluded.reason,
          next_retry_at = now()
        where alert_deliveries.status = 'pending'
      `,
      [
        userId,
        event.id,
        event.symbol,
        event.timeframe,
        event.direction,
        event.signal_type,
        Number(event.score),
        event.title,
        reason,
        JSON.stringify(event.payload ?? {})
      ]
    );
  }

  private async retryFormalDelivery(candidate: FormalDeliveryRetryCandidate) {
    const event: SignalEventRow = {
      ...candidate.event,
      performance_entry_price: null,
      performance_price_15m: null,
      performance_price_1h: null,
      performance_price_4h: null,
      performance_price_24h: null,
      performance_return_5m: null,
      performance_return_15m: null,
      performance_return_1h: null,
      performance_return_4h: null,
      performance_return_24h: null,
      performance_max_favorable_pct: null,
      performance_max_adverse_pct: null,
      performance_outcome_status: null,
      performance_evaluated_until: null,
      performance_updated_at: null
    };
    try {
      return (await this.deliverInboxSignal(event, candidate.watchlist, true, true, candidate.deliveryId)) ?? { skipped: true };
    } catch (error) {
      const reason = `retry_preparation_failed:${error instanceof Error ? error.message : String(error)}`;
      await this.finalizeReservedDelivery(event, candidate.userId, { sent: false, reason });
      return { failed: true, reason };
    }
  }

  private async deliverInboxSignal(
    event: SignalEventRow,
    watchlist: WatchlistRow,
    retry = false,
    preclaimedRetry = false,
    preclaimedDeliveryId?: string
  ) {
    if (!retry && this.database.enabled && !(await this.ensurePendingDelivery(event, watchlist.user_id))) return;
    return this.withUserDeliveryLock(watchlist.user_id, async () => {
      const preparation = await this.prepareDelivery(event, watchlist.user_id);
      if (!this.database.enabled) {
        await this.recordSkippedDelivery(event, watchlist.user_id, "database_unavailable");
        return;
      }

      const reserved = await this.database.withAdvisoryTransaction(
        `formal-delivery:${watchlist.user_id}`,
        (transaction) => this.reserveDelivery(event, watchlist, preparation, transaction, retry, preclaimedRetry, preclaimedDeliveryId)
      );
      if (!reserved) return;

      const timeoutMs = formalDeliveryTimeoutMs();
      let result: { sent?: boolean; failed?: boolean; skipped?: boolean; status?: number; reason?: string };
      try {
        result = await withPromiseTimeout(
          this.alertsService.sendFormalFeishu(preparation.candidate, preparation.providerTarget, { timeoutMs }),
          timeoutMs,
          `feishu_delivery_timeout:${timeoutMs}ms`
        );
      } catch (error) {
        result = {
          sent: false,
          failed: true,
          reason: (error as Error).message
        };
      }

      await this.finalizeReservedDelivery(event, watchlist.user_id, result);
      if (result.sent) {
        this.lastAlertAtByKey.set(alertCooldownKey(preparation.candidate, watchlist.user_id), Date.now());
      }
      return result;
    });
  }

  private async prepareDelivery(event: SignalEventRow, userId: string): Promise<DeliveryPreparation> {
    const channel = "feishu";
    const entitlements = (await this.usersService.getFormalEntitlementsById(userId)).entitlements;
    const pushSetting = await this.loadUserPushSetting(userId, channel);
    const rule = await this.currentFormalAlertRule(userId);
    return {
      candidate: eventToAlertCandidate(event),
      providerTarget: {
        userId,
        webhookUrl: pushSetting.target_encrypted || pushSetting.binding_webhook_url || ""
      },
      entitlements,
      pushSetting,
      rule,
      dailyLimit: Math.max(0, Number(entitlements.maxPushPerDay || 0)),
      cooldownMinutes: Math.max(0, Number(pushSetting.cooldown_minutes || rule.cooldownMinutes || 0))
    };
  }

  private async reserveDelivery(
    event: SignalEventRow,
    watchlist: WatchlistRow,
    preparation: DeliveryPreparation,
    transaction: DatabaseTransaction,
    retry = false,
    preclaimedRetry = false,
    preclaimedDeliveryId?: string
  ) {
    const channel = "feishu";
    if (!watchlist.enabled) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "watchlist_disabled", transaction);
      return false;
    }

    if (!watchlist.push_enabled) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "watchlist_push_disabled", transaction);
      return false;
    }

    const { entitlements, pushSetting, rule, dailyLimit, cooldownMinutes, candidate } = preparation;
    if (!entitlements.allowedTimeframes.includes(event.timeframe)) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "plan_timeframe_not_allowed", transaction);
      return false;
    }
    if (!entitlements.feishuAlerts) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "plan_or_feishu_disabled", transaction);
      return false;
    }

    if (!pushSetting.enabled) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "push_setting_disabled", transaction);
      return false;
    }
    if (!pushSetting.target_encrypted && !pushSetting.binding_webhook_url && !pushSetting.target_masked) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "push_target_missing", transaction);
      return false;
    }

    const minScore = Math.max(rule.minScore, entitlements.minAlertScore, Number(pushSetting.min_score || 0));
    if (!rule.directions.includes(event.direction) || Number(event.score) < minScore) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "below_push_setting_or_plan", transaction);
      return false;
    }

    if (!dailyLimit) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "daily_push_not_allowed", transaction);
      return false;
    }
    const excludeDeliveryId = preclaimedRetry ? preclaimedDeliveryId ?? null : null;
    const sentToday = await this.countDailySentDeliveries(watchlist.user_id, channel, transaction, excludeDeliveryId);
    if (sentToday >= dailyLimit) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "daily_push_limit", transaction);
      return false;
    }

    const inDbCooldown = await this.isDeliveryInCooldown(event, watchlist.user_id, channel, cooldownMinutes, transaction, excludeDeliveryId);
    if (inDbCooldown) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "db_cooldown", transaction);
      return false;
    }

    const cooldownRule = { ...rule, cooldownMinutes };
    const deliverable = filterCooldownCandidates([candidate], cooldownRule, this.lastAlertAtByKey, watchlist.user_id);
    if (!deliverable.length) {
      await this.recordSkippedDelivery(event, watchlist.user_id, "memory_cooldown", transaction);
      return false;
    }

    if (preclaimedRetry) return true;

    const claimed = await transaction.query<{ id: string }>(
      `
        update alert_deliveries
        set status = 'sending',
            retry_count = retry_count + case when $4::boolean then 1 else 0 end,
            last_attempt_at = now(),
            next_retry_at = null,
            reason = null,
            skip_reason = null
        where user_id = $1::uuid
          and signal_event_id = $2::uuid
          and channel = $3::varchar
          and status = case when $4::boolean then 'failed' else 'pending' end
          and (not $4::boolean or retry_count < 3)
          and (not $4::boolean or coalesce(next_retry_at, now()) <= now())
        returning id::text
      `,
      [watchlist.user_id, event.id, channel, retry]
    );
    return claimed.length === 1;
  }

  private async withUserDeliveryLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.userDeliveryTails.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.userDeliveryTails.set(userId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.userDeliveryTails.get(userId) === tail) this.userDeliveryTails.delete(userId);
    }
  }

  private async recordSkippedDelivery(event: SignalEventRow, userId: string, reason: string, transaction?: DatabaseTransaction) {
    const sql = `
        insert into alert_deliveries (user_id, signal_event_id, channel, symbol, timeframe, direction, signal_type, score, title, status, reason, skip_reason, payload)
        values ($1::uuid, $2::uuid, 'feishu', $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::integer, $8::varchar, 'skipped', $9::text, $9::text, $10::jsonb)
        on conflict (user_id, signal_event_id, channel) where signal_event_id is not null do update set
          status = case when alert_deliveries.status = 'sent' then alert_deliveries.status else 'skipped' end,
          reason = case when alert_deliveries.status = 'sent' then alert_deliveries.reason else excluded.reason end,
          skip_reason = case when alert_deliveries.status = 'sent' then alert_deliveries.skip_reason else excluded.skip_reason end,
          payload = case when alert_deliveries.status = 'sent' then alert_deliveries.payload else excluded.payload end
      `;
    const params = [userId, event.id, event.symbol, event.timeframe, event.direction, event.signal_type, Number(event.score), event.title, reason, JSON.stringify(event.payload ?? {})];
    if (transaction) await transaction.query(sql, params);
    else await this.database.queryStrict(sql, params);
  }

  private async finalizeReservedDelivery(
    event: SignalEventRow,
    userId: string,
    result: { sent?: boolean; status?: number; reason?: string }
  ) {
    const status = result.sent ? "sent" : "failed";
    const reason = result.sent ? null : result.reason ?? "feishu_delivery_not_sent";
    await this.database.withTransaction(async (transaction) => {
      const updated = await transaction.query<{ id: string }>(
        `
          update alert_deliveries
          set status = $4::varchar,
              http_status = $5::integer,
              reason = $6::text,
              skip_reason = null,
              payload = $7::jsonb,
              sent_at = case when $4::varchar = 'sent' then now() else sent_at end,
              last_attempt_at = now(),
              next_retry_at = case
                when $4::varchar = 'sent' then null
                when retry_count = 0 then now() + interval '1 minute'
                when retry_count = 1 then now() + interval '2 minutes'
                when retry_count = 2 then now() + interval '4 minutes'
                else null
              end
          where user_id = $1::uuid
            and signal_event_id = $2::uuid
            and channel = $3::varchar
            and status = 'sending'
          returning id::text
        `,
        [userId, event.id, "feishu", status, result.status ?? null, reason, JSON.stringify(event.payload ?? {})]
      );
      if (updated.length !== 1) {
        throw new Error(`delivery_finalization_incomplete:${userId}:${event.id}`);
      }
      if (result.sent) {
        await this.upsertDeliveryCooldown(event, userId, "feishu", transaction);
      }
    });
  }

  private async loadUserPushSetting(userId: string, channel: string) {
    if (!this.database.enabled) {
      return {
        enabled: false,
        min_score: 80,
        cooldown_minutes: 15,
        target_encrypted: null,
        target_masked: null,
        binding_webhook_url: null
      } satisfies UserPushSettingRow;
    }

    const rows = await this.database.queryStrict<UserPushSettingRow>(
      `
        select
          coalesce(ups.enabled, false) as enabled,
          coalesce(ups.min_score, 80)::integer as min_score,
          coalesce(ups.cooldown_minutes, 15)::integer as cooldown_minutes,
          ups.target_encrypted,
          ups.target_masked,
          fb.webhook_url as binding_webhook_url
        from users u
        left join user_push_settings ups on ups.user_id = u.id and ups.channel = $2::varchar
        left join lateral (
          select webhook_url
          from feishu_bindings
          where user_id = u.id and status = 'active'
          order by updated_at desc
          limit 1
        ) fb on true
        where u.id = $1::uuid
        limit 1
      `,
      [userId, channel]
    );

    return rows[0] ?? {
      enabled: false,
      min_score: 80,
      cooldown_minutes: 15,
      target_encrypted: null,
      target_masked: null,
      binding_webhook_url: null
    };
  }

  private async countDailySentDeliveries(userId: string, channel: string, transaction: DatabaseTransaction, excludeDeliveryId: string | null = null) {
    if (!this.database.enabled) return 0;
    const rows = await transaction.query<{ sent_count: string | number }>(
      `
        select count(*)::text as sent_count
        from alert_deliveries
        where user_id = $1::uuid
          and channel = $2::varchar
          and status in ('sending', 'sent')
          and ($3::uuid is null or id <> $3::uuid)
          and coalesce(sent_at, created_at) >= date_trunc('day', now())
          and coalesce(sent_at, created_at) < date_trunc('day', now()) + interval '1 day'
      `,
      [userId, channel, excludeDeliveryId]
    );
    return Number(rows[0]?.sent_count ?? 0);
  }

  private async isDeliveryInCooldown(
    event: SignalEventRow,
    userId: string,
    channel: string,
    cooldownMinutes: number,
    transaction: DatabaseTransaction,
    excludeDeliveryId: string | null = null
  ) {
    if (!this.database.enabled || cooldownMinutes <= 0) return false;
    const rows = await transaction.query<{ in_cooldown: boolean }>(
      `
        select (
          exists (
            select 1
            from alert_deliveries
            where user_id = $1::uuid
              and channel = $2::varchar
              and symbol = $3::varchar
              and timeframe = $4::varchar
              and direction = $5::varchar
              and coalesce(signal_type, 'unknown') = $6::varchar
              and status in ('sending', 'sent')
              and coalesce(sent_at, created_at) > now() - ($7::integer * interval '1 minute')
              and ($8::uuid is null or id <> $8::uuid)
          )
          or exists (
          select 1
          from signal_delivery_cooldowns
          where user_id = $1::uuid
            and channel = $2::varchar
            and symbol = $3::varchar
            and timeframe = $4::varchar
            and direction = $5::varchar
            and signal_type = $6::varchar
            and last_sent_at > now() - ($7::integer * interval '1 minute')
          )
        ) as in_cooldown
      `,
      [userId, channel, event.symbol, event.timeframe, event.direction, event.signal_type ?? "unknown", cooldownMinutes, excludeDeliveryId]
    );
    return Boolean(rows[0]?.in_cooldown);
  }

  private async upsertDeliveryCooldown(event: SignalEventRow, userId: string, channel: string, transaction: DatabaseTransaction) {
    if (!this.database.enabled) return;
    await transaction.query(
      `
        insert into signal_delivery_cooldowns (user_id, channel, symbol, timeframe, direction, signal_type, last_sent_at)
        values ($1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, now())
        on conflict (user_id, channel, symbol, timeframe, direction, signal_type) do update set
          last_sent_at = excluded.last_sent_at
      `,
      [userId, channel, event.symbol, event.timeframe, event.direction, event.signal_type ?? "unknown"]
    );
  }

  private async loadUserWatchlists(userId: string, includeDisabled = false) {
    if (!this.database.enabled) return [];
    return this.database.query<WatchlistRow>(
      `
        select id::text, user_id::text, symbol, timeframes, enabled, min_score, signal_scope, push_enabled, created_at, updated_at, disabled_at
        from watchlists
        where user_id = $1
          and ($2::boolean = true or enabled = true)
        order by enabled desc, updated_at desc
      `,
      [userId, includeDisabled]
    );
  }

  private assertWatchlistAllowed(items: Array<ReturnType<typeof normalizeWatchlistInput>>, entitlements: UserEntitlements) {
    const allowed = new Set(entitlements.allowedTimeframes);
    for (const item of items) {
      const disallowed = item.timeframes.filter((timeframe) => !allowed.has(timeframe));
      if (item.enabled && disallowed.length) {
        throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持周期：${disallowed.join(", ")}。可用周期：${entitlements.allowedTimeframes.join(", ")}`);
      }
    }
  }

  private assertWatchlistCapacity(existingRows: WatchlistRow[], items: Array<ReturnType<typeof normalizeWatchlistInput>>, entitlements: UserEntitlements) {
    const activeSymbols = new Set(existingRows.filter((row) => row.enabled).map((row) => row.symbol));
    for (const item of items) {
      if (item.enabled) {
        activeSymbols.add(item.symbol);
      } else {
        activeSymbols.delete(item.symbol);
      }
    }

    if (activeSymbols.size > entitlements.maxWatchlistSymbols) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 最多自选 ${entitlements.maxWatchlistSymbols} 个币种，当前提交后会变成 ${activeSymbols.size} 个。`);
    }
  }

  private assertTimeframesAllowed(timeframes: string[], entitlements: UserEntitlements) {
    const allowed = new Set(entitlements.allowedTimeframes);
    const disallowed = timeframes.filter((timeframe) => !allowed.has(timeframe));
    if (disallowed.length) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持周期：${Array.from(new Set(disallowed)).join(", ")}。可用周期：${entitlements.allowedTimeframes.join(", ")}`);
    }
  }

  private async assertApiAccess(userId?: string) {
    const entitlements = (await this.usersService.getCurrentEntitlements(userId)).entitlements;
    if (!entitlements.apiAccess) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 不支持高级 API / 运维接口，请升级到 SVIP。`);
    }
    return entitlements;
  }

  private assertAlertRuleAllowed(rule: Required<AlertRuleDto>, entitlements: UserEntitlements) {
    this.assertTimeframesAllowed([rule.timeframe], entitlements);
    if (rule.symbols.length > entitlements.maxWatchlistSymbols) {
      throw new BadRequestException(`当前套餐 ${entitlements.plan} 最多允许 ${entitlements.maxWatchlistSymbols} 个告警币种。`);
    }
  }

  private async withMarketData(payload: StrategyRunPayload, options?: MarketDataLoadOptions): Promise<StrategyRunPayload> {
    if (payload.candles?.length) {
      if (options?.strictClosedAt) throw new Error("non_authoritative_market_data:request");
      return {
        ...payload,
        market_data_source: "request"
      };
    }

    const limit = Math.max(80, Math.min(Number(payload.limit) || 180, 500));
    const timeframe = payload.timeframe ?? "5m";
    const mtfTimeframe = payload.mtf_timeframe ?? "15m";
    const htfTimeframe = payload.htf_timeframe ?? "1h";
    const [klines, mtfKlines, htfKlines] = await Promise.all([
      this.loadMarketKlines(payload.symbol, timeframe, limit, options),
      this.loadMarketKlines(payload.symbol, mtfTimeframe, limit, options),
      this.loadMarketKlines(payload.symbol, htfTimeframe, limit, options)
    ]);

    const closedAt = options?.strictClosedAt;
    const marketResults = closedAt
      ? [klines, mtfKlines, htfKlines].map((result) => authoritativeClosedKlines(result, closedAt))
      : [klines, mtfKlines, htfKlines];
    const [baseResult, mtfResult, htfResult] = marketResults;

    return {
      ...payload,
      symbol: baseResult.symbol,
      timeframe: baseResult.timeframe,
      mtf_timeframe: mtfResult.timeframe,
      htf_timeframe: htfResult.timeframe,
      candles: baseResult.candles,
      mtf_candles: mtfResult.candles,
      htf_candles: htfResult.candles,
      market_data_source: baseResult.source
    };
  }

  private loadMarketKlines(symbol: string, timeframe: string, limit: number, options?: MarketDataLoadOptions) {
    if (!options?.strictClosedAt) return this.marketService.getKlines(symbol, timeframe, limit);

    const endTime = options.strictClosedAt.getTime() - 1;
    const cacheKey = `${normalizeOneSymbol(symbol)}:${timeframe}:${limit}:${endTime}`;
    let request = options.cache?.get(cacheKey);
    if (!request) {
      request = this.marketService.getStrictKlinesBefore(symbol, timeframe, endTime, limit);
      options.cache?.set(cacheKey, request);
    }
    return request;
  }

  private async currentAlertRule(userId?: string) {
    const currentUserId = await this.currentUserId(userId);
    if (this.database.enabled) {
      const rows = await this.database.query<AlertRuleRow>(
        `
          select
            symbols,
            timeframe,
            min_score,
            directions,
            cooldown_minutes,
            interval_seconds
          from alert_rules
          where user_id = $1 and name = 'default' and status = 'active'
          limit 1
        `,
        [currentUserId]
      );
      const row = rows[0];
      if (row) {
        const rule = normalizeAlertRule({
          symbols: row.symbols,
          timeframe: row.timeframe,
          minScore: Number(row.min_score),
          directions: row.directions,
          cooldownMinutes: Number(row.cooldown_minutes),
          intervalSeconds: Number(row.interval_seconds)
        });
        this.alertRuleByUserId.set(currentUserId, rule);
      }
    }

    return this.alertRuleByUserId.get(currentUserId) ?? DEFAULT_ALERT_RULE;
  }

  private async currentFormalAlertRule(userId: string) {
    const rows = await this.database.queryStrict<AlertRuleRow>(
      `
        select
          symbols,
          timeframe,
          min_score,
          directions,
          cooldown_minutes,
          interval_seconds
        from alert_rules
        where user_id::text = $1 and name = 'default' and status = 'active'
        limit 1
      `,
      [userId]
    );
    const row = rows[0];
    if (!row) throw new Error(`formal_alert_rule_not_found:${userId}`);
    return normalizeAlertRule({
      symbols: row.symbols,
      timeframe: row.timeframe,
      minScore: Number(row.min_score),
      directions: row.directions,
      cooldownMinutes: Number(row.cooldown_minutes),
      intervalSeconds: Number(row.interval_seconds)
    });
  }

  private async currentUserId(userId?: string) {
    const response = await this.usersService.getCurrentUser(userId);
    if (response.user.id) return response.user.id;
    if (this.database.enabled) {
      const rows = await this.database.query<{ id: string }>(`select id::text from users order by created_at asc limit 1`);
      if (rows[0]?.id) return rows[0].id;
    }
    return "00000000-0000-0000-0000-000000000000";
  }
}

function mapWatchlistRow(row: WatchlistRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    displaySymbol: row.symbol.replace(/USDT$/, ""),
    timeframes: normalizeWatchlistTimeframes(row.timeframes),
    enabled: Boolean(row.enabled),
    minScore: Number(row.min_score),
    signalScope: row.signal_scope || "all",
    pushEnabled: Boolean(row.push_enabled),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null
  };
}

function normalizeWatchlistInput(item: { symbol?: string; timeframes?: string[]; enabled?: boolean; minScore?: number; signalScope?: string; pushEnabled?: boolean }, entitlements?: UserEntitlements) {
  const minScore = Math.max(0, Math.min(Number(item.minScore ?? DEFAULT_ALERT_RULE.minScore), 100));
  return {
    symbol: normalizeOneSymbol(item.symbol),
    timeframes: normalizeWatchlistTimeframes(item.timeframes),
    enabled: item.enabled !== false,
    minScore: Math.max(minScore, entitlements?.minAlertScore ?? 0),
    signalScope: ["all", "trend_only", "reversal_only"].includes(String(item.signalScope)) ? String(item.signalScope) : "all",
    pushEnabled: item.pushEnabled !== false
  };
}

function watchlistLimitSummary(entitlements: UserEntitlements, rows: WatchlistRow[]) {
  const activeSymbolCount = new Set(rows.filter((row) => row.enabled).map((row) => row.symbol)).size;
  return {
    plan: entitlements.plan,
    maxWatchlistSymbols: entitlements.maxWatchlistSymbols,
    activeSymbolCount,
    remainingSymbolSlots: Math.max(0, entitlements.maxWatchlistSymbols - activeSymbolCount),
    allowedTimeframes: entitlements.allowedTimeframes,
    minAlertScore: entitlements.minAlertScore,
    maxPushPerDay: entitlements.maxPushPerDay,
    realtimeDelayHours: entitlements.realtimeDelayHours,
    historyDays: entitlements.historyDays,
    signalOutcomes: entitlements.signalOutcomes
  };
}

function normalizeOneSymbol(symbol?: string) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) return "";
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
}

function normalizeWatchlistTimeframes(timeframes?: string[]) {
  const normalized = (timeframes?.length ? timeframes : DEFAULT_STRATEGY_TIMEFRAMES)
    .map((timeframe) => String(timeframe || "").trim().toLowerCase())
    .filter((timeframe) => DEFAULT_STRATEGY_TIMEFRAMES.includes(timeframe));
  return Array.from(new Set(normalized)).slice(0, MAX_SCAN_TIMEFRAMES);
}

function signalScopeMatches(scope: string, signalType: string | null) {
  if (scope === "trend_only") return String(signalType || "").includes("trend");
  if (scope === "reversal_only") return String(signalType || "").includes("reversal");
  return true;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function eventToAlertCandidate(event: SignalEventRow) {
  const payload = typeof event.payload === "string" ? jsonParse(event.payload) : event.payload ?? {};
  return {
    signalEventId: event.id,
    symbol: event.symbol.replace(/USDT$/, ""),
    timeframe: event.timeframe,
    price: String(event.price),
    score: Number(event.score),
    direction: event.direction,
    signalType: event.signal_type ?? undefined,
    title: event.title ?? undefined,
    reason: event.reason ?? "Pine V6 策略信号触发。",
    time: formatBarTime(new Date(event.emitted_at).getTime()),
    oiChange: String((payload as Record<string, unknown>).engine ?? event.engine ?? "strategy"),
    funding: String((payload as Record<string, unknown>).marketState ?? "Pine V6")
  };
}

function calculateSignalPerformance(event: PerformanceEventRow, entryPrice: number, signalTime: number, candles: Candle[], now: number) {
  const candleAt = (minutes: number) => candleAtOrAfter(candles, signalTime + minutes * 60 * 1000);
  const candle5m = candleAt(5);
  const candle15m = candleAt(15);
  const candle1h = candleAt(60);
  const candle4h = candleAt(240);
  const candle24h = candleAt(1440);
  const evaluatedUntil = candles.reduce((latest, candle) => Math.max(latest, candle.close_time ?? candle.open_time), signalTime);
  const isLong = event.direction === "long";
  const returnFor = (price?: number | null) => {
    if (!price || !Number.isFinite(price)) return null;
    return isLong ? (price - entryPrice) / entryPrice : (entryPrice - price) / entryPrice;
  };
  let maxFavorablePct = 0;
  let maxAdversePct = 0;
  for (const candle of candles) {
    const favorable = isLong ? (candle.high - entryPrice) / entryPrice : (entryPrice - candle.low) / entryPrice;
    const adverse = isLong ? (candle.low - entryPrice) / entryPrice : (entryPrice - candle.high) / entryPrice;
    maxFavorablePct = Math.max(maxFavorablePct, favorable);
    maxAdversePct = Math.min(maxAdversePct, adverse);
  }
  const has24h = Boolean(candle24h) || now >= signalTime + 24 * 60 * 60 * 1000;
  const return24h = returnFor(candle24h?.close ?? null);
  const outcomeStatus = has24h && return24h !== null ? (return24h > 0 ? "success" : "failed") : "pending";

  return {
    price15m: candle15m?.close ?? null,
    price1h: candle1h?.close ?? null,
    price4h: candle4h?.close ?? null,
    price24h: candle24h?.close ?? null,
    return5m: returnFor(candle5m?.close ?? null),
    return15m: returnFor(candle15m?.close ?? null),
    return1h: returnFor(candle1h?.close ?? null),
    return4h: returnFor(candle4h?.close ?? null),
    return24h,
    maxFavorablePct,
    maxAdversePct,
    outcomeStatus,
    evaluatedUntil
  };
}

function candleAtOrAfter(candles: Candle[], targetTime: number) {
  return candles.find((candle) => {
    const closeExclusive = candle.close_time !== undefined
      ? candle.close_time + 1
      : candle.open_time + PERFORMANCE_CANDLE_MS;
    return closeExclusive >= targetTime;
  }) ?? null;
}

function normalizePublicSignalsQuery(query: PublicSignalsQuery): NormalizedPublicSignalsQuery {
  const page = clampInteger(firstQueryValue(query.page), 1, 100000, 1);
  const limit = clampInteger(firstQueryValue(query.limit), 1, 100, 30);
  const symbols = splitQueryValues(query.symbols ?? query.symbol ?? query.market)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => (symbol.endsWith("USDT") ? symbol : `${symbol}USDT`));
  const timeframes = splitQueryValues(query.timeframes ?? query.timeframe)
    .map((timeframe) => timeframe.trim().toLowerCase())
    .filter((timeframe) => DEFAULT_STRATEGY_TIMEFRAMES.includes(timeframe));
  const directions = splitQueryValues(query.directions ?? query.direction)
    .map((direction) => direction.trim().toLowerCase())
    .filter(isAlertDirection);
  const signalTypes = splitQueryValues(query.signalTypes ?? query.signalType ?? query.type)
    .map((signalType) => signalType.trim())
    .filter((signalType) => /^[a-zA-Z0-9_:-]{1,80}$/.test(signalType));
  const minScoreValue = Number(firstQueryValue(query.minScore ?? query.score));
  const minScore = Number.isFinite(minScoreValue) ? Math.max(0, Math.min(Math.trunc(minScoreValue), 100)) : null;
  const from = parseQueryDate(firstQueryValue(query.from ?? query.startAt));
  const to = parseQueryDate(firstQueryValue(query.to ?? query.endAt));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    symbols: Array.from(new Set(symbols)).slice(0, 80),
    timeframes: Array.from(new Set(timeframes)),
    directions: Array.from(new Set(directions)),
    signalTypes: Array.from(new Set(signalTypes)).slice(0, 20),
    minScore,
    from,
    to
  };
}

function normalizeInboxMode(value: string | string[] | undefined): "current" | "all" {
  const mode = String(firstQueryValue(value) || "current").trim().toLowerCase();
  return mode === "all" || mode === "history" ? "all" : "current";
}

function publicSignalFiltersResponse(filters: NormalizedPublicSignalsQuery) {
  return {
    symbols: filters.symbols,
    timeframes: filters.timeframes,
    directions: filters.directions,
    signalTypes: filters.signalTypes,
    minScore: filters.minScore,
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? filters.to.toISOString() : null
  };
}

function publicSignalPagination(filters: NormalizedPublicSignalsQuery, total: number) {
  const totalPages = total ? Math.ceil(total / filters.limit) : 0;
  const hasMore = filters.offset + filters.limit < total;
  return {
    page: filters.page,
    limit: filters.limit,
    total,
    totalPages,
    hasMore,
    nextPage: hasMore ? filters.page + 1 : null
  };
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function splitQueryValues(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
}

function clampInteger(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function parseQueryDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapInboxRow(row: InboxRow, entitlements?: UserEntitlements) {
  const payload = normalizeSignalPayload(row.payload);
  return {
    id: row.inbox_id,
    signalEventId: row.id,
    symbol: row.symbol.replace(/USDT$/, ""),
    rawSymbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    signalType: row.signal_type,
    engine: row.engine,
    price: Number(row.price),
    score: Number(row.score),
    title: row.title ?? `${row.signal_type ?? "策略"} ${row.direction === "short" ? "看跌" : "看涨"}信号`,
    reason: row.reason ?? "Pine V6 策略信号触发。",
    time: new Date(row.emitted_at).toISOString(),
    receivedAt: new Date(row.inbox_created_at).toISOString(),
    status: row.inbox_status,
    action: signalActionFromPayload(payload),
    payload,
    performance: mapSignalPerformance(row, entitlements?.signalOutcomes ?? false)
  };
}

function mapSignalEventRow(row: SignalEventRow, fullPerformance = true) {
  const payload = normalizeSignalPayload(row.payload);
  return {
    id: row.id,
    signalEventId: row.id,
    symbol: row.symbol.replace(/USDT$/, ""),
    rawSymbol: row.symbol,
    timeframe: row.timeframe,
    direction: row.direction,
    signalType: row.signal_type,
    engine: row.engine,
    price: Number(row.price),
    score: Number(row.score),
    title: row.title ?? `${row.signal_type ?? "策略"} ${row.direction === "short" ? "看跌" : "看涨"}信号`,
    reason: row.reason ?? "Pine V6 策略信号触发。",
    time: new Date(row.emitted_at).toISOString(),
    receivedAt: new Date(row.emitted_at).toISOString(),
    status: "public_delayed",
    action: signalActionFromPayload(payload),
    payload,
    performance: mapSignalPerformance(row, fullPerformance)
  };
}

function mapSignalPerformance(row: SignalEventRow, fullPerformance = true) {
  const hasPerformance = Boolean(
    row.performance_entry_price ||
    row.performance_return_5m ||
    row.performance_return_15m ||
    row.performance_return_1h ||
    row.performance_return_4h ||
    row.performance_return_24h ||
    row.performance_max_favorable_pct ||
    row.performance_max_adverse_pct ||
    row.performance_outcome_status
  );
  if (!hasPerformance) return null;
  return {
    entryPrice: nullableNumber(row.performance_entry_price),
    prices: {
      "15m": nullableNumber(row.performance_price_15m),
      "1h": nullableNumber(row.performance_price_1h),
      "4h": fullPerformance ? nullableNumber(row.performance_price_4h) : null,
      "24h": fullPerformance ? nullableNumber(row.performance_price_24h) : null
    },
    returns: {
      "5m": nullableNumber(row.performance_return_5m),
      "15m": nullableNumber(row.performance_return_15m),
      "1h": nullableNumber(row.performance_return_1h),
      "4h": fullPerformance ? nullableNumber(row.performance_return_4h) : null,
      "24h": fullPerformance ? nullableNumber(row.performance_return_24h) : null
    },
    maxFavorablePct: fullPerformance ? nullableNumber(row.performance_max_favorable_pct) : null,
    maxAdversePct: fullPerformance ? nullableNumber(row.performance_max_adverse_pct) : null,
    outcomeStatus: row.performance_outcome_status ?? "pending",
    evaluatedUntil: row.performance_evaluated_until ? new Date(row.performance_evaluated_until).toISOString() : null,
    updatedAt: row.performance_updated_at ? new Date(row.performance_updated_at).toISOString() : null,
    access: {
      full: fullPerformance,
      previewOnly: !fullPerformance,
      lockedFields: fullPerformance ? [] : ["4h", "24h", "maxFavorablePct", "maxAdversePct"]
    }
  };
}

function nullableNumber(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeSignalPayload(payload: SignalEventRow["payload"]) {
  if (!payload) return {};
  if (typeof payload === "string") return jsonParse(payload);
  return payload;
}

function signalActionFromPayload(payload: Record<string, unknown>) {
  return typeof payload.action === "string" ? payload.action : null;
}

function buildSingleScan(symbol: string, timeframe: string, item: ScanItem): ScanResult {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    timeframe,
    timeframes: [timeframe],
    symbols: [symbol],
    permission: {
      plan: "Realtime",
      requestedSymbols: 1,
      maxScanSymbols: 1,
      remainingSignals: 1,
      limitedBySymbols: false,
      limitedByQuota: false,
      requestedTimeframe: timeframe,
      requestedTimeframes: [timeframe],
      timeframeAllowed: true
    },
    summary: {
      scanned: 1,
      succeeded: item.ok ? 1 : 0,
      failed: item.ok ? 0 : 1,
      signals: item.signalCount
    },
    results: [item]
  };
}

function toBinanceInterval(timeframe: string) {
  return String(timeframe || "5m").toLowerCase();
}

function fromBinanceInterval(interval: string) {
  const normalized = String(interval || "5m").toLowerCase();
  if (/^\d+[mhdw]$/.test(normalized)) return normalized;
  return "5m";
}

function normalizeScanSymbols(symbols?: string[]) {
  const source = symbols?.length ? symbols : DEFAULT_SCAN_SYMBOLS;
  const normalized = source
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => (symbol.endsWith("USDT") ? symbol : `${symbol}USDT`))
    .filter((symbol) => /^[A-Z0-9]+USDT$/.test(symbol));

  return Array.from(new Set(normalized)).slice(0, MAX_SCAN_SYMBOLS);
}

function normalizeTimeframe(timeframe: string | undefined, entitlements: UserEntitlements) {
  const requested = timeframe ?? "5m";
  return entitlements.allowedTimeframes.includes(requested) ? requested : entitlements.allowedTimeframes[0];
}

function normalizeScanTimeframes(payload: StrategyScanPayload, entitlements: UserEntitlements) {
  const source = payload.timeframes?.length ? payload.timeframes : payload.timeframe ? [payload.timeframe] : DEFAULT_STRATEGY_TIMEFRAMES;
  const normalized = source
    .map((timeframe) => String(timeframe || "").trim().toLowerCase())
    .map((timeframe) => timeframe.replace(/^(\d+)m$/i, "$1m").replace(/^(\d+)h$/i, "$1h"))
    .filter(Boolean);
  const unique = Array.from(new Set(normalized)).slice(0, MAX_SCAN_TIMEFRAMES);

  return unique.length ? unique : [normalizeTimeframe(payload.timeframe, entitlements)];
}

function normalizeIntervalSeconds(value?: number) {
  const numericValue = Number(value) || DEFAULT_SCHEDULE_INTERVAL_SECONDS;
  return Math.max(MIN_SCHEDULE_INTERVAL_SECONDS, Math.min(numericValue, MAX_SCHEDULE_INTERVAL_SECONDS));
}

function normalizeAlertRule(rule: AlertRuleDto): Required<AlertRuleDto> {
  const directions = (rule.directions?.length ? rule.directions : DEFAULT_ALERT_RULE.directions).filter(isAlertDirection);

  return {
    symbols: normalizeScanSymbols(rule.symbols ?? DEFAULT_ALERT_RULE.symbols),
    timeframe: rule.timeframe || DEFAULT_ALERT_RULE.timeframe,
    minScore: Math.max(0, Math.min(Number(rule.minScore ?? DEFAULT_ALERT_RULE.minScore), 100)),
    directions: directions.length ? Array.from(new Set(directions)) : DEFAULT_ALERT_RULE.directions,
    cooldownMinutes: Math.max(0, Math.min(Number(rule.cooldownMinutes ?? DEFAULT_ALERT_RULE.cooldownMinutes), 1440)),
    intervalSeconds: normalizeIntervalSeconds(rule.intervalSeconds)
  };
}

function isAlertDirection(value: string): value is AlertDirection {
  return ["long", "short", "flat"].includes(value);
}

function filterCooldownCandidates<T extends { symbol: string; direction: AlertDirection }>(
  candidates: T[],
  rule: Required<AlertRuleDto>,
  lastAlertAtByKey: Map<string, number>,
  userId: string
) {
  if (!rule.cooldownMinutes) {
    return candidates;
  }

  const cooldownMs = rule.cooldownMinutes * 60 * 1000;
  const now = Date.now();
  return candidates.filter((candidate) => {
    const lastAlertAt = lastAlertAtByKey.get(alertCooldownKey(candidate, userId));
    return !lastAlertAt || now - lastAlertAt >= cooldownMs;
  });
}

function alertCooldownKey(signal: { symbol: string; direction: AlertDirection }, userId: string) {
  return `${userId}:${signal.symbol}:${signal.direction}`;
}

function nextRunAt(intervalSeconds: number) {
  return new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

function authoritativeClosedKlines(result: MarketKlinesResult, closedAt: Date): MarketKlinesResult {
  if (result.source !== "binance") {
    throw new Error(`non_authoritative_market_data:${result.symbol}:${result.timeframe}:${result.source}`);
  }
  const cutoff = closedAt.getTime();
  const duration = timeframeDurationMs(result.timeframe);
  const candles = result.candles.filter((candle) => {
    const closesAt = candle.close_time === undefined ? candle.open_time + duration : candle.close_time + 1;
    return closesAt <= cutoff;
  });
  if (!candles.length) throw new Error(`authoritative_market_data_unavailable:${result.symbol}:${result.timeframe}`);
  return { ...result, candles };
}

function assertExpectedFormalBarTime(
  result: StrategyRunResult,
  job: ExpectedFormalBar,
  errorCode = "unexpected_formal_bar_time"
) {
  const expected = job.klineOpenTime;
  const actual = Number(result.bar_time);
  if (
    !Number.isFinite(actual)
    || actual !== expected
    || result.timeframe !== job.timeframe
    || result.symbol !== job.symbol
  ) {
    throw new Error(
      `${errorCode}:${job.symbol}:${job.timeframe}:expected=${expected}:actual=${String(result.bar_time)}`
    );
  }
}

function configuredFormalSymbols() {
  const configured = process.env.STRATEGY_FORMAL_SYMBOLS;
  if (!configured?.trim()) return [];
  return normalizeScanSymbols(configured.split(",")).slice(0, MAX_SCAN_SYMBOLS);
}

function timeframeDurationMs(timeframe: string) {
  const match = /^(\d+)(m|h)$/.exec(String(timeframe).trim().toLowerCase());
  if (!match) throw new Error(`unsupported_timeframe:${timeframe}`);
  return Number(match[1]) * (match[2] === "h" ? 60 : 1) * 60 * 1000;
}

function globalScanConcurrency() {
  const configured = Number(process.env.STRATEGY_GLOBAL_SCAN_CONCURRENCY || 8);
  if (!Number.isFinite(configured)) return 8;
  return Math.max(1, Math.min(Math.trunc(configured), 24));
}

function globalScanJobConcurrency(timeframeCount: number) {
  return Math.min(globalScanConcurrency() * Math.max(1, timeframeCount), 48);
}

function isTransientGlobalScanTransportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|authoritative_market_data_unavailable|Strategy service returned 5\d\d/i.test(message);
}

function formalDeliveryTimeoutMs() {
  const configured = Number(process.env.STRATEGY_FEISHU_TIMEOUT_MS || 10_000);
  if (!Number.isFinite(configured) || configured <= 0) return 10_000;
  return Math.max(10, Math.min(Math.round(configured), 60_000));
}

function formalStrategyTimeoutMs() {
  const configured = Number(process.env.STRATEGY_FORMAL_EXECUTION_TIMEOUT_MS || 55_000);
  if (!Number.isFinite(configured) || configured <= 0) return 55_000;
  return Math.max(1_000, Math.min(Math.round(configured), 60_000));
}

function reconciliationPushMaxAgeMs() {
  const configured = Number(process.env.STRATEGY_RECONCILIATION_PUSH_MAX_AGE_MS || 300_000);
  if (!Number.isFinite(configured) || configured < 0) return 300_000;
  return Math.min(Math.round(configured), 86_400_000);
}

async function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  };

  const workerCount = Math.min(items.length, Math.max(1, Math.trunc(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function mapFormalStrategySignals(result: StrategyRunResult, job: FormalSignalJob) {
  const barTime = new Date(Number(result.bar_time));
  const emittedAt = new Date(job.closedAt);
  return result.signals.map((signal) => {
    const reducePct = signal.reduce_pct ?? (signal as { reducePct?: number | null }).reducePct ?? null;

    return {
      symbol: normalizeOneSymbol(result.symbol),
      timeframe: result.timeframe,
      direction: signal.side,
      signalType: signal.type,
      title: signal.title,
      reason: buildReason(result, signal),
      price: signal.price,
      score: scoreFromSignal(signal.score_impact),
      source: "strategy-service",
      dedupeKey: [
        result.symbol,
        result.timeframe,
        result.bar_time,
        FORMAL_STRATEGY_VERSION,
        signal.type,
        signal.side,
        signal.action ?? signal.side
      ].join(":"),
      barTime,
      emittedAt,
      strategyVersion: FORMAL_STRATEGY_VERSION,
      formal: true as const,
      payload: {
        formal: true,
        strategyVersion: FORMAL_STRATEGY_VERSION,
        barTime: barTime.toISOString(),
        closedAt: emittedAt.toISOString(),
        engine: signal.engine,
        action: signal.action ?? null,
        reducePct,
        marketState: result.market_state,
        diagnostics: result.diagnostics ?? null,
        metrics: result.metrics,
        stopPrice: signal.stop_price ?? null,
        takeProfitPrice: signal.take_profit_price ?? null
      }
    };
  });
}

function extractAlertCandidates(scan: ScanResult, minScore: number) {
  return scan.results.flatMap((item) => {
    if (!item.ok) {
      return [];
    }

    return item.result.signals
      .map((signal) => ({
        symbol: item.result.symbol.replace(/USDT$/, ""),
        price: String(signal.price),
        score: scoreFromSignal(signal.score_impact),
        direction: signal.side,
        action: signal.action ?? undefined,
        signalType: signal.type,
        title: signal.title,
        reason: buildReason(item.result, signal),
        time: formatBarTime(item.result.bar_time),
        oiChange: item.marketData.source,
        funding: item.result.market_state
      }))
      .filter((signal) => signal.score >= minScore);
  });
}

function scoreFromSignal(scoreImpact: number) {
  return Math.max(0, Math.min(100, 50 + scoreImpact));
}

function buildReason(result: StrategyRunResult, signal: StrategyRunResult["signals"][number]) {
  const atrPct = result.metrics.atr_pct;
  const rsi = result.metrics.rsi;
  const stateText = strategyStateLabel(result.market_state);
  const action = signal.action ?? "";
  const directionText = signal.side === "short" ? "多头趋势切换为空头趋势" : "空头趋势切换为多头趋势";
  const details = [
    `状态：${stateText}`,
    typeof atrPct === "number" ? `ATR波动：${atrPct.toFixed(2)}%` : null,
    typeof rsi === "number" ? `RSI：${rsi.toFixed(2)}` : null
  ].filter(Boolean);

  if (action === "reduce_long") {
    return `${signal.title}: reduce_long reduce long exposure, not a fresh short entry; ${details.join("; ")}`;
  }
  if (action === "reduce_short") {
    return `${signal.title}: reduce_short reduce short exposure, not a fresh long entry; ${details.join("; ")}`;
  }

  return `${signal.title}：${directionText}，由连续两根K线突破 EMD 趋势带并通过实体、影线、RSI 和 ATR 过滤确认。${details.join("，")}。`;
}

function strategyStateLabel(state: string) {
  const labels: Record<string, string> = {
    short_to_long_reversal: "空转多反转",
    long_to_short_reversal: "多转空反转",
    long_trend_no_reversal: "多头延续，未反转",
    short_trend_no_reversal: "空头延续，未反转",
    range_no_reversal: "震荡，未反转"
  };
  return labels[state] || state;
}

function formatBarTime(barTime: number | null) {
  if (!barTime) {
    return new Date().toLocaleString("zh-CN", { hour12: false });
  }

  return new Date(barTime).toLocaleString("zh-CN", { hour12: false });
}

function signalAccessSummary(entitlements: UserEntitlements) {
  return {
    plan: entitlements.plan,
    allowedTimeframes: entitlements.allowedTimeframes,
    formalSignalAccess: entitlements.formalSignalAccess,
    formalSignalDelayHours: entitlements.formalSignalDelayHours,
    formalSignalHistoryDays: entitlements.formalSignalHistoryDays,
    historyDays: entitlements.formalSignalHistoryDays,
    realtimeDelayHours: entitlements.formalSignalDelayHours,
    signalOutcomes: entitlements.signalOutcomes,
    performancePreviewOnly: !entitlements.signalOutcomes,
    lockedPerformanceFields: entitlements.signalOutcomes ? [] : ["4h", "24h", "maxFavorablePct", "maxAdversePct"]
  };
}

function summarizeAlertPermission(entitlements: UserEntitlements) {
  return {
    plan: entitlements.plan,
    feishuAlerts: entitlements.feishuAlerts,
    minAlertScore: entitlements.minAlertScore,
    remainingSignals: entitlements.remainingSignals
  };
}
