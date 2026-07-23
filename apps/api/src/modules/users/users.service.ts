import { Injectable } from "@nestjs/common";
import { verifyAuthHeader } from "./auth-tokens";
import { buildEntitlements, UserEntitlements } from "./entitlements";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getCurrentUser(identity?: string) {
    const resolvedIdentity = this.resolveIdentity(identity);
    const user = (resolvedIdentity ? await this.usersRepository.findCurrentUser(resolvedIdentity) : null) ?? anonymousUser();
    const planLimits = user.id ? await this.usersRepository.getPlanEntitlements(user.id) : null;
    const dailyPushUsage = user.id ? await this.usersRepository.getDailyPushUsage(user.id) : emptyDailyPushUsage();
    const entitlements = withDailyPushUsage(buildEntitlements(user, planLimits), dailyPushUsage);
    return {
      user: { ...user, signalUsed: dailyPushUsage.sent, signalQuota: entitlements.maxPushPerDay },
      entitlements,
      dailyPushUsage,
      feishuConfigured: Boolean(process.env.FEISHU_WEBHOOK_URL)
    };
  }

  async listUsers() {
    return { users: await this.usersRepository.findAll() };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.usersRepository.updateUser(userId, dto);
    const planLimits = await this.usersRepository.getPlanEntitlements(user.id);
    const dailyPushUsage = await this.usersRepository.getDailyPushUsage(user.id);
    const entitlements = withDailyPushUsage(buildEntitlements(user, planLimits), dailyPushUsage);
    return {
      user: { ...user, signalUsed: dailyPushUsage.sent, signalQuota: entitlements.maxPushPerDay },
      entitlements,
      dailyPushUsage,
      users: await this.usersRepository.findAll()
    };
  }

  async getCurrentEntitlements(identity?: string) {
    const resolvedIdentity = this.resolveIdentity(identity);
    const user = (resolvedIdentity ? await this.usersRepository.findCurrentUser(resolvedIdentity) : null) ?? anonymousUser();
    const planLimits = user.id ? await this.usersRepository.getPlanEntitlements(user.id) : null;
    const dailyPushUsage = user.id ? await this.usersRepository.getDailyPushUsage(user.id) : emptyDailyPushUsage();
    return {
      userId: user.id,
      entitlements: withDailyPushUsage(buildEntitlements(user, planLimits), dailyPushUsage),
      dailyPushUsage
    };
  }

  async getFormalEntitlementsById(userId: string) {
    const exactUserId = String(userId || "").trim();
    if (!exactUserId) throw new Error("formal_user_id_required");
    const user = await this.usersRepository.findByIdStrict(exactUserId);
    if (!user || user.id !== exactUserId) throw new Error(`formal_user_not_found:${exactUserId}`);
    const planLimits = await this.usersRepository.getPlanEntitlementsStrict(exactUserId);
    if (!planLimits) throw new Error(`formal_plan_entitlements_not_found:${exactUserId}`);
    const dailyPushUsage = await this.usersRepository.getDailyPushUsageStrict(exactUserId);
    return {
      userId: exactUserId,
      entitlements: withDailyPushUsage(buildEntitlements(user, planLimits), dailyPushUsage),
      dailyPushUsage
    };
  }

  resolveIdentity(identity?: string) {
    return verifyAuthHeader(identity)?.sub ?? identity;
  }
}

function withDailyPushUsage(entitlements: UserEntitlements, usage: { sent: number; skipped: number; failed: number; total: number }) {
  const maxPushPerDay = Number(entitlements.maxPushPerDay ?? 0);
  return {
    ...entitlements,
    dailyPushUsed: usage.sent,
    dailyPushSkipped: usage.skipped,
    dailyPushFailed: usage.failed,
    remainingDailyPushes: Math.max(0, maxPushPerDay - usage.sent),
    remainingSignals: Math.max(0, maxPushPerDay - usage.sent)
  };
}

function emptyDailyPushUsage() {
  const now = new Date();
  return {
    sent: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    periodStart: new Date(now.setHours(0, 0, 0, 0)).toISOString(),
    periodEnd: new Date(now.setHours(24, 0, 0, 0)).toISOString()
  };
}

function anonymousUser() {
  return {
    id: "",
    name: "未登录",
    phone: "",
    role: "member" as const,
    plan: "Free",
    status: "trial" as const,
    expiresAt: "",
    signalUsed: 0,
    signalQuota: 10,
    feishuEnabled: false,
    teamSeats: "0/0"
  };
}
