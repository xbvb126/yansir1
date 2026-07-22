import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const src = (file) => readFileSync(path.join(process.cwd(), file), "utf8");

const trackRecordPath = "src/features/portal/PublicTrackRecordView.tsx";
assert.equal(existsSync(path.join(process.cwd(), trackRecordPath)), true, "the approved track-record page must exist");

const shell = src("src/components/AppShell.tsx");
const bottomNav = src("src/components/BottomNav.tsx");
const portalNavigation = src("src/features/portal/portalNavigation.ts");
const trackRecord = src(trackRecordPath);
const trackPresentation = src("src/features/portal/TrackRecordPresentation.tsx");
const strategyController = src("../api/src/modules/strategy/strategy.controller.ts");
const strategyService = src("../api/src/modules/strategy/strategy.service.ts");

assert.match(bottomNav, /track-record/);
assert.match(portalNavigation, /战绩/);
assert.match(shell, /view === "track-record"/);
assert.match(shell, /<PublicTrackRecordView/);
assert.match(trackPresentation, /历史战绩/);
assert.match(trackPresentation, /可信度总览/);
assert.match(trackPresentation, /最近公开信号/);
assert.match(strategyController, /public-performance-summary/);
assert.match(strategyService, /getPublicPerformanceSummary/);
assert.match(strategyService, /PUBLIC_LEDGER_ELIGIBILITY/);

console.log("track record restoration contract passed");
