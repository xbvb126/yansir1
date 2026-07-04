export type TeamLevel = 1 | 2 | 3;

export type TeamMember = {
  id: string;
  name: string;
  phone: string;
  plan: string;
  status: string;
  level: TeamLevel;
  joinedAt: string;
};

export type TeamOrder = {
  id: string;
  userId: string;
  userName: string;
  planName: string;
  amount: number;
  status: string;
  paidAt?: string;
  createdAt: string;
  level: TeamLevel;
};

export type TeamCommission = {
  level: TeamLevel;
  rate: number;
  members: number;
  paidOrders: number;
  commission: number;
};

export type TeamDashboard = {
  inviteCode: string;
  inviteUrl: string;
  summary: {
    members: number;
    paidOrders: number;
    commission: number;
  };
  commissions: TeamCommission[];
  members: TeamMember[];
  orders: TeamOrder[];
};
