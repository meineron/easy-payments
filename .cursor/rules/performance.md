---
description: Lazy loading, code-splitting, images, lists, and memoization
globs:
  - src/**
alwaysApply: true
---

# Frontend Performance

Apply these rules **before** shipping any component that is heavy, optional, or below the fold. Don't optimize blindly — every rule below is conditional.

## Lazy-load heavy / conditional components

Use `next/dynamic` (not bare `React.lazy`) for any component that meets **at least one** of these criteria:

- Renders only after a user action (modals, drawers, dropdowns, popovers).
- Pulls in a large transitive dependency (rich text editors, charting libs, file uploaders, PDF renderers, image cropping, video players).
- Is below the fold or on a tab the user may never visit.
- Is only used by a small subset of users (admin tools, debug panels).

Pattern for a one-off dynamic modal (lives in the parent that conditionally renders it):

```jsx
import dynamic from "next/dynamic";

const FooModal = dynamic(
  () => import("@/features/foo/components/FooModal"),
  { ssr: false }
);
```

Pattern for a heavy primitive used across the codebase — wrap it once and re-export. The editor needs an extra `forwardRef` bridge because `next/dynamic` consumes the wrapper's own `ref` for `{retry}`:

```jsx
// src/shared/components/RichTextEditor/lazy.jsx
import { forwardRef } from "react";
import dynamic from "next/dynamic";

const DynamicInner = dynamic(() => import("./lazyInner"), {
  ssr: false,
  loading: () => <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />,
});

export default forwardRef(function RichTextEditorLazy(props, ref) {
  return <DynamicInner {...props} forwardedRef={ref} />;
});
```

```jsx
// src/shared/components/RichTextEditor/lazyInner.jsx
import RichTextEditor from "./index";
export default function Inner({ forwardedRef, ...props }) {
  return <RichTextEditor ref={forwardedRef} {...props} />;
}
```

Consumers then import from the lazy facade:

```jsx
import RichTextEditor from "@/shared/components/RichTextEditor/lazy";
```

For modals that are conditionally rendered already (`{open && <FooModal .../>}`), `dynamic()` with `ssr: false` is the right call — the chunk is only fetched the first time the modal opens.

For non-interactive heavy widgets that benefit from progressive enhancement, omit `ssr: false` so Next can server-render the placeholder.

### Concrete targets in this codebase

Already wired up:

- `RichTextEditor` — use `@/shared/components/RichTextEditor/lazy` (not the bare `index.jsx`). All three editor-using activity modals already do.
- All seven activity modals in `features/activities/components/` (`BulkActionModal`, `BulkSendMessageModal`, `CreateOrderModal`, `PlayerCardModal`, `RespondModal`, `SendLinkRecipientModal`, `SendPaymentEmailsModal`) — loaded via `dynamic()` from their parent tab (`ParticipantsTab`, `RequestsTab`).

Should be migrated next (still statically imported):

- Legacy modals in `src/components/` rendered conditionally on the activities page (`SendBulkLinksModal`, `SendMessageModal`, `SubscriptionItemReviewModal`, `InvoiceSlideOver`, `ParticipantLogsDrawer`).
- `RichTextEditor` consumers outside the activities feature: `src/components/SendMessageModal.js`, `src/app/dashboard/messages/page.js`, `src/app/dashboard/leads/[id]/edit/page.js` — switch their import to `@/shared/components/RichTextEditor/lazy`.
- `recharts`-based charts under `dashboard/`.
- File upload / drag-drop panels.
- PDF / waiver renderers.

A page-level component that fits in 1–2 screens of source and has no heavy deps does **not** need `dynamic()`.

## Don't lazy-load these

- Above-the-fold layout (header, primary nav, hero).
- Anything that triggers a layout shift if it loads late.
- Components used on every render of a page (e.g. `Button`, `Input`) — bundling overhead beats the chunk split.

## Images

- **Always** use `next/image` for static or remote images. Don't use raw `<img>` outside emails/print views.
- Provide explicit `width` / `height` (or `fill` + a sized parent) — avoid CLS.
- Use `priority` only on the LCP image (typically the hero).
- For user-uploaded images, configure `images.remotePatterns` in `next.config.js`.

## Long lists

- Paginate at the API level (use `Pagination` from `@/shared/components/Pagination`, URL-driven).
- For lists > 200 rows that must render together, consider virtualization (`react-window` / `@tanstack/react-virtual`). Don't introduce these libs until you actually have a list that big — premature.
- Server-side filtering (search params → query) beats client-side filtering of large arrays.

## Memoization

- Default to **no** `useMemo` / `useCallback` / `React.memo`. They cost more than they save in 90% of cases.
- Add memoization only when:
  - You measured a render bottleneck (DevTools Profiler, > 16ms on the critical path), **or**
  - A value is passed into a stable-identity-sensitive API (e.g. RTK Query selector, `useEffect` dep that recreates on every render).
- When you do memoize, leave a one-line comment explaining the trigger.

## Avoid unnecessary client components

- A `"use client"` file inside `features/` or `shared/` is fine — it's the convention here.
- But within a single component, **don't lift state up just to keep parents client-only.** Push interactivity into the smallest leaf and keep the wrapper pure JSX where you can. Smaller client islands = smaller bundles.

## Lazy-load by route, automatically

Next.js App Router code-splits each route segment automatically. You don't need to do anything for that — but it means **don't import dashboard pages from each other.** Cross-page imports defeat the per-route chunking.

## Where to put dynamic imports

- For a modal owned by a feature, the dynamic import lives in the parent component that conditionally renders it (typically the tab or page).
- For a globally lazy primitive (e.g. an editor used across many features), wrap it once in `src/shared/components/<Name>/lazy.jsx` that re-exports the dynamic version, and import that from feature code.

## Self-maintenance

When you introduce a new heavy component or a new lazy-loading pattern, list it under "Concrete targets" above so the next contributor doesn't re-discover it.
