import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { TeamDashboard, TeamLevel, TeamMember, TeamOrder } from "./team.types";

const COMMISSION_RATES: Record<TeamLevel, number> = {
  1: 0.18,
  2: 0.08,
  3: 0.03
};

type TeamMemberRow = {
  id: string;
  name: string;
  phone: string | null;
  plan: string | null;
  status: string;
  level: number;
  joined_at: Date | string;
};

type TeamOrderRow = {
  id: string;
  user_id: string;
  user_name: string;
  plan_name: string;
  amount_cents: number;
  status: string;
  paid_at: Date | string | null;
  created_at: Date | string;
  level: number;
};

type OwnerRow = {
  id: string;
};

@Injectable()
export class TeamRepository {
  constructor(private readonly database: DatabaseService) {}

  async getDashboard(ownerUserId: string): Promise<TeamDashboard> {
    if (!ownerUserId) {
      return emptyDashboard("");
    }

    const owner = await this.findOwner(ownerUserId);
    if (!owner) {
      return emptyDashboard("");
    }

    const members = await this.findMembers(ownerUserId);
    const orders = await this.findOrders(ownerUserId);
    const dashboard = buildDashboard(ownerUserId, members, orders);
    return dashboard;
  }

  private async findOwner(ownerUserId: string) {
    const rows = await this.database.query<OwnerRow>(
      `
        select id::text
        from users
        where id::text = $1
        limit 1
      `,
      [ownerUserId]
    );

    return rows[0] ?? null;
  }

  private async findMembers(ownerUserId: string): Promise<TeamMember[]> {
    const rows = await this.database.query<TeamMemberRow>(
      `
        with recursive team_tree as (
          select
            tm.member_user_id,
            1 as level,
            tm.created_at as joined_at
          from team_members tm
          where tm.owner_user_id::text = $1
            and tm.status = 'active'
          union all
          select
            child.member_user_id,
            team_tree.level + 1 as level,
            child.created_at as joined_at
          from team_members child
          join team_tree on child.owner_user_id = team_tree.member_user_id
          where child.status = 'active'
            and team_tree.level < 3
        )
        select distinct on (u.id)
          u.id::text,
          u.name,
          u.phone,
          coalesce(p.name, 'Free') as plan,
          u.status,
          team_tree.level,
          team_tree.joined_at
        from team_tree
        join users u on u.id = team_tree.member_user_id
        left join subscriptions s on s.user_id = u.id and s.status = 'active'
        left join plans p on p.id = s.plan_id
        order by u.id, team_tree.level asc, team_tree.joined_at asc
      `,
      [ownerUserId]
    );

    if (rows.length) {
      return rows.map(mapMemberRow);
    }

    return [];
  }

  private async findOrders(ownerUserId: string): Promise<TeamOrder[]> {
    const rows = await this.database.query<TeamOrderRow>(
      `
        with recursive team_tree as (
          select tm.member_user_id, 1 as level
          from team_members tm
          where tm.owner_user_id::text = $1
            and tm.status = 'active'
          union all
          select child.member_user_id, team_tree.level + 1 as level
          from team_members child
          join team_tree on child.owner_user_id = team_tree.member_user_id
          where child.status = 'active'
            and team_tree.level < 3
        )
        select
          bo.id::text,
          bo.user_id::text,
          u.name as user_name,
          p.name as plan_name,
          bo.amount_cents,
          bo.status,
          bo.paid_at,
          bo.created_at,
          team_tree.level
        from billing_orders bo
        join team_tree on team_tree.member_user_id = bo.user_id
        join users u on u.id = bo.user_id
        join plans p on p.id = bo.plan_id
        order by bo.created_at desc
        limit 100
      `,
      [ownerUserId]
    );

    if (rows.length) {
      return rows.map(mapOrderRow);
    }

    return [];
  }
}

function buildDashboard(ownerUserId: string, members: TeamMember[], orders: TeamOrder[]): TeamDashboard {
  const commissions = ([1, 2, 3] as TeamLevel[]).map((level) => {
    const levelOrders = orders.filter((order) => order.level === level && order.status === "paid");
    const commission = levelOrders.reduce((sum, order) => sum + order.amount * COMMISSION_RATES[level], 0);
    return {
      level,
      rate: COMMISSION_RATES[level],
      members: members.filter((member) => member.level === level).length,
      paidOrders: levelOrders.length,
      commission
    };
  });
  const paidOrders = orders.filter((order) => order.status === "paid").length;
  const commission = commissions.reduce((sum, item) => sum + item.commission, 0);
  return {
    inviteCode: inviteCodeFor(ownerUserId),
    inviteUrl: `/?view=register&invite=${inviteCodeFor(ownerUserId)}`,
    summary: {
      members: members.length,
      paidOrders,
      commission
    },
    commissions,
    members,
    orders
  };
}

function emptyDashboard(ownerUserId: string): TeamDashboard {
  return buildDashboard(ownerUserId, [], []);
}

function mapMemberRow(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    plan: row.plan ?? "Free",
    status: row.status,
    level: normalizeLevel(row.level),
    joinedAt: new Date(row.joined_at).toISOString()
  };
}

function mapOrderRow(row: TeamOrderRow): TeamOrder {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    planName: row.plan_name,
    amount: Number(row.amount_cents) / 100,
    status: row.status,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    level: normalizeLevel(row.level)
  };
}

function normalizeLevel(level: number): TeamLevel {
  if (level === 2) return 2;
  if (level === 3) return 3;
  return 1;
}

function inviteCodeFor(userId: string) {
  return userId ? userId.replace(/\W/g, "").slice(-6).toUpperCase().padStart(6, "0") : "";
}
