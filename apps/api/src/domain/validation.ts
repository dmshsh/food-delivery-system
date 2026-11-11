// Input validation for registration and checkout. Pure functions, no framework imports.
import { createHash } from 'node:crypto';

export class ValidationError extends Error {
  code: string;
  constructor(message: string, code = 'validation_failed') {
    super(message);
    this.code = code;
  }
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
}

export function validateRegistration(data: unknown): RegistrationInput {
  if (!isObject(data)) throw new ValidationError('The request must contain a JSON object.');
  const fullName = text(data.fullName, 'full name', 80);
  const email = text(data.email, 'email', 160).toLowerCase();
  const phone = text(data.phone, 'phone number', 30);
  const address = text(data.address, 'address', 240);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Please enter a valid email address.');
  if (!/^[+0-9 ()-]{7,30}$/.test(phone)) throw new ValidationError('Please enter a valid phone number.');
  const password = data.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new ValidationError('Use a password with 8 to 128 characters.');
  }
  return { fullName, email, phone, address, password };
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
