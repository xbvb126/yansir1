import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const outDir = path.join(root, "tests", ".tmp-public-portal-runtime");
mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, "public-portal-runtime.mjs");
const esbuildBin = path.resolve(root, "..", "..", "node_modules", "esbuild", "bin", "esbuild");

try {
  execFileSync(process.execPath, [esbuildBin, "src/features/portal/publicPortalRuntime.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`], { cwd: root });
  const runtime = await import(pathToFileURL(outfile));

  const cachedIdentity = { verified: false, userId: "cached-user", role: "member" };
  assert.equal(runtime.hasVerifiedIdentity(cachedIdentity), false);
  assert.equal(runtime.portalSignalSource(cachedIdentity), "public", "an unverified cached user must never select private signals");
  assert.equal(runtime.canCreateMemberOrder(cachedIdentity), false, "an expired cached identity must be sent through Login");

  const verifiedMember = { verified: true, userId: "member-1", role: "member" };
  assert.equal(runtime.portalSignalSource(verifiedMember), "private");
  assert.equal(runtime.canCreateMemberOrder(verifiedMember), true);
  const verifiedGuestWithId = { verified: true, userId: "guest-1", role: "guest" };
  assert.equal(runtime.hasVerifiedIdentity(verifiedGuestWithId), false);
  assert.equal(runtime.portalSignalSource(verifiedGuestWithId), "public", "a verified Guest id must still use public Radar data");
  assert.equal(runtime.canCreateMemberOrder(verifiedGuestWithId), false);
  assert.equal(runtime.canPayMemberOrder(cachedIdentity), false, "expired cached identity must not pay a cached order");
  assert.equal(runtime.canPayMemberOrder(verifiedGuestWithId), false, "Guest identities must never pay orders");
  assert.equal(runtime.canPayMemberOrder(verifiedMember), true);

  const cachedPrivate = { currentUser: { id: "cached-user" }, entitlements: { plan: "SVIP" }, orders: [{ id: "old" }], teamDashboard: { secret: true } };
  assert.deepEqual(runtime.effectivePrivatePortalState(cachedPrivate, cachedIdentity), {
    currentUser: null, entitlements: null, orders: [], teamDashboard: null
  }, "cached private state stays hidden until /api/me verifies the active identity");
  assert.deepEqual(runtime.effectivePrivatePortalState(cachedPrivate, verifiedMember), cachedPrivate);

  assert.deepEqual(runtime.portalSignalsForResult("public", { ok: false }), [], "failed public loads clear any prior private/untrusted signals");
  assert.deepEqual(runtime.portalSignalsForResult("public", { ok: true, signals: ["delayed"] }), ["delayed"]);
  assert.equal(runtime.portalSignalsForResult("private", { ok: false }), null, "a private refresh failure may keep the last verified private state");

  const coordinator = runtime.createPortalRequestCoordinator();
  const authenticatedRequest = coordinator.begin();
  assert.equal(authenticatedRequest.signal.aborted, false);
  const guestRequest = coordinator.begin();
  assert.equal(authenticatedRequest.signal.aborted, true, "starting the guest request aborts the in-flight authenticated request");
  assert.equal(coordinator.isCurrent(authenticatedRequest), false, "the authenticated response cannot commit after an auth transition");
  assert.equal(coordinator.isCurrent(guestRequest), true);
  coordinator.invalidate();
  assert.equal(guestRequest.signal.aborted, true);
  assert.equal(coordinator.isCurrent(guestRequest), false);

  const raceCoordinator = runtime.createPortalRequestCoordinator();
  const committed = [];
  let resolveAuthenticated;
  const authenticatedResponse = new Promise((resolve) => { resolveAuthenticated = resolve; });
  const authenticatedToken = raceCoordinator.begin();
  const authenticatedCommit = authenticatedResponse.then((value) => {
    if (raceCoordinator.isCurrent(authenticatedToken)) committed.push(value);
  });
  const publicToken = raceCoordinator.begin();
  resolveAuthenticated("private inbox row");
  await authenticatedCommit;
  if (raceCoordinator.isCurrent(publicToken)) committed.push("public delayed row");
  assert.deepEqual(committed, ["public delayed row"], "a late private inbox resolution cannot overwrite the guest transition");

  const allKey = runtime.publicTrackRecordFilterKey({ symbol: "", direction: "all" });
  assert.equal(runtime.publicTrackRecordFilterKey({ symbol: " btcUSDT ", direction: "long" }), runtime.publicTrackRecordFilterKey({ symbol: "BTC", direction: "long" }));
  assert.notEqual(allKey, runtime.publicTrackRecordFilterKey({ symbol: "BTC", direction: "all" }));
  assert.notEqual(runtime.publicTrackRecordFilterKey({ symbol: "BTC", direction: "long" }), runtime.publicTrackRecordFilterKey({ symbol: "BTC", direction: "short" }));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log("public portal runtime tests passed");
