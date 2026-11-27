import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CreateOrderBody } from '@/lib/types';

/**
 * One intended order = one "draft" with ONE attempt ID.
 * If the network fails, the browser sends the SAME draft again, and the server returns the same order
 * instead of creating a second one. The draft is frozen so the details cannot change between retries.
 */
export interface Draft {
  attemptId: string;
  payload: Omit<CreateOrderBody, 'attemptId'>;
  orderId?: number; // set once the server has saved the order
}

/**
 * One line of the cart.
 *
 * A line is a dish *for one person*. In an ordinary order the person is empty
 * and there is one line per dish, exactly as before. In a group order the same
 * dish can appear twice — once for Alice, once for Bob — and those are two
 * lines, because they are two different things that end up on two different
 * parts of the bill.
 */
export interface CartLine {
  itemId: number;
  participant: string;
  quantity: number;
}

/** The key a line is stored under. Dish and person together identify it. */
export function lineKey(itemId: number, participant: string): string {
  return `${itemId}|${participant}`;
}

export interface CartState {
  lines: Record<string, CartLine>;
  deliveryAddress: string;
  deliveryTime: string; // '' = as soon as possible, otherwise a <input type="datetime-local"> value
  notes: string;
  /** Bonus points the customer wants to spend on this order. */
  bonusPoints: number;
  /** The people sharing this order. Empty means it is not a group order. */
  participants: string[];
  draft: Draft | null;
  hydrated: boolean;
}

const initialState: CartState = {
  lines: {},
  deliveryAddress: '',
  deliveryTime: '',
  notes: '',
  bonusPoints: 0,
  participants: [],
  draft: null,
  hydrated: false,
};

export const MAX_QUANTITY = 20;
export const MAX_PARTICIPANTS = 10;

/**
 * The names actually filled in. The cart keeps empty and half-typed slots (a
 * field the person has not finished yet), so anything that needs real people —
 * the "for whom" choices, the bill, the order sent to the server — reads this.
 */
