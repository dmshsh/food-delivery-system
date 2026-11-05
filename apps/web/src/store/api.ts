import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  CheckoutOutcome,
  CreateOrderBody,
  MenuItem,
  Order,
  OrderResult,
  OrderStatus,
  Report,
  SessionResponse,
} from '@/lib/types';

/** `?status=...` only when a status filter is chosen. */
function statusParams(arg: { status?: OrderStatus | '' } | void): { status: string } | undefined {
  const status = (arg as { status?: OrderStatus | '' } | undefined)?.status;
  return status ? { status } : undefined;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: ['Session', 'Orders', 'Report'],
  endpoints: (build) => ({
    // ---- session
    me: build.query<SessionResponse, void>({
      query: () => '/auth/me',
      providesTags: ['Session'],
    }),
    login: build.mutation<SessionResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
    register: build.mutation<
      SessionResponse,
      { fullName: string; email: string; phone: string; address: string; password: string }
    >({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
    logout: build.mutation<{ ok: true }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // ---- menu
    menu: build.query<{ items: MenuItem[] }, void>({
      query: () => '/menu',
    }),

    // ---- orders
    orders: build.query<{ orders: Order[] }, { status?: OrderStatus | '' } | void>({
      query: (arg) => ({ url: '/orders', params: statusParams(arg) }),
      providesTags: ['Orders'],
    }),
    createOrder: build.mutation<OrderResult, CreateOrderBody>({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      invalidatesTags: ['Orders', 'Report'],
    }),
    checkout: build.mutation<OrderResult, { id: number; outcome: CheckoutOutcome }>({
      query: ({ id, outcome }) => ({ url: `/orders/${id}/checkout`, method: 'POST', body: { outcome } }),
      invalidatesTags: ['Orders', 'Report'],
    }),
    setStatus: build.mutation<{ order: Order }, { id: number; status: OrderStatus }>({
      query: ({ id, status }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Orders', 'Report'],
    }),

    // ---- accounting
    report: build.query<Report, { status?: OrderStatus | '' } | void>({
      query: (arg) => ({ url: '/reports', params: statusParams(arg) }),
      providesTags: ['Report'],
    }),
  }),
});

export const {
  useMeQuery,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useMenuQuery,
  useOrdersQuery,
  useCreateOrderMutation,
  useCheckoutMutation,
  useSetStatusMutation,
  useReportQuery,
} = api;
