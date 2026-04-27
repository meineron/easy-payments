# Migration Inventory

Generated: 2026-04-27. Updated manually as items are resolved.

---

## Summary

| Category | Files to change | Scope |
|----------|----------------|-------|
| App Router → Pages Router | ~150 files in `src/app/` | Standalone app only |
| next/navigation → routing-agnostic | 4 shared/feature files | Affects pl-football-web embedding |
| next-intl → react-intl | 3 feature files + 1 shared component | Affects pl-football-web embedding |
| Tailwind → SCSS Modules | ~22 shared + feature files | Affects pl-football-web embedding |
| RTK Query baseUrl → configurable | 1 file | Affects pl-football-web embedding |
| React 19-only APIs | TBD after audit | TBD |

The two tracks are independent:
- **Track A — standalone app migration**: `src/app/*` → `src/pages/*`, `_app.js`, `_document.js`
- **Track B — shared component alignment**: shared + features — these are what pl-football-web imports

---

## Track A — Standalone app: App Router → Pages Router

All files under `src/app/` need to move to `src/pages/` equivalents.

### Pages and layouts (UI)

| App Router path | Pages Router target |
|-----------------|---------------------|
| `src/app/layout.js` | `src/pages/_app.js` + `src/pages/_document.js` |
| `src/app/providers.js` | merged into `_app.js` |
| `src/app/globals.css` | imported in `_app.js` |
| `src/app/page.js` (login) | `src/pages/index.js` |
| `src/app/LoginForm.js` | `src/components/LoginForm.js` (no change needed) |
| `src/app/signup/page.js` | `src/pages/signup.js` |
| `src/app/set-password/page.js` | `src/pages/set-password.js` |
| `src/app/invitations/page.js` | `src/pages/invitations.js` |
| `src/app/staff/layout.js` | wrap in `_app.js` layout logic |
| `src/app/staff/dashboard/page.js` | `src/pages/staff/dashboard.js` |
| `src/app/admin/layout.js` | layout wrapper |
| `src/app/admin/page.js` | `src/pages/admin/index.js` |
| `src/app/admin/clubs/new/page.js` | `src/pages/admin/clubs/new.js` |
| `src/app/admin/clubs/[id]/edit/page.js` | `src/pages/admin/clubs/[id]/edit.js` |
| `src/app/admin/customer-data/page.js` | `src/pages/admin/customer-data.js` |
| `src/app/admin/payment-links/page.js` | `src/pages/admin/payment-links.js` |
| `src/app/dashboard/layout.js` | layout wrapper |
| `src/app/dashboard/page.js` | `src/pages/dashboard/index.js` |
| `src/app/dashboard/activities/page.js` | `src/pages/dashboard/activities/index.js` |
| `src/app/dashboard/activities/[id]/page.js` | `src/pages/dashboard/activities/[id].js` |
| `src/app/dashboard/activities/[id]/edit/page.js` | `src/pages/dashboard/activities/[id]/edit.js` |
| `src/app/dashboard/leads/page.js` | `src/pages/dashboard/leads/index.js` |
| `src/app/dashboard/leads/[id]/page.js` | `src/pages/dashboard/leads/[id].js` |
| `src/app/dashboard/leads/[id]/edit/page.js` | `src/pages/dashboard/leads/[id]/edit.js` |
| `src/app/dashboard/messages/page.js` | `src/pages/dashboard/messages.js` |
| `src/app/dashboard/parents/page.js` | `src/pages/dashboard/parents.js` |
| `src/app/dashboard/payment-links/page.js` | `src/pages/dashboard/payment-links.js` |
| `src/app/dashboard/players/page.js` | `src/pages/dashboard/players.js` |
| `src/app/dashboard/profile/page.js` | `src/pages/dashboard/profile.js` |
| `src/app/dashboard/records/page.js` | `src/pages/dashboard/records.js` |
| `src/app/dashboard/teams/page.js` | `src/pages/dashboard/teams/index.js` |
| `src/app/dashboard/teams/[id]/page.js` | `src/pages/dashboard/teams/[id].js` |
| `src/app/dashboard/transactions/page.js` | `src/pages/dashboard/transactions.js` |
| `src/app/dashboard/users/page.js` | `src/pages/dashboard/users.js` |
| `src/app/dashboard/customer-data/page.js` | `src/pages/dashboard/customer-data.js` |
| `src/app/payment/cancel/page.js` | `src/pages/payment/cancel.js` |
| `src/app/payment/success/page.js` | `src/pages/payment/success.js` |
| `src/app/payment/[token]/page.js` | `src/pages/payment/[token].js` |
| `src/app/payment/request/[token]/page.js` | `src/pages/payment/request/[token].js` |
| `src/app/payment/complete/[registrationId]/page.js` | `src/pages/payment/complete/[registrationId].js` |
| `src/app/payment/register/[teamId]/page.js` | `src/pages/payment/register/[teamId].js` |
| `src/app/payment/register/[teamId]/RegisterPaymentClient.js` | stays as component |
| `src/app/register/[activityId]/page.js` | `src/pages/register/[activityId].js` |
| `src/app/register/[activityId]/success/page.js` | `src/pages/register/[activityId]/success.js` |
| `src/app/leads/[slug]/page.js` | `src/pages/leads/[slug].js` |

