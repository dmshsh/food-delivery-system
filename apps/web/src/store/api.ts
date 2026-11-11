import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  AdminMenuItem,
  AdminOverview,
  AdminUser,
  BonusAccount,
  CheckoutOutcome,
  CreateOrderBody,
  FeedbackList,
  MenuItem,
  MenuItemBody,
  Order,
  OrderResult,
  OrderStatus,
  Report,
  Role,
  SecurityJournal,
  SessionResponse,
  Severity,
} from '@/lib/types';

/** `?status=...` only when a status filter is chosen. */
function statusParams(arg: { status?: OrderStatus | '' } | void): { status: string } | undefined {
  const status = (arg as { status?: OrderStatus | '' } | undefined)?.status;
  return status ? { status } : undefined;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: ['Session', 'Orders', 'Report', 'Menu', 'Bonus', 'Feedback', 'AdminMenu', 'AdminUsers', 'Security'],
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
      providesTags: ['Menu'],
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
      // A paid order moves points, so the bonus balance and the session profile change too.
      invalidatesTags: ['Orders', 'Report', 'Bonus', 'Session'],
    }),
    setStatus: build.mutation<{ order: Order }, { id: number; status: OrderStatus }>({
      query: ({ id, status }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['Orders', 'Report'],
    }),
    leaveFeedback: build.mutation<{ order: Order }, { id: number; rating: number; comment: string }>({
      query: ({ id, rating, comment }) => ({ url: `/orders/${id}/feedback`, method: 'POST', body: { rating, comment } }),
      invalidatesTags: ['Orders', 'Feedback', 'Report'],
    }),

    // ---- accounting
    report: build.query<Report, { status?: OrderStatus | '' } | void>({
      query: (arg) => ({ url: '/reports', params: statusParams(arg) }),
      providesTags: ['Report'],
    }),

    // ---- bonus (customer)
    bonus: build.query<BonusAccount, void>({
      query: () => '/bonus',
      providesTags: ['Bonus'],
    }),

    // ---- feedback (admin + accountant)
    feedbackList: build.query<FeedbackList, { rating?: number | '' } | void>({
      query: (arg) => {
        const rating = (arg as { rating?: number | '' } | undefined)?.rating;
        return { url: '/feedback', params: rating ? { rating } : undefined };
      },
      providesTags: ['Feedback'],
    }),
    replyToFeedback: build.mutation<unknown, { id: number; reply: string }>({
      query: ({ id, reply }) => ({ url: `/feedback/${id}/reply`, method: 'POST', body: { reply } }),
      invalidatesTags: ['Feedback'],
    }),

    // ---- admin
    adminOverview: build.query<AdminOverview, void>({
      query: () => '/admin/overview',
      providesTags: ['AdminMenu', 'AdminUsers', 'Security'],
    }),
    adminMenu: build.query<{ items: AdminMenuItem[] }, void>({
      query: () => '/admin/menu',
      providesTags: ['AdminMenu'],
    }),
    createDish: build.mutation<{ item: AdminMenuItem }, MenuItemBody>({
      query: (body) => ({ url: '/admin/menu', method: 'POST', body }),
      invalidatesTags: ['AdminMenu', 'Menu'],
    }),
    updateDish: build.mutation<{ item: AdminMenuItem }, { id: number } & MenuItemBody>({
      query: ({ id, ...body }) => ({ url: `/admin/menu/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminMenu', 'Menu'],
    }),
    removeDish: build.mutation<{ removed: boolean; hidden: boolean }, number>({
      query: (id) => ({ url: `/admin/menu/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminMenu', 'Menu'],
    }),
    reorderMenu: build.mutation<{ items: AdminMenuItem[] }, number[]>({
      query: (ids) => ({ url: '/admin/menu/reorder', method: 'PATCH', body: { ids } }),
      invalidatesTags: ['AdminMenu', 'Menu'],
    }),
    adminUsers: build.query<{ users: AdminUser[] }, void>({
      query: () => '/admin/users',
      providesTags: ['AdminUsers'],
    }),
    setAccess: build.mutation<{ users: AdminUser[] }, { id: number; action: 'block' | 'unblock'; reason: string }>({
      query: ({ id, action, reason }) => ({ url: `/admin/users/${id}/access`, method: 'PATCH', body: { action, reason } }),
      invalidatesTags: ['AdminUsers', 'Security'],
    }),
    setUserRole: build.mutation<{ users: AdminUser[] }, { id: number; role: Role }>({
      query: ({ id, role }) => ({ url: `/admin/users/${id}/role`, method: 'PATCH', body: { role } }),
      invalidatesTags: ['AdminUsers', 'Security'],
    }),
    securityJournal: build.query<SecurityJournal, { kind?: string; severity?: Severity | '' } | void>({
      query: (arg) => {
        const filter = (arg ?? {}) as { kind?: string; severity?: Severity | '' };
        const params: Record<string, string> = {};
        if (filter.kind) params.kind = filter.kind;
        if (filter.severity) params.severity = filter.severity;
        return { url: '/admin/security', params };
      },
      providesTags: ['Security'],
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
  useLeaveFeedbackMutation,
  useReportQuery,
  useBonusQuery,
  useFeedbackListQuery,
  useReplyToFeedbackMutation,
  useAdminOverviewQuery,
  useAdminMenuQuery,
  useCreateDishMutation,
  useUpdateDishMutation,
  useRemoveDishMutation,
  useReorderMenuMutation,
  useAdminUsersQuery,
  useSetAccessMutation,
  useSetUserRoleMutation,
  useSecurityJournalQuery,
} = api;
