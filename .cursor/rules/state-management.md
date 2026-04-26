---
description: Redux Toolkit + RTK Query patterns, when to use which state container
globs:
  - src/**
alwaysApply: true
---

# State Management

The app uses **Redux Toolkit + RTK Query**, plus URL search params, plus local `useState`. There are no other client state libraries (no Zustand, no Jotai, no React Context for global state).

## Decision tree — pick exactly one per piece of state

| Data | Where it lives |
|---|---|
| Server data (orders, activities, players, leads, …) | **RTK Query** — `src/features/<name>/services/<name>Api.js` |
| Cross-page UI state (toasts, modal stack, persistent selected ids) | **`uiSlice`** — `src/store/slices/uiSlice.js` |
| Filters, search query, active tab, page, page size, sort | **URL search params** via `useUrlParam` / `useUrlParams` |
| Form input state, hover, expanded rows, transient open/closed | **Local `useState`** in the component |
| Auth session | **`next-auth`** (`useSession()`) — do not duplicate into Redux |
| Locale / direction | **`next-intl`** (`useTranslations`, `useLocale`) — do not duplicate into Redux |

## Anti-patterns

- Storing server data in a Redux slice. Always use RTK Query so you get caching, refetching, invalidation for free.
- Putting filter state in a slice. Filters belong in the URL so links are shareable.
- Wrapping a single component's open/closed boolean in Redux. Use `useState` or `useDisclosure`.
- Two sources of truth for the same data (e.g. RTK Query result mirrored into a slice). Don't.

## RTK Query — feature endpoints

Each feature defines endpoints in `src/features/<name>/services/<name>Api.js` by **injecting** into the base api at `src/store/services/api.js`:

```js
"use client";
import { api } from "@/store/services/api";

export const activitiesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getActivity: build.query({
      query: (id) => `/activities/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Activity", id }],
    }),
    listOrders: build.query({
      query: (id) => `/activities/${id}/orders`,
      providesTags: (_r, _e, id) => [{ type: "Order", id: `LIST-${id}` }],
    }),
    updateOrder: build.mutation({
      query: ({ activityId, orderId, body }) => ({
        url: `/activities/${activityId}/orders/${orderId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { activityId, orderId }) => [
        { type: "Order", id: orderId },
        { type: "Order", id: `LIST-${activityId}` },
      ],
    }),
  }),
});

export const {
  useGetActivityQuery,
  useListOrdersQuery,
  useUpdateOrderMutation,
} = activitiesApi;
```

### Tag conventions

- Single resource: `{ type: "Order", id }`
- Collection per parent: `{ type: "Order", id: "LIST-<parentId>" }`
- Mutations invalidate **both** the resource and the parent list when applicable.
- Tag types are declared once in `src/store/services/api.js` — add new ones there.

## `uiSlice` patterns

```js
import { useDispatch } from "react-redux";
import { pushToast } from "@/store/slices/uiSlice";

const dispatch = useDispatch();
dispatch(pushToast({ message: "Saved", type: "success" }));
dispatch(pushToast({ message: "Failed", type: "error", durationMs: 5000 }));
```

The toast queue is rendered globally by `<Toast />` mounted in `src/app/providers.js`. Never render a `<Toast>` inside a page.

## URL state

Use the helpers in `src/shared/hooks/useUrlState.js`:

```js
const [tab, setTab] = useUrlParam("tab", "participants");
const { page = 1, q } = useUrlParams({ page: Number, q: String });
```

The `Tabs` and `Pagination` primitives already URL-sync by default — pass `paramKey="tab"` / they read `?page=` / `?pageSize=` on their own.

## Devtools

Redux Devtools work out of the box in development thanks to `configureStore`. In production they're stripped automatically.

## Self-maintenance

When you add a new tag type, slice, or change the decision tree, update this file.
