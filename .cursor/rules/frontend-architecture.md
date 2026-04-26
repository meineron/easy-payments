---
description: Frontend folder layout, features vs shared, where new code goes
globs:
  - src/**
alwaysApply: true
---

# Frontend Architecture

The frontend is organized in three layers. **Always pick the correct layer before adding new code.**

## Folder layout

```
src/
  app/           Next.js routes — thin shells, no business logic
    layout.js
    providers.js
    api/
    dashboard/
    admin/
    <route>/
      page.js
      _components/<Name>/index.jsx + index.module.css   page-local UI
      _utils/<name>.js                                  page-local helpers
      _hooks/<name>.js                                  page-local hooks
  features/      Domain code — one folder per business feature
    activities/
      components/<Name>/index.jsx
      hooks/
      services/        RTK Query endpoints (inject into the base api)
      utils/
      constants.js
  shared/        Generic, domain-free building blocks
    components/<Name>/index.jsx [+ index.module.css]
    hooks/
    utils/
    styles/
  store/         Redux Toolkit
    index.js, StoreProvider.js
    services/api.js
    slices/uiSlice.js
  lib/           Pure server-side / framework utilities (mongodb, auth, email, ...)
  models/        Mongoose schemas
  messages/      i18n JSON
```

## Layer rules

1. **`src/app/` is for routing only.** Pages compose feature components and page-local components. No `fetch`, no logic, no inline component definitions over ~50 lines. A page should generally be < 200 lines.
2. **`features/<name>/` owns its UI, hooks, services, utils.** A feature may import from `shared/` and `lib/`. It must NOT import from another feature's internals — if two features need the same thing, move it to `shared/` or `lib/`.
3. **`shared/` is domain-free.** No mention of Order, Activity, Player, Team, etc. If you need to ask "could this live in another product?", the answer must be yes.
4. **`store/` is the only place a Redux slice or RTK Query base lives.** Feature endpoints inject into `store/services/api.js` via `api.injectEndpoints`.
5. **`lib/` is pure utilities.** `dbConnect`, `authOptions`, `getClubStripe`, formatting helpers used by API routes. No React.
6. **`models/` is Mongoose only.** No Mongoose imports outside `models/` and `lib/` or API routes.

## Component file rule

Every component lives in its own folder:

```
ComponentName/
  index.jsx                  required
  index.module.css           optional in shared/features (see styling.md);
                             required for page-local components
  hooks.js                   optional — local hooks
  utils.js                   optional — local helpers
  constants.js               optional
```

Imports drop the trailing `/index`:
- `from "@/shared/components/Modal"`
- `from "@/features/activities/components/ParticipantsTab"`
- `from "./_components/StepIndicator"` (page-local, relative)

## Page-local components

A component used by **exactly one route** lives next to that route, not in `features/` or `shared/`. This keeps unrelated, single-use UI from polluting cross-cutting folders.

```
src/app/<route>/
  page.js                                ← thin shell
  _components/<Name>/
    index.jsx                            ← required
    index.module.css                     ← required (may be empty stub)
  _utils/<name>.js                       ← page-local pure helpers
  _hooks/<name>.js                       ← page-local custom hooks
```

The `_` prefix is Next.js App Router's [private-folder convention](https://nextjs.org/docs/app/getting-started/project-structure#private-folders) — folders that start with `_` are excluded from routing, so `_components/foo/index.jsx` cannot be reached as a URL.

### Promotion ladder

The boundary between page-local, feature, and shared follows reuse:

1. **Used by 1 route only** → `src/app/<route>/_components/<Name>/`
2. **Used by 2+ routes in the same domain** → promote to `src/features/<feature>/components/<Name>/`
3. **Generic, domain-free, reused across features** → promote to `src/shared/components/<Name>/`

Move the file when the second consumer appears. Don't speculatively put new components in `features/` or `shared/` "in case we need them elsewhere".

### When to extract a page-local component

- The JSX block is > ~40 lines, **or**
- It has its own meaningful local state, **or**
- It's gated by a step / route-state condition (`{step === N && (...)}`).

Pure JSX wrappers under ~40 lines with no state can stay inline in `page.js`.

## "Use client"

All current dashboard, admin, register, payment pages and all `shared/` components are client components. **Server Components / Server Actions are out of scope** — see `.cursor/rules/dashboard-pages.md`. Add `"use client"` to every new component file in `features/` and `shared/`.

## Composition, not HOCs

Prefer hooks + composition over higher-order components. For shared behavior (e.g. modal disclosure, URL state), use the hooks in `src/shared/hooks/`.

## `src/components/` is deprecated

The flat `src/components/` directory is legacy. **New code goes in `shared/components/<Name>/` or `features/<feature>/components/<Name>/`.** Existing files there are folderized as they are touched. Don't add new files there.

## Path alias

`@/` → `src/`. Always use `@/...` imports, never relative `../../...` across more than one level.

## Linter / quality

- ESLint is `eslint-config-next`. Don't disable rules without a comment.
- No magic numbers; use design tokens (`.cursor/rules/styling.md`).
- No comments that just narrate code (per `AGENTS.md`).

## Performance

Lazy-load heavy or below-the-fold components, optimize images, paginate long lists, and don't memoize without a measured reason. Full rules in `.cursor/rules/performance.md`.

## Where the code is

- Base RTK Query api: `src/store/services/api.js`
- UI slice (toasts, modal stack): `src/store/slices/uiSlice.js`
- Root providers: `src/app/providers.js`
- Shared primitives: `src/shared/components/{Modal,Tabs,Dropdown,Toast,Button,Input,Table,Pagination,RichTextEditor}/`
- Shared hooks: `src/shared/hooks/{useDisclosure,useUrlState}.js`
- Shared formatters: `src/shared/utils/formatting.js`
- Page-local example: `src/app/register/[activityId]/{_components,_utils,_hooks}/`

## Self-maintenance

When you add a feature folder, a new shared primitive, or shift the boundary between `app`/`features`/`shared`, update this file.
