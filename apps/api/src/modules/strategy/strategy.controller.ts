import { Body, Controller, Get, Headers, Post, Put, Query } from "@nestjs/common";
import { AlertRuleDto } from "./dto/alert-rule.dto";
import { StrategyRealtimePayload, StrategyRunPayload, StrategySchedulePayload, StrategyScanPayload } from "./strategy.client";
import { StrategyService } from "./strategy.service";

@Controller("api/strategy")
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  @Post("run")
  runStrategy(@Body() payload: StrategyRunPayload, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.runStrategy(payload, authorization || userId || "__anonymous__");
  }

  @Post("scan")
  scanSymbols(@Body() payload: StrategyScanPayload, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.scanSymbols(payload, authorization || userId);
  }

  @Post("scan/alert")
  scanAndAlert(@Body() payload: StrategyScanPayload & AlertRuleDto & { dryRun?: boolean }, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.scanAndAlert(payload, authorization || userId);
  }

  @Get("alert-rule")
  getAlertRule(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.getAlertRule(authorization || userId);
  }

  @Put("alert-rule")
  updateAlertRule(@Body() payload: AlertRuleDto, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.updateAlertRule(payload, authorization || userId);
  }

  @Get("scan/latest")
  getLatestScan() {
    return this.strategyService.getLastScan();
  }

  @Get("scan/history")
  getScanHistory() {
    return this.strategyService.getScanHistory();
  }

  @Get("watchlist")
  getWatchlist(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.getUserWatchlist(authorization || userId);
  }

  @Put("watchlist")
  updateWatchlist(@Body() payload: { items?: Array<{ symbol?: string; timeframes?: string[]; enabled?: boolean; minScore?: number; signalScope?: string; pushEnabled?: boolean }> }, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.updateUserWatchlist(payload, authorization || userId);
  }

  @Get("inbox")
  getInbox(@Query() query: Record<string, string | string[] | undefined>, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.getUserSignalInbox(authorization || userId, query);
  }

  @Get("public-signals")
  getPublicSignals(@Query() query: Record<string, string | string[] | undefined>) {
    return this.strategyService.getPublicDelayedSignals(query);
  }

  @Get("scan/global/status")
  getGlobalScanStatus() {
    return this.strategyService.getGlobalScanStatus();
  }

  @Post("scan/schedule/start")
  startSchedule(@Body() payload: StrategySchedulePayload, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.startScanSchedule(payload, authorization || userId);
  }

  @Post("scan/schedule/stop")
  stopSchedule(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.stopScanSchedule(authorization || userId);
  }

  @Get("scan/schedule")
  getSchedule() {
    return this.strategyService.getScanSchedule();
  }

  @Post("realtime/start")
  startRealtime(@Body() payload: StrategyRealtimePayload, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.startRealtimeTracking(payload, authorization || userId || "__anonymous__");
  }

  @Post("realtime/stop")
  stopRealtime(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.stopRealtimeTracking(authorization || userId || "__anonymous__");
  }

  @Get("realtime/status")
  getRealtimeStatus() {
    return this.strategyService.getRealtimeStatus();
  }

  @Get("performance/status")
  getPerformanceStatus() {
    return this.strategyService.getPerformanceStatus();
  }

  @Post("performance/run")
  runPerformanceBackfill(@Body() payload: { limit?: number }, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.runPerformanceBackfill(payload, authorization || userId || "__anonymous__");
  }

  @Post("performance/start")
  startPerformanceUpdater(@Body() payload: { intervalSeconds?: number; runImmediately?: boolean }, @Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.startPerformanceUpdater(payload, authorization || userId || "__anonymous__");
  }

  @Post("performance/stop")
  stopPerformanceUpdater(@Headers("authorization") authorization?: string, @Headers("x-radar-user-id") userId?: string) {
    return this.strategyService.stopPerformanceUpdater(authorization || userId || "__anonymous__");
  }
}
