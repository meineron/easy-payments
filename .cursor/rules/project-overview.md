---
description: EasyCoach Payments — project overview, stack, and conventions. Always read this first.
globs:
alwaysApply: true
---

# EasyCoach Payments Platform

Sports-club payment & registration SaaS. Clubs create activities, parents register players, payments flow through Stripe.

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Database | MongoDB via Mongoose 9 |
| Auth | NextAuth 4 (Credentials provider, JWT strategy) |
| Payments | Stripe (platform key + per-club direct keys) |
| Email | Nodemailer (SMTP) |
| i18n | next-intl 4 — locales: `en`, `he` (RTL) |
| Styling | Tailwind CSS v4 + design tokens in `globals.css` (no SCSS, no component library) |
| State | Redux Toolkit + RTK Query (server data) + URL search params (filters/tabs/pagination) + `useState` (transient UI) |
| Fonts | Geist Sans + Geist Mono via `next/font/google` |
| File parsing | mammoth (Word→HTML for waivers), xlsx (spreadsheet imports) |

## Path Alias

`@/` → `src/` (configured in `jsconfig.json`)

## Project Structure

```
src/
├── app/                  # Next.js routes — thin shells, no business logic
│   ├── api/              # Route Handlers (REST-ish)
│   ├── admin/            # Platform admin pages
│   ├── dashboard/        # Club dashboard (authed, client-side)
│   ├── payment/          # Public payment flow ([token])
│   ├── register/         # Public registration flow ([activityId])
│   ├── providers.js      # Root client providers (Redux + global Toast)
│   ├── layout.js         # Root layout (fonts, metadata)
│   └── page.js           # Login page (/ route)
├── features/             # Domain code, one folder per business feature
│   └── <name>/components, hooks, services, utils, constants.js
├── shared/               # Generic, domain-free building blocks
│   ├── components/       # Modal, Tabs, Dropdown, Toast, Button, Input, Table, Pagination, RichTextEditor
│   ├── hooks/            # useDisclosure, useUrlState
│   └── utils/            # formatting helpers
├── store/                # Redux Toolkit
│   ├── index.js          # configureStore + makeStore
│   ├── StoreProvider.js  # client provider
│   ├── services/api.js   # base RTK Query api
│   └── slices/uiSlice.js # toasts + modal stack
├── components/           # DEPRECATED legacy — new code goes in shared/ or features/
├── lib/                  # Utility modules (see below)
├── messages/             # i18n JSON files (en.json, he.json)
└── models/               # Mongoose schemas
```

See `.cursor/rules/frontend-architecture.md` for layer rules.

## Key Lib Modules

| File | Purpose |
|---|---|
| `lib/mongodb.js` | `dbConnect()` — cached Mongoose connection via `global.mongoose` |
| `lib/auth.js` | `authOptions` — NextAuth config: admin (env) + club (DB) credentials |
| `lib/stripe.js` | Platform `stripe` instance (`STRIPE_SECRET_KEY`) |
| `lib/get-club-stripe.js` | `getClubStripe(clubId)` — per-club Stripe instance from DB secret |
| `lib/email.js` | Email senders: verification, registration link, invoice, parent invite, payment link, custom email |
| `lib/i18n.js` | `getMessages(locale)`, `getDirection(locale)`, `getDateLocale(locale)` |
| `lib/verification-codes.js` | In-memory verification code store (6-digit, 10-min expiry) |

## Mongoose Models

All in `src/models/`, all use the hot-reload guard pattern:
```js
if (mongoose.models.ModelName) delete mongoose.models.ModelName;
export default mongoose.model("ModelName", Schema);
```

| Model | Key relationships |
|---|---|
| Club | Has language, Stripe keys, logo |
| Activity | belongs to Club; has teams, subscriptions, coupons, waivers, formSections |
| Team | belongs to Club |
| Player | belongs to Club |
| Parent | belongs to Club |
| Order | belongs to Activity + Club; tracks payment, installments, form data |
| OrderLog | audit log for Order changes |
| Registration | links Order to registration flow |
| Transaction | payment transaction records |

## Auth Roles

- **admin** — env-based credentials (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), accesses `/admin`
- **club** — DB-based credentials (Club model, bcrypt), accesses `/dashboard`

Session fields for club: `id`, `name`, `username`, `stripeAccountId`, `onboardingComplete`, `hasDirectStripeAccess`

## Middleware

`src/middleware.js` protects:
- `/admin/*` → must be admin role
- `/dashboard/*` → must be club role
- `/api/admin/*` → must be admin role (returns 401)

## Environment Variables

`MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SMTP_HOST`, `EMAIL_PORT`, `EASYCOACH_EMAIL`, `EASYCOACH_EMAIL_PASSWORD`, `CUSTOMER_STRIPE_SECRET_KEY`

## Stripe Architecture

- **Platform mode**: `STRIPE_SECRET_KEY` for Stripe Connect (clubs onboard)
- **Direct mode**: Some clubs have `hasDirectStripeAccess: true` with their own `stripeSecretKey` stored in the Club document
- Webhook: `src/app/api/stripe/webhook/route.js`

## Styling Conventions

- Tailwind v4 utility classes directly in JSX
- Design tokens in `globals.css` (`--background`, `--foreground`, `--color-brand-*`, `--color-status-*`, `--z-*`)
- RTL support via `[dir="rtl"]` selectors in globals.css; use logical Tailwind utilities (`ps`/`pe`/`ms`/`me`/`text-start`/`text-end`)
- No component library — all UI is hand-written. See `.cursor/rules/styling.md` and `.cursor/rules/shared-components.md`.

## Frontend Conventions (read these too)

- `.cursor/rules/frontend-architecture.md` — folder layout, layer rules
- `.cursor/rules/state-management.md` — Redux Toolkit + RTK Query
- `.cursor/rules/shared-components.md` — primitives library
- `.cursor/rules/styling.md` — tokens, RTL, when CSS modules are allowed
- `.cursor/rules/performance.md` — lazy loading, images, lists, memoization
- `.cursor/rules/backend-services.md` — services-layer pattern for API routes
