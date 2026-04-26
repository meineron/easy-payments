"use client";

import { api } from "@/store/services/api";

/**
 * RTK Query endpoints for the activities feature.
 *
 * Endpoints injected here are the read-only foundation. The page currently
 * still uses imperative `fetch` for many mutations (orders updates, bulk
 * actions, sending links/emails). Migration is incremental — when you touch
 * an inline `fetch` for one of those flows, move it here and switch the
 * component to the generated hook.
 */
export const activitiesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getActivity: build.query({
      query: (activityId) => `/activities/${activityId}`,
      transformResponse: (raw) => raw?.activity ?? null,
      providesTags: (_result, _error, activityId) => [
        { type: "Activity", id: activityId },
      ],
    }),

    getActivityOrders: build.query({
      query: (activityId) => `/activities/${activityId}/orders`,
      transformResponse: (raw) => ({
        orders: raw?.orders ?? [],
        expectedPlayers: raw?.expectedPlayers ?? [],
      }),
      providesTags: (_r, _e, activityId) => [
        { type: "Order", id: `LIST-${activityId}` },
      ],
    }),

    getActivityLogs: build.query({
      query: (activityId) => `/activities/${activityId}/logs`,
      transformResponse: (raw) => raw?.logs ?? [],
      providesTags: (_r, _e, activityId) => [
        { type: "OrderLog", id: `LIST-${activityId}` },
      ],
    }),

    getRegistrationRequests: build.query({
      query: (activityId) => `/registration-requests?activityId=${activityId}`,
      transformResponse: (raw) => raw?.requests ?? [],
      providesTags: (_r, _e, activityId) => [
        { type: "RegistrationRequest", id: `LIST-${activityId}` },
      ],
    }),

    updateRegistrationRequest: build.mutation({
      query: ({ requestId, status }) => ({
        url: `/registration-requests/${requestId}`,
        method: "PUT",
        body: { status },
      }),
      invalidatesTags: (result) =>
        result?.request
          ? [{ type: "RegistrationRequest", id: `LIST-${result.request.activityId}` }]
          : [{ type: "RegistrationRequest" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetActivityQuery,
  useGetActivityOrdersQuery,
  useGetActivityLogsQuery,
  useGetRegistrationRequestsQuery,
  useUpdateRegistrationRequestMutation,
} = activitiesApi;
