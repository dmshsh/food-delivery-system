export type Role = 'CUSTOMER' | 'KITCHEN' | 'ACCOUNTANT' | 'ADMIN';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'PAYMENT_REJECTED'
  | 'EXPIRED';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}

export interface Profile {
  phone: string;
  address: string;
  bonusPoints: number;
}

export interface SessionResponse {
  user: User;
  profile: Profile | null;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  category: string;
  priceTiyn: number;
  sortOrder?: number;
}

export interface OrderItem {
  itemId: number;
  name: string;
  quantity: number;
  unitPriceTiyn?: number; // not sent to the kitchen
}

export interface Feedback {
  rating: number;
  comment: string;
  reply: string;
  createdAt: string;
}

export interface Order {
  id: number;
  status: OrderStatus;
  createdAt: string;
  expiresAt: string;
  deliveryTime: string | null; // null = as soon as possible
  itemCount: number;
  notes: string;
  items: OrderItem[];
  // customer only:
  attemptId?: string;
  deliveryAddress?: string;
  totalTiyn?: number;
  bonusRequested?: number;
  bonusSpent?: number;
  bonusEarned?: number;
  discountTiyn?: number;
  payableTiyn?: number;
  feedback?: Feedback | null;
}

export interface OrderResult {
  order: Order;
  replayed: boolean;
}

export interface CreateOrderBody {
  attemptId: string;
  deliveryAddress: string;
  deliveryTime: string; // 'ASAP' or an ISO date-time
  notes: string;
  bonusPoints: number;
  items: { itemId: number; quantity: number }[];
}

export type CheckoutOutcome = 'success' | 'rejected' | 'timeout' | 'lost_reply';

export interface ReportRow {
  id: number;
  createdAt: string;
  status: OrderStatus;
  itemCount: number;
  totalTiyn: number;
  bonusSpent: number;
  bonusEarned: number;
  discountTiyn: number;
  paidTiyn: number;
  paymentOutcome: 'APPROVED' | 'REJECTED' | 'TIMEOUT' | 'NOT_COMPLETED';
  rating: number | null;
}

export interface Report {
  orders: ReportRow[];
  summary: {
    orderCount: number;
    approvedOrderCount: number;
    approvedTotalTiyn: number;
    approvedPaidTiyn: number;
    bonusDiscountTiyn: number;
    bonusEarnedPoints: number;
    ratedOrderCount: number;
    averageRating: number;
  };
}

// ---------------------------------------------------------------- bonus

export interface BonusTransaction {
  id: number;
  orderId: number | null;
  kind: 'EARNED' | 'SPENT' | 'ADJUSTED';
  points: number;
  balanceAfter: number;
  note: string;
  createdAt: string;
}

export interface BonusAccount {
  balance: number;
  history: BonusTransaction[];
  totals: { earned: number; spent: number };
  rules: { pointTiyn: number; earnPercent: number; maxRedeemPercent: number };
}

// -------------------------------------------------------------- feedback

export interface FeedbackRow {
  id: number;
  orderId: number;
  rating: number;
  comment: string;
  reply: string;
  createdAt: string;
  repliedAt: string | null;
  customerName: string;
  repliedByName: string | null;
}

export interface FeedbackList {
  feedback: FeedbackRow[];
  summary: { count: number; average: number; unanswered: number; byRating: Record<string, number> };
}

// ----------------------------------------------------------------- admin

export interface AdminMenuItem extends MenuItem {
  available: boolean;
  sortOrder: number;
  timesOrdered: number;
}

export interface MenuItemBody {
  name: string;
  description: string;
  category: string;
  priceTiyn: number;
  available: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  blockedUntil: string | null;
  blockReason: string;
  failedAttempts: number;
  bonusPoints: number | null;
  orderCount: number;
}

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface SecurityEvent {
  id: number;
  kind: string;
  severity: Severity;
  email: string;
  ip: string;
  detail: string;
  createdAt: string;
  userId: number | null;
  userName: string | null;
}

export interface SecurityJournal {
  events: SecurityEvent[];
  last24h: Record<Severity, number>;
}

export interface AdminOverview {
  users: { total: number; disabled: number; blocked: number };
  orders: { total: number; byStatus: Record<string, number> };
  money: { approvedPayments: number; approvedTotalTiyn: number };
  feedback: { count: number; average: number };
  bonus: { outstandingPoints: number };
  security: { criticalLast24h: number };
}
