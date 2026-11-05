export type Role = 'CUSTOMER' | 'KITCHEN' | 'ACCOUNTANT';

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
}

export interface OrderItem {
  itemId: number;
  name: string;
  quantity: number;
  unitPriceTiyn?: number; // not sent to the kitchen
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
  items: { itemId: number; quantity: number }[];
}

export type CheckoutOutcome = 'success' | 'rejected' | 'timeout' | 'lost_reply';

export interface ReportRow {
  id: number;
  createdAt: string;
  status: OrderStatus;
  itemCount: number;
  totalTiyn: number;
  paymentOutcome: 'APPROVED' | 'REJECTED' | 'TIMEOUT' | 'NOT_COMPLETED';
}

export interface Report {
  orders: ReportRow[];
  summary: { orderCount: number; approvedOrderCount: number; approvedTotalTiyn: number };
}
