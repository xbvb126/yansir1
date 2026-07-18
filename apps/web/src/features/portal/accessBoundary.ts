export type AccessRequirement = "ai-claw" | "realtime-radar" | "save-watchlist" | "full-performance";
export type AccessIdentity = { signedIn: boolean; plan: string };
export type AccessDecision = { allowed: boolean; next: "login" | "plans" | null };

export function accessDecision(requirement: AccessRequirement, identity: AccessIdentity): AccessDecision {
  if (!identity.signedIn) return { allowed: false, next: "login" };
  if (requirement === "save-watchlist") return identity.signedIn ? { allowed: true, next: null } : { allowed: false, next: "login" };
  if (requirement === "ai-claw") return identity.signedIn ? { allowed: true, next: null } : { allowed: false, next: "login" };
  const paid = /vip|svip|pro/i.test(identity.plan);
  return paid ? { allowed: true, next: null } : { allowed: false, next: "plans" };
}
