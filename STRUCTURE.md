# Integration Plan: easy-payments → pl-football-web

## Goal

Merge easy-payments into pl-football-web as a consumable submodule, keeping it as a fully working standalone Next.js app throughout. Work splits into two sequential parts:

1. **Part 1 — Frontend:** stack alignment in easy-payments + submodule wiring under pl-football-web. Components must render inside pl-football-web with mock data before any API work begins.
2. **Part 2 — API & Backend:** real data flow, feature flag, and PHP proxy for production.

---

## Architecture decisions (locked in)

| Decision | Value |
|---------|-------|
| Leading project | **pl-football-web** — does not upgrade |
| pl-football-web stack | React 17, rsbuild SPA (NOT Next.js), react-router 5, antd 4.9.4, MUI 5 + legacy MUI 4, react-intl 5.12.3, redux + saga, react-redux 7.2 |
| easy-payments target | React 17, **Next.js 12.3 (Pages Router)**, antd 4.9.4 + MUI 5, react-intl 5.12.3, react-redux 7.2 |
| Standalone payments | Stays alive on `payments.easycoach.club` (Pages Router after migration) |
| Code location | Components live in easy-payments; pl-football-web imports via `@payments/*`. No duplication. |
| Data layer | **RTK Query with shared `fetchBaseQuery`** (NOT a custom axios client). Both hosts configure the same base. |
| Embedded auth (DEV) | Trust-headers middleware in payments accepts `X-EC-User-Id` / `X-EC-Club-Id` when `EC_DEV_TRUST_HEADERS=1`. |
| Embedded auth (PROD) | **Only Phase B ships to prod** — PHP proxy with `X-EC-Proxy-Secret`. Phase A is dev-only. |
| Stripe (initial client) | Single platform publishable key, browser → Stripe direct. No Connect / per-club keys for the first customer. Per-club Stripe is a future phase. |
| antd version | **Stay on antd 4.9.4** in pl-football-web. Payments components must restrict to APIs available in 4.9.4. |
| TypeScript stance | easy-payments stays JS-only (`jsconfig.json`). No TS migration during alignment. |
| Stripe webhooks | Always hit standalone payments `:3001` (or its prod URL). Never proxied. |

---

## Data flow

### Phase A — DEV ONLY (direct browser → payments)

```
flowchart LR
    plweb["pl-football-web :8080 (imports @payments/*)"]
    payments["payments :3001 (Next.js 12 Pages Router)"]
    newback["pl-football-newback (existing v3 API)"]
    stripe[("Stripe")]
    mongo[("Mongo")]
    mysql[("MySQL")]

    plweb -->|"RTK Query :3001/api/* + X-EC-User-Id + X-EC-Club-Id"| payments
    plweb -->|"existing /api/v3/event/*"| newback
    plweb -->|"Stripe Elements (browser direct)"| stripe
    payments --> mongo
    newback --> mysql
```

### Phase B — PRODUCTION (PHP proxy, browser never calls :3001)

```
flowchart LR
    plweb["pl-football-web :8080 (imports @payments/*)"]
    newback["pl-football-newback (+ New_payments controller)"]
    payments["payments :3001 (Next.js 12 Pages Router)"]
    stripe[("Stripe")]
    mongo[("Mongo")]
    mysql[("MySQL")]

    plweb -->|"RTK Query /api/v3/new_payments/*"| newback
    plweb -->|"existing /api/v3/event/*"| newback
    plweb -->|"Stripe Elements (browser direct)"| stripe
    newback -->|"cURL + X-EC-Proxy-Secret + X-EC-User-Id + X-EC-Club-Id"| payments
    payments --> mongo
    newback --> mysql
```

The only thing that changes between A and B is the RTK Query base URL and the trust mechanism on the Next.js side. Component code is identical.

---

## Part 1 — Frontend (stack alignment + submodule)

### 1.0. Inventory pass (first task)

Before any rewrites, produce two lists in `easy-payments/MIGRATION_INVENTORY.md`:

- **Files importing `next/navigation`, `next/link`, `next/image`, `next/headers`** → need routing-agnostic refactor.
- **Files using next-intl APIs** (`useTranslations`, `getTranslations`, `NextIntlClientProvider`) → need react-intl conversion.
- **Files using Tailwind utility classes** → need SCSS module conversion.
- **Files in `src/app/`** → need Pages Router migration.

