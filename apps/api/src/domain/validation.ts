// Input validation for registration and checkout. Pure functions, no framework imports.
//
// Every file in `domain/` imports nothing but Node built-ins. That is what lets
// `npm test` run these rules straight from the TypeScript source, with no build
// step and no mocking: the tests exercise the same code the server runs.
import { createHash } from 'node:crypto';

export class ValidationError extends Error {
  code: string;
  constructor(message: string, code = 'validation_failed') {
    super(message);
    this.code = code;
  }
}

// ---------- passwords ----------

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Passwords so common they are tried first in any attack. A short list on
 * purpose: it catches the worst choices without pretending to be a dictionary.
 */
const TOO_COMMON = new Set([
  'password', 'password1', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1',
  'abc12345', 'football', 'baseball', 'sunshine', 'princess', 'starwars',
]);

/**
 * A password has to be long enough, mixed enough to survive a guess, and not be
 * the person's own name or email, which is the first thing anyone would try.
 *
 * Cyrillic counts as letters: the site is read in Russian and Kazakh, and a
 * password written in those alphabets must not be refused for "having no letters".
 */
export function validatePassword(value: unknown, owner: { email?: string; fullName?: string } = {}): string {
  if (typeof value !== 'string') throw new ValidationError('Enter a password.', 'weak_password');
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Use a password with ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
      'weak_password',
    );
  }
  if (!/[a-zA-ZЀ-ӿ]/.test(value) || !/[0-9]/.test(value)) {
    throw new ValidationError('Use at least one letter and one digit.', 'weak_password');
  }
  const lower = value.toLowerCase();
  if (TOO_COMMON.has(lower)) {
    throw new ValidationError('This password is one of the most common ones. Choose another.', 'weak_password');
  }
  const localPart = (owner.email ?? '').split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    throw new ValidationError('A password must not contain your email address.', 'weak_password');
  }
  for (const part of (owner.fullName ?? '').toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lower.includes(part)) {
      throw new ValidationError('A password must not contain your name.', 'weak_password');
    }
  }
  return value;
}

/** True when this password is one of the few the list above refuses outright. */
export function isCommonPassword(value: string): boolean {
  return TOO_COMMON.has((value ?? '').toLowerCase());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ValidationError(`Please enter a valid ${field}.`);
  }
  return value.trim();
}

// ---------- registration ----------

export interface RegistrationInput {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  /** The language the site answers in. Added at registration, changeable in the profile. */
  language: Language;
}

export function validateRegistration(data: unknown): RegistrationInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const fullName = text(data.fullName, 'full name', 80);
  const email = text(data.email, 'email', 160).toLowerCase();
  const phone = text(data.phone, 'phone number', 30);
  const address = text(data.address, 'address', 240);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Please enter a valid email address.');
  if (!isPhone(phone)) throw new ValidationError('Please enter a valid phone number.');
  const language = validateLanguage(data.language ?? DEFAULT_LANGUAGE);
  // The password is judged against the name and the email, because "alice2024"
  // for alice@example.test is the first guess anyone would make.
  const password = validatePassword(data.password, { email, fullName });
  return { fullName, email, phone, address, password, language };
}

