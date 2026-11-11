import type { OrderStatus } from './types';

export function formatKzt(tiyn: number): string {
  return `${(tiyn / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} KZT`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDelivery(deliveryTime: string | null): string {
  return deliveryTime ? formatDateTime(deliveryTime) : 'As soon as possible';
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Waiting for payment',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PAYMENT_REJECTED: 'Payment rejected',
  EXPIRED: 'Time limit passed',
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-sky-100 text-sky-900',
  PREPARING: 'bg-violet-100 text-violet-900',
  READY: 'bg-emerald-100 text-emerald-900',
  DELIVERED: 'bg-stone-200 text-stone-800',
  CANCELLED: 'bg-stone-200 text-stone-800',
  PAYMENT_REJECTED: 'bg-red-100 text-red-900',
  EXPIRED: 'bg-red-100 text-red-900',
};

export const ALL_STATUSES = Object.keys(STATUS_LABEL) as OrderStatus[];

/** Readable message from an RTK Query error (server message, or a network problem). */
export function errorMessage(error: unknown): string {
  const e = error as { status?: number | string; data?: { message?: string | string[] } } | undefined;
  if (!e) return 'Something went wrong.';
  if (e.status === 'FETCH_ERROR' || e.status === 'TIMEOUT_ERROR') return 'Network problem: the server did not answer.';
  const message = e.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return message ?? 'Something went wrong.';
}

export function errorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | undefined)?.data?.code;
}

/** True when the request may not have reached the server (so it is safe and right to retry the SAME attempt). */
export function isNetworkError(error: unknown): boolean {
  const status = (error as { status?: number | string } | undefined)?.status;
  return status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR';
}

/** "120 points" / "1 point". */
export function formatPoints(points: number): string {
  return `${points.toLocaleString('en-US')} point${points === 1 ? '' : 's'}`;
}

/** Filled and empty stars, for a rating that is always a whole number from 1 to 5. */
export function stars(rating: number): string {
  const whole = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(whole) + '☆'.repeat(5 - whole);
}

export const SEVERITY_STYLE: Record<string, string> = {
  INFO: 'bg-stone-200 text-stone-800',
  WARNING: 'bg-amber-100 text-amber-900',
  CRITICAL: 'bg-red-100 text-red-900',
};

/** LOGIN_FAILED -> "Login failed". */
export function humanEvent(kind: string): string {
  const words = kind.toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

export const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  KITCHEN: 'Kitchen',
  ACCOUNTANT: 'Accountant',
  ADMIN: 'Administrator',
};