This anchors the work estimate. ~30 min of grep, blocks the rest of Part 1.

---

### 1.1. Stack alignment in easy-payments

Done in the easy-payments repo, standalone, on a feature branch. **In this order — earlier steps must pass before next step starts:**

**1. React 19 → 17.2 (latest 17 patch)**
- Fix every `use(...)` call (React 19-only).
- Audit for React 19-only hooks (`useFormStatus`, `useOptimistic`, `useActionState`).
- Recharts 3.x → **2.15.x** (matches pl-football-web's `recharts ^2.1.9`).
- Verify ref forwarding semantics (React 19 made refs work without `forwardRef`; React 17 requires it).

**2. Redux Toolkit version check (verify before committing)**
- RTK 2.x peer dep is `react-redux@^9` for some hooks. **First test:** does RTK 2.11 work with react-redux 7.2?
- If not → downgrade to **RTK 1.9.7** (last to officially support react-redux 7).
- RTK Query API is identical between 1.9 and 2.x for `createApi` / `fetchBaseQuery`, so endpoint code doesn't change.

**3. Next.js 16 → 12.3.4** (last major officially supporting React 17)
- Drop App Router. Move `payments/src/app/*` → `payments/src/pages/*`.
- API routes: `app/api/.../route.js` → `pages/api/....js`.
- Auth route: `app/api/auth/[...nextauth]/route.js` → `pages/api/auth/[...nextauth].js`.
- Add **`pages/_app.js`** (wraps app in `IntlProvider`, Redux `Provider`, layout).
- Add **`pages/_document.js`** (custom HTML scaffold + RTL `dir` attribute for `he`).
- Replace any RSC patterns (`async function Component`, server-only data fetching in components) with `getServerSideProps` / `getStaticProps`.

**4. Tailwind v4 removal**
- Drop `@tailwindcss/postcss` + `tailwindcss`.
- Each shared component converted to **antd 4.9.4-compatible APIs** (`Tabs`, `Drawer`, `Modal`, `Button`, `Input`, `Form`, `Select`, `DatePicker` — verify each used prop exists in 4.9.4) and MUI v5 (`Box`, `Stack`, `IconButton`).
- Replace Tailwind utility classes with **SCSS Modules** (`Component.module.scss`) — gives automatic class name scoping, prevents bleed when mounted in pl-football-web.
- Where global styles are unavoidable, scope under `.ec-payments-root` selector and wrap embedded components in a `<div className="ec-payments-root">` boundary.

**5. next-intl 4 → react-intl 5.12.3** (match pl-football-web exactly)
- `useTranslations('namespace')` → `useIntl()` + `intl.formatMessage({ id: 'namespace.key' })`.
- `NextIntlClientProvider` → `IntlProvider` in `pages/_app.js`.
- Messages format: react-intl 5 uses ICU MessageFormat — same as next-intl 4, so JSON shape mostly survives. Verify plurals/selects.
- **Namespace strategy:** prefix all payments messages with `payments.*` to avoid collision with pl-football-web keys. Standalone payments can import directly; pl-football-web merges them into its existing message bundle.

**6. react-redux 9 → 7.2.x**
- Verify all `useSelector` / `useDispatch` call sites still work (API is stable).
- `connect` HOC if used — unchanged.

**7. Routing-agnostic shared components**
- Refactor every component flagged in step 1.0:
  - Replace `next/link` with a `Link` prop. Default = standalone wires `next/link`; pl-football-web wires `react-router-dom Link`.
  - Replace `useRouter` with an injected `onNavigate(url)` callback prop.
  - Replace `next/image` with a plain `<img>` wrapper or accept an `Image` prop.
- Prefer **React context** for these injections (`PaymentsHostContext`) over prop drilling — set once at the host boundary.

---

### 1.2. RTK Query shared base (`payments/src/shared/api/baseQuery.js`)

Single configurable `fetchBaseQuery` consumed by every RTK Query slice in payments:

```js
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';

let config = { baseUrl: '', headers: () => ({}) };

export function configurePaymentsBaseQuery({ baseUrl = '', headers = () => ({}) } = {}) {
  config = { baseUrl, headers };
}

export const paymentsBaseQuery = (...args) =>
  fetchBaseQuery({
    baseUrl: config.baseUrl,
    prepareHeaders: (h) => {
      Object.entries(config.headers() ?? {}).forEach(([k, v]) => h.set(k, v));
      return h;
    },
  })(...args);
```

- **Standalone `_app.js`:** leaves defaults — calls go to relative `/api/*`.
- **pl-football-web Phase A boot:** `configurePaymentsBaseQuery({ baseUrl: 'http://localhost:3001', headers: () => ({ 'X-EC-User-Id': coachId, 'X-EC-Club-Id': clubId }) })`.
- **Phase B boot:** `configurePaymentsBaseQuery({ baseUrl: '/api/v3/new_payments', headers: () => ({}) })` — newback strips/adds the proxy headers itself; browser sends nothing extra.

Every `createApi({ baseQuery: paymentsBaseQuery })` in payments slices works in both hosts unchanged.

---

### 1.3. Submodule wiring in pl-football-web

```bash
git submodule add <payments-repo-url> submodules/payments
```

**`rsbuild.config.js` changes:**
- Add resolve alias: `'@payments': path.resolve(__dirname, 'submodules/payments/src')`.
- Add `submodules/payments/src` to `source.include` so swc transpiles it (rsbuild defaults exclude `node_modules`-style paths).
- Confirm SCSS plugin processes `*.module.scss` under that path.

**Shim files** in `pl-football-web/src/shims/`:
- `next-link.js` — re-exports `react-router-dom Link` with the `href` prop mapped to `to`.
- `next-image.js` — exports a plain `<img>` wrapper.
- `next-router.js` — exports a `useRouter` hook backed by `react-router`'s `useHistory` + `useLocation`.

These are a safety net for any leftover `next/*` import that survives Part 1 step 7. Standalone payments never consults them.

**HMR:** rsbuild watches `source.include` paths, so editing files under `submodules/payments/src/` from inside pl-football-web triggers hot reload. Verify in Part 1 verification.

---

### 1.4. Feature folder in pl-football-web

`src/Features/EasyPaymentsV2/` (named to avoid collision with existing `src/Features/Payments/`).

Thin host adapter — UI lives in `submodules/payments/src/features/activities/`.

| File | Purpose |
|------|---------|
| `index.js` | Re-exports `AddActivityDrawer`, `ActivityDashboard` from `@payments/features/activities` wrapped in `<PaymentsHostBoundary>` |
| `bootstrap.js` | Calls `configurePaymentsBaseQuery(...)` once on app init from redux state |
| `PaymentsHostBoundary.jsx` | Wraps children with: i18n namespace prefix, `PaymentsHostContext` provider injecting `Link` + `onNavigate`, `<div className="ec-payments-root">` style scope |
| `withCreate.js` | Wraps `AddActivityDrawer`; on success also fires legacy `createEvent` and navigates |

**Code-splitting:** `index.js` exports use `React.lazy` so the payments bundle loads on demand, not in the main pl-football-web bundle.

---

### 1.5. Part 1 verification (no real API yet — use mocks)

- [ ] easy-payments standalone (`yarn dev` → `:3001`) renders dashboard, no console errors. Pages Router migration didn't regress anything.
- [ ] pl-football-web (`yarn start`) builds clean with the submodule alias set.
- [ ] `MIGRATION_INVENTORY.md` is empty for `next/*` imports (or fully covered by shims).
- [ ] A test route in pl-football-web mounts `ActivityDashboard` with a mocked RTK Query response (MSW or hand-rolled mock). Renders without errors, antd/MUI styling intact, no Tailwind classes leaked.
- [ ] HMR works: edit a file under `submodules/payments/src/features/activities/` from the pl-football-web workspace, change reflects without restart.
- [ ] Bundle analyzer shows the payments chunk loads lazily (not in `main.js`).
- [ ] Scope test: pl-football-web's existing pages render identically before/after the submodule is added (no antd global-style regression).

---

## Part 2 — API & Backend

> Start only after Part 1 verification passes.

### 2.1. Phase A — DEV ONLY direct calls

**Trust-headers middleware** (`payments/src/lib/auth/trust-headers.js`):

- If `process.env.EC_DEV_TRUST_HEADERS === '1'` AND `process.env.NODE_ENV !== 'production'` AND `X-EC-User-Id` is present → build synthetic session `{ userId, clubId }`, skip `getServerSession`.
- **Hard fail** at app boot if `NODE_ENV === 'production'` AND `EC_DEV_TRUST_HEADERS === '1'`. Throw before serving a single request. (Critical safety latch — without this, an env-var slip = full tenant takeover.)
- Otherwise fall back to next-auth.
- Used by every API route in `payments/src/pages/api/activities/*` via a `withTrustHeaders(handler)` wrapper.

**Multi-tenant Mongo:** trust-headers middleware also resolves the club's Mongo connection from `X-EC-Club-Id` and stores it on `req` (matches the existing per-club DB pattern from `multi-tenant.md`).

**Local dev env (Phase A):**

| File | Value |
|------|-------|
| `payments/.env.local` | `EC_DEV_TRUST_HEADERS=1`, `NEXTAUTH_URL=http://localhost:3001` |
| `pl-football-web/.env` | `REACT_APP_PAYMENTS_API_URL=http://localhost:3001` |

**Run order:** payments `:3001` → newback → pl-football-web `:8080`.

**Windows note:** payments scripts currently use POSIX `NODE_OPTIONS='...' next dev` syntax which fails on PowerShell. Add `cross-env` to `package.json` scripts during Part 1 step 3.

---

### 2.2. Legacy event flag (`pl-football-newback`)

**New migration:** `en/application/migrations/966_add_uses_new_payments_to_tbl_event.php`

- `uses_new_payments` — `TINYINT(1) NOT NULL DEFAULT 0`
- `payment_activity_id` — `VARCHAR(24) NULL DEFAULT NULL` (Mongo ObjectId = 24 hex chars)

Follows `Easy_migration` pattern (see `965_player_beach_confirmation_columns.php`).

**Model + controller wiring:**
- `Event_model.php`: include both columns in `SELECT` in `custom()`; accept both in `create`/`update` payload mapping.
- `Event.php custom()`: response carries both fields per row → `eventsTable.jsx` branches on `event.uses_new_payments`.
- **Create path:** after shared drawer creates the Mongo doc, the controller persists `uses_new_payments=1` and `payment_activity_id=<mongo id>` on the new `tbl_event` row.

---

### 2.3. Trigger wiring in pl-football-web

- **`src/pages/activities/index.jsx`** (lines 274–289): when `clubFeaturesKeys.new_payments_v2` is on, Season Registration / Camp Registration menu items mount `EasyPaymentsV2/withCreate`.
- **`src/pages/activities/eventsTable.jsx`**: if `event.uses_new_payments` → push `/app/activities/v2/${event.event_id}`. Add "New" badge.
- **`src/Routes/index.jsx`**: register `/app/activities/v2/:legacyEventId` mounting `ActivityDashboard`. Route reads `payment_activity_id` from the legacy event and passes it as `activityId` prop.

**Rollback safety:** if the feature flag is flipped off but events already have `uses_new_payments=1`, those rows stay branched (the row click logic uses the per-row flag, not the cluster flag). The cluster flag only gates **new** activity creation. Document this in the rollout runbook.

---

### 2.4. Phase B — PRODUCTION PHP proxy

**Proxy controller:** `en/application/modules/api/controllers/v3/New_payments.php` extending `Api_Controller` (auth, subdomain, `$this->coach_id` / `$this->club_id` come for free). Pattern matches `Event.php`.

**Helper library:** `en/application/new_modules/payments/libraries/Payments_Proxy.php` exposing `request($method, $path, $body, $query)`:
- Reads `EC_PAYMENTS_API_URL`, `EC_PROXY_SECRET` from CI config.
- `curl_init` to `{EC_PAYMENTS_API_URL}{path}` (cURL is already used in `Videos.php`, `User.php`, `MatchAnalysis.php`).
- Adds headers: `Content-Type: application/json`, `X-EC-Proxy-Secret`, `X-EC-User-Id`, `X-EC-Club-Id`, `X-EC-Subdomain`.
- Returns `{ status_code, body }` for pass-through.

**Initial routes (narrow — only what the activity shell exercises):**

| pl-football-web call | proxied to |
|---------------------|-----------|
| `POST /api/v3/new_payments/activities` | `POST :3001/api/activities` |
| `GET /api/v3/new_payments/activities/{id}` | `GET :3001/api/activities/{id}` |
| `GET /api/v3/new_payments/activities` | `GET :3001/api/activities` |

Register in `application/modules/api/config/routes.php`. Generic passthrough is Phase 1 quality-of-life.

**Trust extension in payments:** middleware also accepts `X-EC-Proxy-Secret === process.env.EC_PROXY_SECRET` as a valid trust signal (in addition to `EC_DEV_TRUST_HEADERS=1`). Server-to-server only — no CORS concerns.

**Flip the bootstrap:** `EasyPaymentsV2/bootstrap.js` calls `configurePaymentsBaseQuery({ baseUrl: '/api/v3/new_payments', headers: () => ({}) })`. Standalone path unchanged.

**Local dev (Phase B):**

| File | Value |
|------|-------|
| `en/application/config/payments.php` (new) | `EC_PAYMENTS_API_URL=http://localhost:3001`, `EC_PROXY_SECRET=<generated>` |
| `payments/.env.local` | `EC_PROXY_SECRET=<same value>` |
| `pl-football-web/.env` | Remove `REACT_APP_PAYMENTS_API_URL` |

---

### Phase B verification

- [ ] DevTools network panel: zero browser calls to `:3001`. Only `/api/v3/new_payments/*` and `/api/v3/event/*` (plus Stripe Elements, which is expected).
- [ ] Next.js server logs: every request carries `X-EC-Proxy-Secret`, `X-EC-User-Id`, `X-EC-Club-Id`.
- [ ] Standalone payments at `:3001` still loads dashboard (proves API is not coupled to proxy-only auth).
- [ ] `EC_DEV_TRUST_HEADERS=1` accidentally set in production env → app fails to boot (safety latch test).

---

## Cross-cutting concerns

| Concern | Decision |
|---------|----------|
| CSS isolation | SCSS Modules per component + `.ec-payments-root` scope class on the embed boundary |
| Bundle size | `React.lazy` per feature in `EasyPaymentsV2/index.js`; bundle analyzer in CI |
| i18n namespacing | All payments keys prefixed `payments.*`; pl-football-web merges into its bundle |
| Trust header safety | App boot rejects `EC_DEV_TRUST_HEADERS=1 + NODE_ENV=production` |
| Stripe webhooks | Always hit standalone payments URL; never proxied through newback |
| Stripe Elements | Single platform publishable key for first customer; per-club Connect = future phase |
| TypeScript | easy-payments stays JS-only |
| Windows scripts | Add `cross-env` to all payments npm scripts |

---

## Submodule lifecycle policy

| Topic | Policy |
|-------|--------|
| Push permissions | Same team owns both repos. Payments PRs merge to its own `main`. |
| SHA bump in pl-football-web | Manual. After payments PR merges, the developer who needs the change opens a pl-football-web PR that bumps the submodule pointer. |
| CI | pl-football-web CI runs `git submodule update --init --recursive` as a build step. |
| Local dev | `git clone --recursive` for fresh clones. Existing clones run `git submodule update --init`. |
| Branch tracking | pl-football-web pins to specific SHAs (default git submodule behavior). No automatic tracking of `main`. |

---

## What is NOT in Phase 0

- Porting `ParticipantsTab`, `ActivityTeamsTab`, `LogsTab`, `RequestsTab` content — only shell + tab nav are wired in Part 1; tab bodies are Phase 1.
- Generic wildcard proxy in PHP — explicit endpoints only; wildcard is Phase 1.
- Removing the dashboard UI from easy-payments — stays as live standalone reference.
- Switching standalone payments back to App Router or React 19 — alignment is permanent for the React 17 baseline lifetime.
- Per-club Stripe Connect keys — single platform key for first customer.
- TypeScript migration of easy-payments.

---

## Open questions before coding

1. **Submodule mount path:** `submodules/payments/` vs `vendor/payments/` vs `packages/payments/` — preference?
2. **Payments git remote URL** — what URL does pl-football-web's submodule reference? Confirm push permissions.
3. **Feature key name:** `clubFeaturesKeys.new_payments_v2` — OK or align with an existing flag?
4. **PHP config location:** new `en/application/config/payments.php` or extend an existing config file?
5. **Phase A.5 vendor copy:** temporarily vendor-copy aligned payments code into pl-football-web (no submodule yet) to de-risk bundler integration before introducing the submodule pointer — useful or skip?
6. **RTK version:** verify RTK 2.11 works on react-redux 7.2 during Part 1 step 2. If not, downgrade to RTK 1.9.7.