### API routes (App Router `route.js` → Pages Router `pages/api/`)

Full list of API routes to migrate (each `route.js` becomes a handler at the equivalent `pages/api/` path):

**activities**
- `api/activities/route.js` → `pages/api/activities/index.js`
- `api/activities/[id]/route.js` → `pages/api/activities/[id].js`
- `api/activities/[id]/logs/route.js` → `pages/api/activities/[id]/logs.js`
- `api/activities/[id]/upload-waiver/route.js` → `pages/api/activities/[id]/upload-waiver.js`
- `api/activities/[id]/orders/route.js` → `pages/api/activities/[id]/orders/index.js`
- `api/activities/[id]/orders/bulk-action/route.js` → `pages/api/activities/[id]/orders/bulk-action.js`
- `api/activities/[id]/orders/bulk-send-message/route.js` → `pages/api/activities/[id]/orders/bulk-send-message.js`
- `api/activities/[id]/orders/repair/route.js` → `pages/api/activities/[id]/orders/repair.js`
- `api/activities/[id]/orders/send-bulk-payment-emails/route.js` → `pages/api/activities/[id]/orders/send-bulk-payment-emails.js`
- `api/activities/[id]/orders/send-bulk-registration-links/route.js` → `pages/api/activities/[id]/orders/send-bulk-registration-links.js`
- `api/activities/[id]/orders/[orderId]/route.js` → `pages/api/activities/[id]/orders/[orderId].js`
- `api/activities/[id]/orders/[orderId]/logs/route.js` → `pages/api/activities/[id]/orders/[orderId]/logs.js`
- `api/activities/[id]/orders/[orderId]/send-link/route.js`
- `api/activities/[id]/orders/[orderId]/send-payment-link/route.js`
- `api/activities/[id]/orders/[orderId]/send-registration-link/route.js`
- `api/activities/[id]/orders/[orderId]/send-waivers-email/route.js`
- `api/activities/[id]/orders/[orderId]/payment-requests/route.js`
- `api/activities/[id]/orders/[orderId]/payment-requests/[requestId]/route.js`
- `api/activities/[id]/orders/[orderId]/payment-requests/[requestId]/resend/route.js`

**auth**
- `api/auth/[...nextauth]/route.js` → `pages/api/auth/[...nextauth].js` (NextAuth Pages Router format)
- `api/auth/set-password/route.js`
- `api/auth/signup-token/[token]/route.js`
- `api/auth/switch-club/route.js`
- `api/auth/verify-email/route.js`

**other resources** (same pattern: `route.js` → `pages/api/...`)
- club-users (3 routes)
- club/profile (1 route)
- customer-stripe (5 routes)
- dashboard/stats, dashboard/records (2 routes)
- exercises (2 routes)
- invitations (2 routes)
- leads (6 routes)
- messages (3 routes)
- parents (2 routes)
- payment (4 routes)
- players (8 routes)
- public/leads (2 routes)
- register/[activityId] (7 routes)
- registration-requests (2 routes)
- registrations (2 routes)
- stripe/account-status, create-account-link, create-checkout, webhook (4 routes)
- teams (8 routes)
- transactions (1 route)
- admin/clubs (4 routes)

**Total API routes:** ~75 `route.js` files to migrate.

### Notes on API route migration
- App Router: `export async function GET(req) {}` / `POST` / etc.
- Pages Router: `export default async function handler(req, res) { if (req.method === 'GET') ... }`
- `req.json()` → `req.body` (Next.js 12 parses JSON body automatically with `bodyParser`)
- `NextResponse.json(data, { status })` → `res.status(n).json(data)`
- `cookies()` from `next/headers` → `req.cookies`
- `headers()` from `next/headers` → `req.headers`

---

## Track B — Shared component alignment (affects pl-football-web)

These are the files pl-football-web will import. They must be framework-agnostic.

### B1. next/navigation → routing-agnostic (4 files)

| File | What uses next/navigation | Fix |
|------|--------------------------|-----|
| `src/shared/hooks/useUrlState.js` | `useRouter`, `usePathname`, `useSearchParams` — full router dependency | Rewrite using `PaymentsHostContext` injected `router` abstraction |
| `src/shared/components/Tabs/index.jsx` | `useRouter`, `usePathname`, `useSearchParams` — URL-synced tab state | Accept `value`/`onChange` (controlled mode); remove URL-sync from the component itself; URL-sync lives in the host page |
| `src/shared/components/Pagination/index.jsx` | `useRouter`, `usePathname`, `useSearchParams` — URL-synced page state | Same: accept `value`/`onChange` (controlled mode); host page owns URL state |
| `src/components/ClubSwitcher.js` | likely `useRouter` for redirect on club switch | Not shared with pl-football-web — low priority for Track B |

