import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  AdminMenuItem,
  AdminOverview,
  AdminUser,
  BonusAccount,
  CheckoutOutcome,
  CreateOrderBody,
  ChartBucket,
  ChartMetric,
  ChartSeries,
  CustomerReport,
  DailyReport,
  DishFilter,
  DishReport,
  FeedbackList,
  FullProfile,
  HistoryFilter,
  IpList,
  Language,
  MenuItemBody,
  MenuResponse,
  NutritionResponse,
  Order,
  OrderResult,
  OrderStatus,
  ProfileBody,
  RepeatOrder,
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

/** Only the filters that were actually set: an empty one must not narrow anything. */
function historyParams(arg: HistoryFilter | void): Record<string, string> {
  const filter = (arg ?? {}) as HistoryFilter;
  const params: Record<string, string> = {};
  if (filter.status) params.status = filter.status;
  if (filter.search?.trim()) params.search = filter.search.trim();
  if (filter.from) params.from = filter.from;
  if (filter.to) params.to = filter.to;
  return params;
}

/** A date range, for the three accounting reports. */
function rangeParams(arg: { from?: string; to?: string } | void): Record<string, string> {
  const range = (arg ?? {}) as { from?: string; to?: string };
  const params: Record<string, string> = {};
  if (range.from) params.from = range.from;
  if (range.to) params.to = range.to;
  return params;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: [
    'Session',
    'Orders',
    'Report',
    'Menu',
    'Bonus',
    'Feedback',
    'AdminMenu',
    'AdminUsers',
    'Security',
    'Profile',
    'Ips',
  ],
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
      { fullName: string; email: string; phone: string; address: string; password: string; language: Language }
    >({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
    logout: build.mutation<{ ok: true }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // ---- menu
    menu: build.query<MenuResponse, DishFilter | void>({
      query: (arg) => {
        const filter = (arg ?? {}) as DishFilter;
        const params: Record<string, string> = {};
        if (filter.search?.trim()) params.search = filter.search.trim();
        if (filter.maxCalories) params.maxCalories = String(filter.maxCalories);
        if (filter.minCalories) params.minCalories = String(filter.minCalories);
        if (filter.maxPriceTiyn) params.maxPriceTiyn = String(filter.maxPriceTiyn);
        if (filter.tags?.length) params.tags = filter.tags.join(',');
        if (filter.withoutTags?.length) params.withoutTags = filter.withoutTags.join(',');
        if (filter.sort && filter.sort !== 'menu') params.sort = filter.sort;
        return { url: '/menu', params };
      },
      providesTags: ['Menu'],
    }),

    // ---- what a basket adds up to
    nutrition: build.query<NutritionResponse, { itemId: number; quantity: number }[]>({
      query: (items) => ({ url: '/nutrition/summary', method: 'POST', body: { items } }),
    }),

    // ---- orders
    orders: build.query<{ orders: Order[] }, HistoryFilter | void>({
      query: (arg) => ({ url: '/orders', params: historyParams(arg) }),
      providesTags: ['Orders'],
    }),
    repeatOrder: build.query<RepeatOrder, number>({
      query: (id) => `/orders/${id}/repeat`,
      // Prices and availability change, so this is always asked fresh.
      keepUnusedDataFor: 0,
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
    setStatus: build.mutation<{ order: Order }, { id: number; status: OrderStatus; code?: string }>({
      // The last step carries the four digits the customer read out at the door.
      query: ({ id, status, code }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body: { status, code } }),
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

    // ---- profile and passwords
    profile: build.query<{ profile: FullProfile }, void>({
      query: () => '/profile',
      providesTags: ['Profile'],
    }),
    updateProfile: build.mutation<{ profile: FullProfile }, ProfileBody>({
      query: (body) => ({ url: '/profile', method: 'PATCH', body }),
      invalidatesTags: ['Profile', 'Session'],
    }),
    setLanguage: build.mutation<{ language: Language }, { language: Language }>({
      query: (body) => ({ url: '/profile/language', method: 'PATCH', body }),
      invalidatesTags: ['Session'],
    }),
    forgotPassword: build.mutation<{ message: string; demoToken?: string; demoNote?: string }, { email: string }>({
      query: (body) => ({ url: '/auth/password/forgot', method: 'POST', body }),
    }),
    resetPassword: build.mutation<{ ok: true; message: string }, { token: string; password: string }>({
      query: (body) => ({ url: '/auth/password/reset', method: 'POST', body }),
      invalidatesTags: ['Session'],
    }),
    changePassword: build.mutation<
      { ok: true; message: string },
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({ url: '/auth/password/change', method: 'POST', body }),
      invalidatesTags: ['Profile'],
    }),

    // ---- bonus (customer)
    bonus: build.query<BonusAccount, void>({
      query: () => '/bonus',
      providesTags: ['Bonus'],
    }),

    // ---- the three newer accounting reports
    dailyReport: build.query<DailyReport, { from?: string; to?: string } | void>({
      query: (arg) => ({ url: '/reports/daily', params: rangeParams(arg) }),
      providesTags: ['Report'],
    }),
    dishReport: build.query<DishReport, { from?: string; to?: string } | void>({
      query: (arg) => ({ url: '/reports/dishes', params: rangeParams(arg) }),
      providesTags: ['Report'],
    }),
    customerReport: build.query<CustomerReport, { from?: string; to?: string } | void>({
      query: (arg) => ({ url: '/reports/customers', params: rangeParams(arg) }),
      providesTags: ['Report'],
    }),
    chart: build.query<ChartSeries, { metric: ChartMetric; bucket: ChartBucket; from?: string; to?: string }>({
      query: ({ metric, bucket, from, to }) => ({
        url: '/reports/chart',
        params: { metric, bucket, ...(from ? { from } : {}), ...(to ? { to } : {}) },
      }),
      providesTags: ['Report'],
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
    blockedIps: build.query<IpList, void>({
      query: () => '/admin/ips',
      providesTags: ['Ips'],
    }),
    blockIp: build.mutation<IpList, { ip: string; reason: string }>({
      query: (body) => ({ url: '/admin/ips', method: 'POST', body }),
      invalidatesTags: ['Ips', 'Security'],
    }),
    unblockIp: build.mutation<IpList, string>({
      query: (ip) => ({ url: `/admin/ips/${encodeURIComponent(ip)}`, method: 'DELETE' }),
      invalidatesTags: ['Ips', 'Security'],
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
  useNutritionQuery,
  useOrdersQuery,
  useLazyRepeatOrderQuery,
  useCreateOrderMutation,
  useCheckoutMutation,
  useSetStatusMutation,
  useLeaveFeedbackMutation,
  useReportQuery,
  useDailyReportQuery,
  useDishReportQuery,
  useCustomerReportQuery,
  useChartQuery,
  useProfileQuery,
  useUpdateProfileMutation,
  useSetLanguageMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useBlockedIpsQuery,
  useBlockIpMutation,
  useUnblockIpMutation,
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
