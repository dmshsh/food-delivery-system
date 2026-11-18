import type { Language, MessageKey } from '@/i18n/dictionaries';
import type { OrderStatus } from './types';

/** Which locale each language formats numbers and dates with. */
const LOCALES: Record<Language, string> = { en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' };

export function localeOf(lang: Language | string | undefined): string {
  return LOCALES[(lang as Language) ?? 'en'] ?? 'en-US';
}

/** Money, always from whole tiyn, never from a floating point total. */
export function formatKzt(tiyn: number, lang: Language | string = 'en'): string {
  const amount = (tiyn / 100).toLocaleString(localeOf(lang), { maximumFractionDigits: 2 });
  return lang === 'en' ? `${amount} KZT` : `${amount} ₸`;
}

export function formatDateTime(iso: string, lang: Language | string = 'en'): string {
  return new Date(iso).toLocaleString(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string, lang: Language | string = 'en'): string {
  return new Date(iso).toLocaleDateString(localeOf(lang), { dateStyle: 'medium' });
}

export function formatNumber(value: number, lang: Language | string = 'en'): string {
  return value.toLocaleString(localeOf(lang));
}

/** The message key for a status, so the label comes from the dictionary. */
export function statusKey(status: OrderStatus): MessageKey {
  return `status.${status}` as MessageKey;
}

/** The message key for a role. */
export function roleKey(role: string): MessageKey {
  return `role.${role}` as MessageKey;
}

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

export const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED',
  'PAYMENT_REJECTED',
  'EXPIRED',
];

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

/**
 * The same error, in the reader's language where we have a translation for it.
 *
 * The API answers in English and carries a short code alongside each message.
 * Codes we know are translated; anything else keeps the server's own sentence,
 * which is more useful than a generic "something went wrong".
 */
export function translateError(
  error: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const status = (error as { status?: number | string } | undefined)?.status;
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') return t('common.networkError');
  const code = errorCode(error);
  if (code) {
    const key = `error.${code}` as MessageKey;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  const fallback = errorMessage(error);
  return fallback === 'Something went wrong.' ? t('common.error') : fallback;
}

/** "120 points" / "1 point" — the word comes from the dictionary. */
export function formatPoints(points: number, lang: Language | string = 'en', word = 'points'): string {
  return `${formatNumber(points, lang)} ${word}`;
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

/** LOGIN_FAILED -> "Login failed". Event names stay in English: they are a technical record. */
export function humanEvent(kind: string): string {
  const words = kind.toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

/** True when the request may not have reached the server (so it is safe and right to retry the SAME attempt). */
export function isNetworkError(error: unknown): boolean {
  const status = (error as { status?: number | string } | undefined)?.status;
  return status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR';
}

/** Rough password strength, mirroring the rule the server applies. */
export type Strength = 'weak' | 'fair' | 'strong';

export function passwordStrength(value: string): Strength {
  if (typeof value !== 'string' || value.length < 8) return 'weak';
  let variety = 0;
  if (/[a-zа-я]/.test(value)) variety++;
  if (/[A-ZА-Я]/.test(value)) variety++;
  if (/[0-9]/.test(value)) variety++;
  if (/[^a-zA-Z0-9Ѐ-ӿ]/.test(value)) variety++;
  if (value.length >= 12 && variety >= 3) return 'strong';
  if (value.length >= 10 && variety >= 2) return 'fair';
  return variety >= 3 ? 'fair' : 'weak';
}