**Strategy for Tabs and Pagination:** The simplest and cleanest fix is making them **fully controlled** (accept `value`/`onChange` props). The dashboard pages (in `src/pages/`) that host these components can manage URL sync themselves using `useRouter` from Next.js. The shared primitive doesn't need to know about routing at all.

### B2. next-intl → react-intl (4 files in features/shared)

| File | Usage |
|------|-------|
| `src/features/activities/components/SendLinkRecipientModal/index.jsx` | `useTranslations` |
| `src/features/activities/components/RespondModal/index.jsx` | `useTranslations` |
| `src/features/activities/components/BulkSendMessageModal/index.jsx` | `useTranslations` |
| `src/shared/components/RichTextEditor/index.jsx` | `useTranslations` |

**Change:** `useTranslations('namespace')` → `useIntl()` + `intl.formatMessage({ id: 'payments.namespace.key' })`.

All dashboard pages in `src/app/` also use next-intl, but those migrate to Pages Router in Track A and stay as Next.js pages — they just switch to react-intl in `_app.js`.

### B3. Tailwind → SCSS Modules (22 files)

All shared components and feature components use Tailwind utility classes inline. Convert each to a `.module.scss` file alongside the component.

**`src/shared/components/`** (9 components):
- [ ] `Button/index.jsx`
- [ ] `Dropdown/index.jsx`
- [ ] `Input/index.jsx`
- [ ] `Modal/index.jsx`
- [ ] `Pagination/index.jsx`
- [ ] `RichTextEditor/index.jsx`
- [ ] `Table/index.jsx`
- [ ] `Tabs/index.jsx`
- [ ] `Toast/index.jsx`

**`src/features/activities/components/`** (11 components):
- [ ] `ActivityTeamsTab/index.jsx`
- [ ] `BulkActionModal/index.jsx`
- [ ] `BulkSendMessageModal/index.jsx`
- [ ] `CreateOrderModal/index.jsx`
- [ ] `LogsTab/index.jsx`
- [ ] `ParticipantsTab/index.jsx`
- [ ] `PlayerCardModal/index.jsx`
- [ ] `RequestsTab/index.jsx`
- [ ] `RespondModal/index.jsx`
- [ ] `SendLinkRecipientModal/index.jsx`
- [ ] `SendPaymentEmailsModal/index.jsx`

**antd 4.9.4 API constraint checklist** (verify before using any of these in shared components):
- `Tabs` → use antd `Tabs` component or keep custom Tabs (our shared Tabs is custom, keep it)
- `DatePicker` — check localized format prop changed in 4.11. Use `format` not `picker` for simple cases.
- `Form.Item` with `name` — same since 4.0, safe.
- `Select` with `options` prop — available since 4.0, safe.
- `Modal` with `destroyOnClose` — available since 4.0, safe.

### B4. RTK Query baseUrl — 1 file

| File | Change needed |
|------|--------------|
| `src/store/services/api.js` | Make `baseUrl` configurable via `configurePaymentsBaseQuery()`. Currently hardcoded to `"/api"`. |

This is the only change needed to the store for embedding — all endpoints in `activitiesApi.js` and others are relative paths (`/activities/${id}`) so they automatically pick up the new base.

---

## Track B — What does NOT need changing

These files in `src/features/activities/` have **no next/* imports** and are already framework-agnostic:
- `src/features/activities/services/activitiesApi.js` — pure RTK Query, no routing
- `src/features/activities/utils/formatting.js`
- `src/features/activities/utils/statusColors.js`
- `src/features/activities/constants.js`
- `src/shared/hooks/useDisclosure.js`
- `src/shared/utils/formatting.js`

---

## React 19-specific API audit (do before starting any rewrites)

Run a search for these before touching any component:

- `use(promise)` — React 19 hook, not available in React 17
- `useFormStatus` — React 19, not available in React 17
- `useOptimistic` — React 19, not available in React 17
- `useActionState` — React 19, not available in React 17
- Auto-forwarded refs (React 19 allows plain `ref` prop on function components — React 17 requires `forwardRef`)

**Status:** Not yet audited. Do this as step 1 of Track A.

---

## recharts version check

pl-football-web uses `recharts ^2.1.9`. easy-payments has `recharts ^3.8.1`.
Recharts 3 requires React 18+. Must downgrade to `recharts 2.15.x`.

**Files using recharts in easy-payments:**
- TBD — run grep for `from 'recharts'` or `from "recharts"`.

---

## Status tracking

Use this to track progress during implementation:

- [ ] **Track A complete** — `src/app/` deleted, `src/pages/` working, standalone dev server runs
- [ ] **B1 complete** — Tabs, Pagination, useUrlState have no next/navigation imports
- [ ] **B2 complete** — 4 files converted from next-intl to react-intl
- [ ] **B3 complete** — 22 files converted from Tailwind to SCSS Modules
- [ ] **B4 complete** — RTK Query baseUrl configurable
- [ ] **React 17 compat** — No React 19-only APIs in any shared/feature file
- [ ] **recharts** — Downgraded to 2.x
- [ ] **Part 1 verification** — All 6 checks from STRUCTURE.md pass
