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

export interface CartState {
  quantities: Record<number, number>; // menu item id -> quantity
  deliveryAddress: string;
  deliveryTime: string; // '' = as soon as possible, otherwise a <input type="datetime-local"> value
  notes: string;
  /** Bonus points the customer wants to spend on this order. */
  bonusPoints: number;
  draft: Draft | null;
  hydrated: boolean;
}

const initialState: CartState = {
  quantities: {},
  deliveryAddress: '',
  deliveryTime: '',
  notes: '',
  bonusPoints: 0,
  draft: null,
  hydrated: false,
};

export const MAX_QUANTITY = 20;

const slice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<Partial<CartState> | null>) {
      if (action.payload) Object.assign(state, action.payload);
      state.hydrated = true;
    },
    setQuantity(state, action: PayloadAction<{ itemId: number; quantity: number }>) {
      const { itemId, quantity } = action.payload;
      if (quantity <= 0) delete state.quantities[itemId];
      else state.quantities[itemId] = Math.min(quantity, MAX_QUANTITY);
    },
    setField(state, action: PayloadAction<{ field: 'deliveryAddress' | 'deliveryTime' | 'notes'; value: string }>) {
      state[action.payload.field] = action.payload.value;
    },
    /** Points are whole and never negative; the server checks the upper limit again. */
    setBonusPoints(state, action: PayloadAction<number>) {
      state.bonusPoints = Math.max(0, Math.floor(action.payload) || 0);
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
      state.quantities = {};
      state.notes = '';
      state.deliveryTime = '';
      state.bonusPoints = 0;
      state.draft = null;
    },
  },
});

export const { hydrate, setQuantity, setField, setBonusPoints, startDraft, draftSaved, clearDraft, clearCart } =
  slice.actions;
export default slice.reducer;
