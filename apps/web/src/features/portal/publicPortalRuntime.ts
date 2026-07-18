export type PortalIdentitySnapshot = {
  verified: boolean;
  userId?: string | null;
  role?: string | null;
};

export type PortalSignalSource = "private" | "public";

export function hasVerifiedIdentity(identity: PortalIdentitySnapshot) {
  return identity.verified && Boolean(identity.userId) && identity.role !== "guest";
}

export function portalSignalSource(identity: PortalIdentitySnapshot): PortalSignalSource {
  return hasVerifiedIdentity(identity) ? "private" : "public";
}

export function canCreateMemberOrder(identity: PortalIdentitySnapshot) {
  return hasVerifiedIdentity(identity);
}

export function canPayMemberOrder(identity: PortalIdentitySnapshot) {
  return hasVerifiedIdentity(identity);
}

export type PrivatePortalState<TUser, TEntitlements, TOrder, TTeam> = {
  currentUser: TUser;
  entitlements: TEntitlements;
  orders: TOrder[];
  teamDashboard: TTeam;
};

export function effectivePrivatePortalState<TUser, TEntitlements, TOrder, TTeam>(
  state: PrivatePortalState<TUser, TEntitlements, TOrder, TTeam>,
  identity: PortalIdentitySnapshot
): PrivatePortalState<TUser, TEntitlements, TOrder, TTeam> | {
  currentUser: null;
  entitlements: null;
  orders: TOrder[];
  teamDashboard: null;
} {
  if (hasVerifiedIdentity(identity)) return state;
  return { currentUser: null, entitlements: null, orders: [], teamDashboard: null };
}

export function portalSignalsForResult<T>(
  source: PortalSignalSource,
  result: { ok: true; signals: T[] } | { ok: false }
): T[] | null {
  if (result.ok) return result.signals;
  return source === "public" ? [] : null;
}

export type PortalRequestToken = {
  generation: number;
  signal: AbortSignal;
};

export type PortalRequestCoordinator = {
  begin: () => PortalRequestToken;
  invalidate: () => void;
  isCurrent: (token: PortalRequestToken) => boolean;
};

export function createPortalRequestCoordinator(): PortalRequestCoordinator {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      generation += 1;
      return { generation, signal: controller.signal };
    },
    invalidate() {
      controller?.abort();
      controller = null;
      generation += 1;
    },
    isCurrent(token) {
      return token.generation === generation && !token.signal.aborted;
    }
  };
}

export function normalizePublicTrackRecordSymbol(symbol: string) {
  return String(symbol || "").trim().toUpperCase().replace(/USDT$/, "");
}

export function publicTrackRecordFilterKey(filter: { symbol: string; direction: string }) {
  return `${normalizePublicTrackRecordSymbol(filter.symbol) || "all"}:${filter.direction || "all"}`;
}
