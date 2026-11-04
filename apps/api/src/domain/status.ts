// Order status rules. Pure functions, no framework imports.
// The same graph is enforced inside PostgreSQL by the trigger in sql/schema.sql.

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED',
  'PAYMENT_REJECTED',
  'EXPIRED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'PAYMENT_REJECTED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_REJECTED: [],
  EXPIRED: [],
};

/** Statuses the kitchen is allowed to see (paid orders only). */
export const KITCHEN_VISIBLE: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'];

/** The only step the kitchen may take from a status. */
export const KITCHEN_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'DELIVERED',
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isKitchenStep(from: OrderStatus, to: unknown): boolean {
  return isOrderStatus(to) && KITCHEN_NEXT[from] === to;
}
