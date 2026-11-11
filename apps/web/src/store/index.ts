import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import cart from './cartSlice';

export const makeStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, cart },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
