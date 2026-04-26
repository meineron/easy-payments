---
description: Shared UI primitives — what's available, when to use each, the per-component-folder rule
globs:
  - src/**
alwaysApply: false
---

# Shared Components

Every reusable UI primitive lives in `src/shared/components/<Name>/index.jsx`. Pages and features compose these instead of hand-rolling tables, modals, etc.

## The "one folder per component" rule

```
shared/components/Modal/
  index.jsx
  index.module.css        only when truly needed (animations, complex selectors)
  hooks.js                local hooks if any
  utils.js                local helpers if any
```

Imports use the folder path: `import Modal from "@/shared/components/Modal"`.

## Available primitives

### `Modal`
`@/shared/components/Modal`

Backdrop + centered card. Focus trap, ESC, body-scroll lock, RTL-aware.

```jsx
<Modal open={isOpen} onClose={close} size="lg" ariaLabel="Edit player">
  <Modal.Header title="Edit player" onClose={close} />
  <Modal.Body>{...}</Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={close}>Cancel</Button>
    <Button onClick={save} loading={saving}>Save</Button>
  </Modal.Footer>
</Modal>
```

Sizes: `sm | md | lg | xl | 2xl | 3xl | 4xl | full`.

### `Tabs` (+ `TabPanel`)
`@/shared/components/Tabs`

URL-synced via search params. Falls back to controlled mode.

```jsx
<Tabs paramKey="tab" tabs={[{ value: "participants", label: t("participants") }, ...]} />
<TabPanel value="participants" active={tab}><ParticipantsTab/></TabPanel>
```

Variants: `underline` (default) | `pill`.

### `Dropdown`
`@/shared/components/Dropdown`

Accessible menu (click-outside, keyboard nav).

```jsx
<Dropdown
  trigger={<Button variant="secondary">Actions</Button>}
  items={[
    { label: "Edit", onSelect: () => onEdit(row) },
    { divider: true },
    { label: "Delete", onSelect: () => onDelete(row), danger: true },
  ]}
/>
```

### `Toast`
`@/shared/components/Toast`

Mounted once globally by `<Providers />`. Never render directly. Trigger:

```js
dispatch(pushToast({ message: "Done", type: "success" }));
```

### `Button`
`@/shared/components/Button`

```jsx
<Button>Save</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="danger" loading={busy}>Delete</Button>
<Button fullWidth>Confirm</Button>
<Button mobileFullWidth>Send link</Button>
```

Variants: `primary | secondary | danger | ghost | link`.
Sizes: `sm | md | lg | icon`.

### `Input`
`@/shared/components/Input`

Wraps `<input>` / `<textarea>` / `<select>` with label, hint, error.

```jsx
<Input label={t("email")} type="email" required hint={t("workEmail")} error={errors.email} />
<Input as="textarea" label={t("notes")} rows={4} />
<Input as="select" label={t("status")}>
  <option value="active">Active</option>
</Input>
```

For phone, use `@/components/PhonePrefixInput` (existing legacy primitive).

### `Table` — `ResponsiveTable` + `MobileAccordionCard`
`@/shared/components/Table`

Codifies the desktop-table + mobile-card pattern from `mobile-design.md`.

```jsx
<ResponsiveTable
  items={orders}
  getKey={(o) => o._id}
  columns={[
    { key: "name", header: t("name"), cell: (o) => o.name },
    { key: "due", header: t("due"), cell: (o) => fmtMoney(o.due), align: "end" },
  ]}
  mobileCard={(o) => <OrderCard order={o} />}
  empty={t("noOrders")}
  loading={isLoading}
/>
```

For a custom mobile row, use `MobileAccordionCard` directly.

### `Pagination`
`@/shared/components/Pagination`

URL-driven (`?page=`, `?pageSize=`). Pass `total` and let it manage the rest.

```jsx
<Pagination total={data.total} />
```

### `RichTextEditor`
`@/shared/components/RichTextEditor`

The legacy WYSIWYG, folderized. The shim at `@/components/RichTextEditor` still works for old code.

## Hooks

`@/shared/hooks/useDisclosure` — `{ isOpen, open, close, toggle }`.
`@/shared/hooks/useUrlState` — `useUrlParam(key, default)` + `useUrlParams(schema)`.

## Utils

`@/shared/utils/formatting` — `centsToDisplay`, `displayToCents`, `fmtDate`, `fmtDateTime`, `fmtMoney`.

## Adding a new shared primitive

1. Create `src/shared/components/<Name>/index.jsx` with `"use client"`.
2. Use design tokens from `globals.css` — no raw hex, no inline pixel measurements outside Tailwind utilities.
3. RTL: use `start`/`end` Tailwind spacing utilities instead of `left`/`right`.
4. Accessibility: keyboard support, ARIA labels, focus management for anything interactive.
5. Add a usage block to this file.
6. Update `.cursor/rules/frontend-architecture.md` if the component layer grows.
