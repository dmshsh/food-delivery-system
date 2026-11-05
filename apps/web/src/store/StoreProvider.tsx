'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';
import { hydrate } from './cartSlice';

const KEY = 'food-delivery-cart';

/**
 * Creates the Redux store once and keeps the cart (including the retry attempt ID) in sessionStorage,
 * so a page reload in the middle of checkout does not lose the attempt.
 */
export default function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore>();
  if (!storeRef.current) storeRef.current = makeStore();
  const store = storeRef.current;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      store.dispatch(hydrate(saved ? JSON.parse(saved) : null));
    } catch {
      store.dispatch(hydrate(null));
    }
    return store.subscribe(() => {
      const { cart } = store.getState();
      if (!cart.hydrated) return;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(cart));
      } catch {
        /* storage full or blocked: the cart still works in memory */
      }
    });
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
