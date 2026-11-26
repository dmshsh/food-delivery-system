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

export type Language = 'en' | 'ru' | 'kk';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  language: Language;
}

export interface Profile {
  phone: string;
  address: string;
  bonusPoints: number;
}

/** The fuller picture behind the "my profile" page. */
export interface FullProfile {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  language: Language;
  passwordChangedAt: string;
  phone: string | null;
  address: string | null;
  bonusPoints: number | null;
  orderCount: number;
  deliveredCount: number;
  spentTiyn: number;
}

export interface ProfileBody {
  fullName: string;
  phone: string;
  address: string;
  language: Language;
}

export interface SessionResponse {
  user: User;
  profile: Profile | null;
}

export type DietTag =
  | 'vegetarian'
  | 'vegan'
  | 'spicy'
  | 'contains-nuts'
  | 'gluten-free'
  | 'halal'
  | 'dairy-free';

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  category: string;
  priceTiyn: number;
  sortOrder?: number;
  /** Null where nobody has measured the dish yet. */
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  ingredients: string;
  tags: DietTag[];
}

/** The filters on the dish search. */
export interface DishFilter {
  search?: string;
  maxCalories?: number | '';
  minCalories?: number | '';
  maxPriceTiyn?: number | '';
  tags?: DietTag[];
  withoutTags?: DietTag[];
  sort?: 'menu' | 'price' | 'calories';
}

export interface MenuResponse {
  items: MenuItem[];
  filter: {
    search: string | null;
    minCalories: number | null;
    maxCalories: number | null;
    maxPriceTiyn: number | null;
    tags: DietTag[];
    withoutTags: DietTag[];
    sort: 'menu' | 'price' | 'calories';
  };
  bounds: {
    minPriceTiyn: number;
    maxPriceTiyn: number;
    minCalories: number;
    maxCalories: number;
    total: number;
  };
  availableTags: DietTag[];
}

// ------------------------------------------------------------- nutrition

export interface Advice {
  code: string;
  severity: 'info' | 'note' | 'warning';
  values: Record<string, number>;
}

export interface NutritionSummary {
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  unknownDishes: number;
  incomplete: boolean;
  shareOfDayPercent: number;
  energySplit: { protein: number; fat: number; carbs: number };
  advice: Advice[];
  referenceDay: { calories: number; protein: number; fat: number; carbs: number };
}

export interface NutritionResponse {
  summary: NutritionSummary;
  dishes: { id: number; name: string; quantity: number; caloriesKcal: number | null; tags: DietTag[] }[];
}

export interface OrderItem {
  itemId: number;
  name: string;
  quantity: number;
  unitPriceTiyn?: number; // not sent to the kitchen
  /** Who this line is for in a group order; empty means the order as a whole. */
  participant?: string;
  caloriesKcal?: number | null;
}

/** Who owes what in a group order. */
export interface OrderSplit {
  shares: { name: string; itemCount: number; totalTiyn: number }[];
  unassignedTiyn: number;
  payableTiyn: number;
  discountNote: boolean;
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
  isGroup?: boolean;
  participants?: string[];
  split?: OrderSplit | null;
  nutrition?: NutritionSummary;
  /** Shown to the customer only: the four digits read out at the door. */
  confirmationCode?: string | null;
  confirmedAt?: string | null;
  /** Kitchen view only. */
  needsConfirmation?: boolean;
  confirmationAttempts?: number;
}

export interface OrderResult {
  order: Order;
  replayed: boolean;
}

/** The filters above the order history. */
export interface HistoryFilter {
  status?: OrderStatus | '';
  search?: string;
  from?: string;
  to?: string;
}

/** What a past order would cost to order again today. */
export interface RepeatOrder {
  orderId: number;
  lines: {
    itemId: number;
    name: string | null;
    quantity: number;
    paidPriceTiyn: number;
    priceTiyn: number | null;
    available: boolean;
    priceChanged: boolean;
  }[];
  items: { itemId: number; quantity: number }[];
  totalTiyn: number;
  previousTotalTiyn: number;
  unavailable: string[];
  repricedCount: number;
}

export interface CreateOrderBody {
  attemptId: string;
  deliveryAddress: string;
  deliveryTime: string; // 'ASAP' or an ISO date-time
  notes: string;
  bonusPoints: number;
  /** Empty for an ordinary order; two or more names for a group order. */
  participants: string[];
  items: { itemId: number; quantity: number; participant?: string }[];
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
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  ingredients: string;
  tags: DietTag[];
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


// ------------------------------------------------------------ new reports

export interface DailyReport {
  days: {
    day: string;
    orders: number;
    paidTiyn: number;
    discountTiyn: number;
    pointsEarned: number;
    customers: number;
    averageOrderTiyn: number;
  }[];
  summary: {
    dayCount: number;
    orderCount: number;
    paidTiyn: number;
    discountTiyn: number;
    averageOrderTiyn: number;
    averageDayTiyn: number;
    bestDay: { day: string; paidTiyn: number } | null;
  };
}

export interface DishReport {
  dishes: {
    id: number;
    name: string;
    category: string;
    available: boolean;
    currentPriceTiyn: number;
    quantity: number;
    revenueTiyn: number;
    orders: number;
    sharePercent: number;
  }[];
  summary: {
    dishCount: number;
    soldCount: number;
    neverOrdered: string[];
    totalQuantity: number;
    revenueTiyn: number;
  };
}

export interface CustomerReport {
  customers: {
    id: number;
    fullName: string;
    email: string;
    bonusPoints: number;
    orders: number;
    paidTiyn: number;
    lastOrderAt: string | null;
    averageRating: number | null;
    reviews: number;
    averageOrderTiyn: number;
  }[];
  summary: {
    customerCount: number;
    activeCount: number;
    returningCount: number;
    paidTiyn: number;
    averagePerCustomerTiyn: number;
  };
}

// --------------------------------------------------------- blocked addresses

export interface BlockedIp {
  ip: string;
  reason: string;
  failures: number;
  failures24h: number;
  manual: boolean;
  blockedUntil: string | null;
  createdAt: string;
  blockedByEmail: string | null;
  active: boolean;
}

export interface IpList {
  addresses: BlockedIp[];
  rules: { maxFailures: number; windowMinutes: number; blockMinutes: number };
  suspicious: { ip: string; failures: number; accounts: number; lastAt: string }[];
}


// ------------------------------------------------------------- the chart

export type ChartMetric = 'revenue' | 'orders' | 'averageOrder' | 'customers';
export type ChartBucket = 'day' | 'week' | 'month';

export interface ChartSeries {
  metric: ChartMetric;
  bucket: ChartBucket;
  unit: 'tiyn' | 'count';
  from: string;
  to: string;
  points: {
    bucket: string;
    /** Null where the metric has no meaning for that bucket, such as an average with no orders. */
    value: number | null;
    paidTiyn: number;
    orders: number;
    customers: number;
  }[];
  summary: {
    bucketCount: number;
    max: number;
    min: number;
    average: number;
    totalPaidTiyn: number;
    orderCount: number;
  };
}