/** A phone number: 7 to 15 digits, with the usual spacing and brackets allowed around them. */
export function isPhone(value: string): boolean {
  if (!/^[+0-9 ()-]{7,30}$/.test(value)) return false;
  const digits = phoneDigits(value);
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Only the digits of a phone number.
 *
 * Two people cannot share a number, but the same number can be written in many
 * ways, so "+7 700 111 22 33" and "77001112233" have to compare equal. The same
 * reduction exists in the database as `phone_digits()`, and a test keeps the two
 * in step.
 */
export function phoneDigits(value: string): string {
  return digitsOnly(value);
}

/** Just the digits of a string. Used for phone numbers, and for "is this search an order number?". */
export function digitsOnly(value: string): string {
  return (value ?? '').replace(/[^0-9]/g, '');
}

// ---------- checkout ----------

export const MAX_DISTINCT_ITEMS = 20;
export const MAX_QUANTITY = 20;
export const MAX_DELIVERY_DAYS = 7;
export const MAX_BONUS_POINTS = 1_000_000;

export interface OrderLine {
  itemId: number;
  quantity: number;
}

export interface OrderInput {
  attemptId: string;
  lines: OrderLine[];
  deliveryAddress: string;
  deliveryTime: Date | null; // null = as soon as possible
  notes: string;
  /** Bonus points the customer asked to spend on this order (0 = none). */
  bonusPoints: number;
  /** Fingerprint of the order details: the same attempt must always carry the same details. */
  hash: string;
}

export function validateOrderInput(data: unknown, now: Date): OrderInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');

  const attemptId = data.attemptId;
  if (typeof attemptId !== 'string' || attemptId.length < 1 || attemptId.length > 100) {
    throw new ValidationError('Start a new checkout to create an attempt ID.');
  }

  const address = data.deliveryAddress;
  if (typeof address !== 'string' || !address.trim() || address.trim().length > 240) {
    throw new ValidationError('Enter a delivery address with up to 240 characters.');
  }

  const notes = data.notes ?? '';
  if (typeof notes !== 'string' || notes.trim().length > 300) {
    throw new ValidationError('Delivery notes must have at most 300 characters.');
  }

  let deliveryTime: Date | null = null;
  const rawTime = data.deliveryTime ?? 'ASAP';
  if (rawTime !== 'ASAP') {
    const requested = typeof rawTime === 'string' ? new Date(rawTime) : new Date(NaN);
    const latest = new Date(now.getTime() + MAX_DELIVERY_DAYS * 24 * 3600 * 1000);
    if (Number.isNaN(requested.getTime()) || requested < now || requested > latest) {
      throw new ValidationError(`Choose a delivery time within the next ${MAX_DELIVERY_DAYS} days.`);
    }
    deliveryTime = requested;
  }

  const items = data.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_DISTINCT_ITEMS) {
    throw new ValidationError(`Add at least one dish. Maximum ${MAX_DISTINCT_ITEMS} different dishes.`);
  }
  const lines: OrderLine[] = [];
  for (const item of items) {
    if (!isObject(item) || !Number.isInteger(item.itemId) || !Number.isInteger(item.quantity)) {
      throw new ValidationError('Dish IDs and quantities must be whole numbers.');
    }
    const quantity = item.quantity as number;
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      throw new ValidationError(`Choose a quantity between 1 and ${MAX_QUANTITY} for each dish.`);
    }
    lines.push({ itemId: item.itemId as number, quantity });
  }
  lines.sort((a, b) => a.itemId - b.itemId);
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) {
    throw new ValidationError('Combine repeated dishes into one quantity.');
  }

  const rawBonus = data.bonusPoints ?? 0;
  if (!Number.isInteger(rawBonus) || (rawBonus as number) < 0 || (rawBonus as number) > MAX_BONUS_POINTS) {
    throw new ValidationError(`Bonus points must be a whole number between 0 and ${MAX_BONUS_POINTS}.`);
  }
  const bonusPoints = rawBonus as number;

  // The fingerprint covers the bonus points too: spending points is part of the order
  // details, so the same attempt ID can never come back with a different discount.
  const hash = createHash('sha256')
    .update(JSON.stringify([lines, address.trim(), deliveryTime ? deliveryTime.toISOString() : 'ASAP', notes.trim(), bonusPoints]))
    .digest('hex');

  return { attemptId, lines, deliveryAddress: address.trim(), deliveryTime, notes: notes.trim(), bonusPoints, hash };
}

// ---------- checkout outcome ----------

export const CHECKOUT_OUTCOMES = ['success', 'rejected', 'timeout', 'lost_reply'] as const;
export type CheckoutOutcome = (typeof CHECKOUT_OUTCOMES)[number];