export function namedParticipants(participants: string[]): string[] {
  return participants.map((n) => n.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- selectors

/** Everything in the cart, as a list. */
export function cartLines(cart: CartState): CartLine[] {
  return Object.values(cart.lines);
}

/** How many portions of one dish are in the cart, across everybody. */
export function quantityOfDish(cart: CartState, itemId: number): number {
  return cartLines(cart)
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

export function cartCount(cart: CartState): number {
  return cartLines(cart).reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Carts saved by an earlier version held `quantities: { [itemId]: number }`.
 * Rather than throwing those away — somebody may be mid-order when the site
 * updates — they are read and turned into unassigned lines.
 */
function migrateSaved(saved: Partial<CartState> & { quantities?: Record<string, number> }): Partial<CartState> {
  if (!saved.quantities || saved.lines) return saved;
  const lines: Record<string, CartLine> = {};
  for (const [itemId, quantity] of Object.entries(saved.quantities)) {
    const id = Number(itemId);
    if (!Number.isInteger(id) || !quantity) continue;
    lines[lineKey(id, '')] = { itemId: id, participant: '', quantity };
  }
  const { quantities, ...rest } = saved;
  return { ...rest, lines };
}

const slice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<Partial<CartState> | null>) {
      if (action.payload) Object.assign(state, migrateSaved(action.payload));
      if (!state.lines) state.lines = {};
      if (!state.participants) state.participants = [];
      state.hydrated = true;
    },

    /** Sets how many of one dish are in the cart for one person. 0 removes the line. */
    setQuantity(
      state,
      action: PayloadAction<{ itemId: number; quantity: number; participant?: string }>,
    ) {
      const { itemId, quantity } = action.payload;
      const participant = action.payload.participant ?? '';
      const key = lineKey(itemId, participant);
      if (quantity <= 0) delete state.lines[key];
      else state.lines[key] = { itemId, participant, quantity: Math.min(quantity, MAX_QUANTITY) };
    },

    /** Moves a whole line to another person (or to nobody). */
    assignLine(state, action: PayloadAction<{ itemId: number; from: string; to: string }>) {
      const { itemId, from, to } = action.payload;
      if (from === to) return;
      const line = state.lines[lineKey(itemId, from)];
      if (!line) return;
      delete state.lines[lineKey(itemId, from)];
      const target = state.lines[lineKey(itemId, to)];
      if (target) {
        // The same dish already belongs to that person: one line, more of it.
        target.quantity = Math.min(target.quantity + line.quantity, MAX_QUANTITY);
      } else {
        state.lines[lineKey(itemId, to)] = { itemId, participant: to, quantity: line.quantity };
      }
    },

    /** Moves one portion of a line to another person, splitting the line. */
    splitOne(state, action: PayloadAction<{ itemId: number; from: string; to: string }>) {
      const { itemId, from, to } = action.payload;
      if (from === to) return;
      const line = state.lines[lineKey(itemId, from)];
      if (!line || line.quantity < 1) return;
      line.quantity -= 1;
      if (line.quantity === 0) delete state.lines[lineKey(itemId, from)];
      const target = state.lines[lineKey(itemId, to)];
      if (target) target.quantity = Math.min(target.quantity + 1, MAX_QUANTITY);
      else state.lines[lineKey(itemId, to)] = { itemId, participant: to, quantity: 1 };
    },

    setField(state, action: PayloadAction<{ field: 'deliveryAddress' | 'deliveryTime' | 'notes'; value: string }>) {
      state[action.payload.field] = action.payload.value;
    },

    /** Points are whole and never negative; the server checks the upper limit again. */
    setBonusPoints(state, action: PayloadAction<number>) {
      state.bonusPoints = Math.max(0, Math.floor(action.payload) || 0);
    },

    /**
     * Replaces the people in the order.
     *
     * Lines belonging to somebody who is no longer here go back to being
     * unassigned rather than disappearing: removing a person from the list
     * should not quietly throw away the food they chose.
     */
    setParticipants(state, action: PayloadAction<string[]>) {
      // Slots are stored as typed, empty ones included: "Order together" starts
      // with two empty fields, and a field being retyped is briefly empty. Dropping
      // empty slots here left the list empty, so the group order never opened.
      const slots = action.payload.slice(0, MAX_PARTICIPANTS);
      state.participants = slots;
      const names = namedParticipants(slots);
      for (const line of Object.values(state.lines)) {
        if (line.participant && !names.includes(line.participant)) {
          const target = lineKey(line.itemId, '');
          const existing = state.lines[target];
          if (existing) existing.quantity = Math.min(existing.quantity + line.quantity, MAX_QUANTITY);
          else state.lines[target] = { itemId: line.itemId, participant: '', quantity: line.quantity };
          delete state.lines[lineKey(line.itemId, line.participant)];
        }
      }
    },

    /** Turns the group order off: everything goes back to one bill. */
    clearParticipants(state) {
      state.participants = [];
      const merged: Record<string, CartLine> = {};
      for (const line of Object.values(state.lines)) {
        const key = lineKey(line.itemId, '');
        if (merged[key]) merged[key].quantity = Math.min(merged[key].quantity + line.quantity, MAX_QUANTITY);
        else merged[key] = { itemId: line.itemId, participant: '', quantity: line.quantity };
      }
      state.lines = merged;
    },

    startDraft(state, action: PayloadAction<Draft>) {
      state.draft = action.payload;
    },
    draftSaved(state, action: PayloadAction<number>) {
      if (state.draft) state.draft.orderId = action.payload;
    },
    clearDraft(state) {
      state.draft = null;
    },
    clearCart(state) {
      state.lines = {};
      state.notes = '';
      state.deliveryTime = '';
      state.bonusPoints = 0;
      state.participants = [];
      state.draft = null;
    },
  },
});

export const {
  hydrate,
  setQuantity,
  assignLine,
  splitOne,
  setField,
  setBonusPoints,
  setParticipants,
  clearParticipants,
  startDraft,
  draftSaved,
  clearDraft,
  clearCart,
} = slice.actions;
export default slice.reducer;
