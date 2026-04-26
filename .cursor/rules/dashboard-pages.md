---
description: Conventions for building dashboard UI pages
globs:
  - src/app/dashboard/**
---

# Dashboard Page Conventions

## Page Structure

Dashboard pages are **thin client shells** that compose feature components and use RTK Query for data:

```js
"use client";

import { useTranslations } from "next-intl";
import { useListOrdersQuery } from "@/features/activities/services/activitiesApi";
import ParticipantsTab from "@/features/activities/components/ParticipantsTab";

export default function PageName() {
  const t = useTranslations("namespaceName");
  const { data, isLoading } = useListOrdersQuery(activityId);

  if (isLoading) return <p className="text-gray-500">{t("loading")}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("pageTitle")}</h2>
      <ParticipantsTab orders={data?.orders ?? []} />
    </div>
  );
}
```

## Rules

1. **Always `"use client"`** — RSC migration is out of scope. The dashboard relies on session, locale, and client-side cache.
2. **Pages are thin** — target < 200 lines. Extract reusable feature UI into `src/features/<name>/components/<Name>/`. Extract single-route UI into co-located `_components/` (see "Page-local components" below).
3. **Use RTK Query for server data** — see `.cursor/rules/state-management.md`. No new inline `fetch("/api/...")` in `useEffect`.
4. **Use shared primitives** — Modal, Tabs, Dropdown, Toast, Button, Input, Table, Pagination from `@/shared/components`. Never re-roll these inline.
5. **Use `useTranslations("namespace")`** for all user-facing text. Never hardcode strings.
6. **Tailwind only** — no CSS modules unless `.cursor/rules/styling.md` allows it.
7. **Max width**: main content is wrapped in `max-w-6xl mx-auto` by the layout.

## Page-local components

When a component is used by exactly one route (a step view, a settings drawer specific to that page, a stats card unique to one dashboard), put it in `_components/` next to the page — not in `features/` or `shared/`. See [`frontend-architecture.md`](./frontend-architecture.md) for the full convention and promotion ladder. Page-local components always pair with `index.module.css` ([`styling.md`](./styling.md)).

## Layout Context

The dashboard layout (`src/app/dashboard/layout.js`) provides:
- `SessionProvider` (next-auth)
- `IntlProvider` with club's locale and messages
- `LocaleContext` — access via `useLocale()` from the layout file
- Top navigation bar with active-state highlighting via `usePathname()`
- Direction (LTR/RTL) set on `document.documentElement`

## Navigation

Nav links are defined in the layout. When adding a new dashboard section:
1. Create `src/app/dashboard/new-section/page.js`
2. Add the nav `<Link>` in `src/app/dashboard/layout.js` inside `DashboardLayoutInner`
3. Add i18n key in `nav` namespace in both `en.json` and `he.json`

## Dynamic Routes

Use `[id]` folders: `src/app/dashboard/activities/[id]/page.js`
Access params via the page props: `export default function Page({ params })`

## Common UI Patterns

- Tables with `<table className="w-full text-sm">` and hover rows
- Status badges with colored backgrounds (`bg-green-100 text-green-800`, etc.)
- Buttons: primary `bg-blue-600 text-white`, danger `bg-red-600 text-white`
- Loading states: `text-gray-500` or spinner div
- Cards: `bg-white rounded-xl shadow-sm border border-gray-200 p-6`