export function validateOutcome(value: unknown): CheckoutOutcome {
  if (typeof value !== 'string' || !(CHECKOUT_OUTCOMES as readonly string[]).includes(value)) {
    throw new ValidationError('Choose a demo checkout outcome.');
  }
  return value as CheckoutOutcome;
}

// ---------- feedback ----------

export const MAX_COMMENT_LENGTH = 500;

export interface FeedbackInput {
  rating: number;
  comment: string;
}

/** A review is one whole star from 1 to 5, plus an optional comment. */
export function validateFeedback(data: unknown): FeedbackInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const rating = data.rating;
  if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
    throw new ValidationError('Choose a rating from 1 to 5 stars.');
  }
  const comment = data.comment ?? '';
  if (typeof comment !== 'string' || comment.trim().length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`A comment can have at most ${MAX_COMMENT_LENGTH} characters.`);
  }
  return { rating: rating as number, comment: comment.trim() };
}

/** The restaurant's answer under a review. */
export function validateReply(data: unknown): string {
  const reply = isObject(data) ? data.reply : undefined;
  if (typeof reply !== 'string' || !reply.trim() || reply.trim().length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`Write a reply with 1 to ${MAX_COMMENT_LENGTH} characters.`);
  }
  return reply.trim();
}

// ---------- admin: menu items ----------

export const MAX_PRICE_TIYN = 100_000_000; // 1,000,000 KZT: a guard against a slipped zero

export interface MenuItemInput {
  name: string;
  description: string;
  category: string;
  priceTiyn: number;
  available: boolean;
}

export function validateMenuItem(data: unknown): MenuItemInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const name = text(data.name, 'dish name', 80);
  const description = text(data.description, 'description', 300);
  const category = text(data.category, 'category', 40);
  const priceTiyn = data.priceTiyn;
  if (!Number.isInteger(priceTiyn) || (priceTiyn as number) < 0 || (priceTiyn as number) > MAX_PRICE_TIYN) {
    throw new ValidationError('Enter a price between 0 and 1,000,000 KZT.');
  }
  const available = data.available ?? true;
  if (typeof available !== 'boolean') throw new ValidationError('Availability must be true or false.');
  return { name, description, category, priceTiyn: priceTiyn as number, available };
}

/** The new order of the menu after a drag and drop: a list of dish IDs, each one once. */
export function validateReorder(data: unknown): number[] {
  const ids = isObject(data) ? data.ids : undefined;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    throw new ValidationError('Send the new menu order as a list of dish IDs.');
  }
  if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new ValidationError('Dish IDs must be whole numbers.');
  }
  if (new Set(ids).size !== ids.length) throw new ValidationError('Each dish may appear only once in the new order.');
  return ids as number[];
}

// ---------- admin: user access ----------

export const ACCESS_ACTIONS = ['block', 'unblock'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export interface AccessInput {
  action: AccessAction;
  reason: string;
}

/** Blocking always needs a written reason: the journal has to say why. */
export function validateAccess(data: unknown): AccessInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const action = data.action;
  if (typeof action !== 'string' || !(ACCESS_ACTIONS as readonly string[]).includes(action)) {
    throw new ValidationError('Choose either block or unblock.');
  }
  const reason = data.reason ?? '';
  if (typeof reason !== 'string' || reason.trim().length > 200) {
    throw new ValidationError('A reason can have at most 200 characters.');
  }
  if (action === 'block' && !reason.trim()) throw new ValidationError('Write why this account is being blocked.');
  return { action: action as AccessAction, reason: reason.trim() };
}

// ---------- languages ----------

