---
description: Conventions for building dashboard UI pages
globs:
  - src/app/dashboard/**
---

# Dashboard Page Conventions

## Page Structure

All dashboard pages are **client components**:

```js
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export default function PageName() {
  const t = useTranslations("namespaceName");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/resource")
      .then((r) => r.json())
      .then((d) => setData(d.resource))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">{t("loading")}</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("pageTitle")}</h2>
      {/* page content */}
    </div>
  );
}
```

## Rules

1. **Always `"use client"`** — dashboard pages rely on hooks, session, and client-side fetching
2. **Use `useTranslations("namespace")`** from `next-intl` for all user-facing text — never hardcode strings
3. **Fetch data from internal API routes** — `fetch("/api/...")` in `useEffect`
4. **Use Tailwind classes** directly in JSX — no CSS modules, no styled-components
5. **Max width**: main content is wrapped in `max-w-6xl mx-auto` by the layout

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
