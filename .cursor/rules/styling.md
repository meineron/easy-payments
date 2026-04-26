---
description: Tailwind v4 + design tokens, when CSS modules are allowed, RTL conventions
globs:
  - src/**
alwaysApply: false
---

# Styling

The project uses **Tailwind CSS v4 only**. No SCSS, no styled-components, no CSS-in-JS runtime.

## Design tokens

Tokens live in `src/app/globals.css` under `:root` and are exposed to Tailwind via `@theme inline`. Add new tokens there, never hardcode values in components.

Existing token categories:
- `--color-brand-{50,100,500,600,700}` — brand palette
- `--color-status-<status>-{bg,fg}` — order/payment status pills
- `--z-{dropdown,drawer,modal,toast}` — z-index scale

When you reach for a hardcoded hex or pixel value:
1. Check if a token already exists.
2. If not, add one to `globals.css` and use it.

## When CSS Modules (`index.module.css`) are allowed

### Shared and feature components — on demand only

For `src/shared/components/<Name>/` and `src/features/<feature>/components/<Name>/`, the default is **no module file**. Tailwind handles 95% of styling. Reach for `index.module.css` only for:

- Keyframe animations that aren't trivial (`@keyframes`)
- `:has()`, complex `:nth-child`, or other selectors Tailwind can't express cleanly
- Print styles (`@media print`)
- 3rd-party library overrides (e.g. Stripe Elements iframe)

When you do, the file lives next to the component:

```
shared/components/Toast/
  index.jsx
  index.module.css
```

Import as `import s from "./index.module.css"` and apply `className={s.something}`.

### Page-local components — always paired

Page-local components in `src/app/<route>/_components/<Name>/` (see `frontend-architecture.md`) **always** ship with an `index.module.css` file, even when empty. Page-local UI is bespoke per route and grows page-specific tweaks over time, so the stub file removes the friction of "should I add a module file now?" debates later.

A new page-local component starts with:

```
src/app/<route>/_components/<Name>/
  index.jsx
  index.module.css                ← may contain only a header comment
```

The `index.module.css` may be a one-line placeholder until you actually need it:

```css
/* Page-local styles for <Name>. Add Tailwind-incompatible rules here. */
```

## RTL

The dashboard supports `en` (LTR) and `he` (RTL). Use Tailwind's logical properties — never `left`/`right`.

| Don't | Do |
|---|---|
| `pl-4` | `ps-4` (padding-inline-start) |
| `pr-4` | `pe-4` (padding-inline-end) |
| `ml-4` | `ms-4` |
| `mr-4` | `me-4` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `border-l` | `border-s` |

Direction is set on `<html dir>` by the dashboard layout and re-applied via `globals.css` selectors. Inputs that should always render LTR (email/url/tel) are handled globally — no per-input override needed.

## Mobile-first

See `.cursor/rules/mobile-design.md`. Inputs default to `w-full`. Primary actions on mobile are full-width; secondary actions pair into `grid grid-cols-2`. Tables become accordion cards under `md`.

## Status colors

The `STATUS_COLORS` map (used by orders, payment requests, etc.) is materialized as tokens (`--color-status-*`) so all features render statuses identically. New statuses get a new token pair.

## Z-index

Always use a token (`var(--z-modal)` etc.) or the matching Tailwind utility (`z-[60]` for modal, `z-[100]` for toast). Never invent ad-hoc z values.

## Self-maintenance

When you add a token category or change RTL conventions, update this file.
