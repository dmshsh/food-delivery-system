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

  const hash = createHash('sha256')
    .update(JSON.stringify([lines, address.trim(), deliveryTime ? deliveryTime.toISOString() : 'ASAP', notes.trim()]))
    .digest('hex');

  return { attemptId, lines, deliveryAddress: address.trim(), deliveryTime, notes: notes.trim(), hash };
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