/** The languages the site speaks: English, Russian, Kazakh. */
export const LANGUAGES = ['en', 'ru', 'kk'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function validateLanguage(value: unknown): Language {
  if (!isLanguage(value)) throw new ValidationError('Choose English, Russian or Kazakh.', 'bad_language');
  return value;
}

/**
 * Picks the best language from an Accept-Language header, for a visitor who has
 * never chosen one. Unknown languages fall back to English rather than failing.
 */
export function languageFromHeader(header: unknown): Language {
  if (typeof header !== 'string') return DEFAULT_LANGUAGE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLanguage(base)) return base;
    if (base === 'kz') return 'kk'; // a common mistake: kz is the country, kk is the language
  }
  return DEFAULT_LANGUAGE;
}

// ---------- profile ----------

export interface ProfileInput {
  fullName: string;
  phone: string;
  address: string;
  language: Language;
}

/** What a customer may change about themselves. The email and the role are not on the list. */
export function validateProfile(data: unknown): ProfileInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const fullName = text(data.fullName, 'full name', 80);
  const phone = text(data.phone, 'phone number', 30);
  const address = text(data.address, 'address', 240);
  if (!isPhone(phone)) throw new ValidationError('Please enter a valid phone number.');
  return { fullName, phone, address, language: validateLanguage(data.language ?? DEFAULT_LANGUAGE) };
}

// ---------- passwords: change, forget, reset ----------

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export function validatePasswordChange(data: unknown): PasswordChangeInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const currentPassword = data.currentPassword;
  if (typeof currentPassword !== 'string' || !currentPassword) {
    throw new ValidationError('Enter your current password.');
  }
  const newPassword = validatePassword(data.newPassword);
  if (newPassword === currentPassword) {
    throw new ValidationError('The new password must be different from the current one.', 'password_unchanged');
  }
  return { currentPassword, newPassword };
}

/** The email on the "I forgot my password" form. */
export function validateEmail(data: unknown): string {
  const email = isObject(data) ? data.email : undefined;
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || email.trim().length > 160) {
    throw new ValidationError('Please enter a valid email address.');
  }
  return email.trim().toLowerCase();
}

export interface ResetInput {
  token: string;
  password: string;
}

export function validateReset(data: unknown): ResetInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const token = data.token;
  if (typeof token !== 'string' || token.length < 10 || token.length > 200) {
    throw new ValidationError('This reset link is not valid. Ask for a new one.', 'bad_reset_token');
  }
  return { token, password: validatePassword(data.password) };
}

// ---------- order history: search and filters ----------

export const MAX_SEARCH_LENGTH = 60;

export interface HistoryFilter {
  status: string | null;
  /** Free text: matched against the order number, the dishes and the address. */
  search: string | null;
  from: Date | null;
  to: Date | null;
}

/**
 * The filters above the order history.
 *
 * Everything is optional, and anything missing means "do not narrow by this".
 * A search longer than the limit, or a date that is not a date, is a mistake
 * worth saying out loud rather than quietly ignoring.
 */
export function validateHistoryFilter(data: unknown, isStatus: (value: unknown) => boolean): HistoryFilter {
  const raw = isObject(data) ? data : {};

  let status: string | null = null;
  if (raw.status !== undefined && raw.status !== '') {
    if (!isStatus(raw.status)) throw new ValidationError('Choose a valid order status.', 'bad_status');
    status = raw.status as string;
  }

  let search: string | null = null;
  if (raw.search !== undefined && raw.search !== null && String(raw.search).trim() !== '') {
    const value = String(raw.search).trim();
    if (value.length > MAX_SEARCH_LENGTH) {
      throw new ValidationError(`A search can have at most ${MAX_SEARCH_LENGTH} characters.`, 'search_too_long');
    }
    search = value;
  }

  const date = (value: unknown, field: string): Date | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new ValidationError(`Enter a valid ${field} date.`, 'bad_date');
    return parsed;
  };
  const from = date(raw.from, 'start');
  const to = date(raw.to, 'end');
  if (from && to && from > to) {
    throw new ValidationError('The start date must come before the end date.', 'bad_range');
  }
  return { status, search, from, to };
}
