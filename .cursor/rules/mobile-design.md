---
description: Mobile-first design conventions for dashboard pages — input/button widths, table-to-card accordion pattern
globs:
  - src/app/dashboard/**
  - src/app/admin/**
  - src/components/**
alwaysApply: false
---

# Mobile design (`md` and below)

These rules apply to anything that renders on mobile, i.e. **below the `md:` Tailwind breakpoint (`< 768px`)**. Desktop layouts continue to use `md:` / `lg:` / `xl:` qualifiers.

## Inputs

Default to **full width** (`w-full`) on mobile. Only constrain width when the design explicitly calls for it (e.g. a 3-digit numeric input next to its label).

```jsx
<input className="w-full px-3 py-2 border rounded-lg sm:w-auto sm:min-w-[200px]" />
<select className="w-full text-sm px-3 py-2 border rounded-lg" />
```

This includes `<input>`, `<select>`, `<textarea>`, and any custom field components. Multi-field rows that wrap (search + filters) should use `flex flex-wrap gap-2` so each field grows to fill the line.

## Buttons

Two acceptable widths on mobile:

- **Primary actions: full width (`w-full`)** — the main next step (e.g. Save, Send Payment Link, Continue).
- **Secondary actions: 50/50 grid** — pair related secondary actions in a `grid grid-cols-2 gap-2`. If there's only one secondary action, it stays full-width.

```jsx
<button className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
  {t("primaryAction")}
</button>

<div className="grid grid-cols-2 gap-2">
  <button className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{t("secondaryA")}</button>
  <button className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">{t("secondaryB")}</button>
</div>
```

Avoid tiny inline icon-only buttons in mobile cards — promote them to either the primary slot or one cell of the 50/50 grid.

## Tables → accordion cards

Desktop tables become **vertically-stacked cards** on mobile, where each row collapses behind its identifying field (player name, team name, etc.) and expands on tap.

### Pattern

1. Render the existing `<table>` inside `<div className="hidden md:block overflow-x-auto">`.
2. Render a sibling `<div className="md:hidden space-y-2.5">` that maps the same rows into cards.
3. Track expansion state with `const [expandedCards, setExpandedCards] = useState(new Set())` plus a `toggleExpanded(id)` helper.
4. Extract any per-row math (totals, derived flags) into a single helper used by both the desktop `tr` and the mobile card so they never drift.

### Card structure

```jsx
<div className="rounded-xl border border-gray-200 bg-white shadow-sm">
  {/* HEADER — checkbox is its own click target; tap the rest to toggle */}
  <div className="px-3 py-3 flex items-center gap-3">
    <label className="flex-shrink-0 inline-flex items-center justify-center cursor-pointer">
      <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} className="rounded" />
    </label>
    <button type="button" onClick={() => toggleExpanded(id)} aria-expanded={isOpen}
      className="flex-1 min-w-0 flex items-center gap-3 text-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium truncate text-gray-900">{title}</div>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700">{statusLabel}</span>
        </div>
        <div className="mt-0.5 text-xs text-gray-500">{summary}</div>
      </div>
      <svg className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  </div>

  {/* BODY — tabs + active tab content + Actions trigger */}
  {isOpen && (
    <div className="border-t border-gray-100 pt-3 px-3 pb-3 space-y-3">
      {/* Tab strip — full card width (negates the parent px-3), equal-width tabs, no scroll. */}
      <div role="tablist" className="-mx-3 flex w-[calc(100%+1.5rem)] border-b border-gray-100">
        {tabs.map((t) => (
          <button key={t.value} role="tab" aria-selected={t.value === activeTab}
            onClick={() => setTab(t.value)}
            className={`flex-1 min-w-0 truncate px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
              t.value === activeTab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === "invoice"    && <InvoiceTabContent /* row-level fields + numeric breakdown */ />}
      {activeTab === "playerCard" && <PlayerCardContent section="player"  /* desktop modal body, player section only */ />}
      {activeTab === "parents"    && <PlayerCardContent section="parents" /* desktop modal body, parents section only */ />}
      {activeTab === "comments"   && <ParticipantLogsContent initialLimit={2} /* show last 2 + "Show all" toggle */ />}

      <div className="pt-2 border-t border-gray-100">
        <button onClick={() => openActionsSheet(row)}>{tc("actions")}</button>
      </div>
    </div>
  )}
</div>
```

### Tabs inside the card body

When the row's expanded body contains more than one logical surface (numeric details, parents, comments, player card, …), split them into per-row tabs. Tab state is **per-row** (`{ [rowId]: tabValue }`) so each card remembers its own active tab independently. Apply these rules:

- **Inline custom strip, not the shared `Tabs` primitive.** The shared primitive's `pill` variant is `inline-flex` and its `underline` variant doesn't span full width — both overflow when there are 4+ tabs on a phone. Render the strip directly with `flex w-full` + `flex-1 min-w-0 truncate` per tab, and negate the body's horizontal padding (`-mx-3 w-[calc(100%+1.5rem)]`) so the strip extends edge-to-edge. Use a `border-b-2` underline for the active tab.
- **Keep tab labels to one short word** (Invoice / Parents / Comments / Player). Prefer `td("player")` over `td("playerCard")` — single words fit four-up on a 360px viewport without wrapping. Reach for an existing single-word i18n key before adding a new one.
- **Always-on info goes in the first tab.** That tab is the default for every row and should hold the numeric breakdown / inline editors that the user sees most often (e.g. team selector + cost breakdown for participants).
- **Reuse the desktop surfaces.** When the same content is reachable from a desktop drawer/modal, **extract its body into a named export** (`ParticipantLogsContent`, `PlayerCardContent`, …) so both surfaces render identical UI. The desktop component becomes a thin wrapper around that body. The mobile tab renders the same body with a no-op `onClose` so saves don't dismiss anything.
- **Split a multi-section body into one tab per section.** When a single desktop modal/drawer body actually contains two independent surfaces (e.g. `PlayerCardContent` shows player details *and* parents), expose a `section` prop on the extracted body (`"all" | "player" | "parents"`, default `"all"`) that gates each block. Mobile then renders one tab per section (`<PlayerCardContent section="player" />`, `<PlayerCardContent section="parents" />`); desktop keeps the default `"all"` so both blocks show in the modal. Lazy-fetch any shared dependency (e.g. the linked Player record) when **either** dependent tab opens, not just one of them.
- **Padding is the parent's job, not the content's.** Extracted content components (`PlayerCardContent`, …) must NOT include their own outer padding (`p-6`, `p-4`, …) — only `space-y-*`. The desktop modal wraps them in a `<div className="p-6">`; the mobile tab renders them inside the card's existing `px-3 pb-3 pt-3`. Including padding inside the content double-pads the mobile tab.
- **Clamp long lists with a "Show all" toggle.** Comments-style timelines accept an `initialLimit` prop (e.g. `initialLimit={2}` for mobile, `null` for the desktop drawer). The toggle uses `tc("showAll", { count })` / `tc("showLess")`.
- **Lazy-load the heavy bodies.** Use `next/dynamic` for content that ships its own subtree (player card editing, log timelines). Pair it with the existing dynamic import of the modal so Next dedupes the chunk.
- **Gate tabs on data availability.** Hide a tab when its API/data dependency isn't satisfied (e.g. Comments needs a real `orderId`, so it's hidden for `_isExpected` rows). The list of available tabs is derived per-row, not fixed.
- **Don't duplicate tab content in the Actions sheet.** Items that map 1:1 to a tab (Comment, View logs, Player Card) come out of the sheet — the tab IS the action. The sheet keeps actions that confirm, navigate, or trigger background work (Edit Invoice, Send Payment Link, Pay from Admin, Send Waivers Email, Send Message, …).

### Rules

- **Never nest `<button>` inside `<button>`.** Put the toggle on a `<button>` covering the title/summary area, and keep the row checkbox in a sibling `<label>`.
- **Header always shows the identifier + status + the most important number** (e.g. due, total). Everything else lives in the body.
- **Long numeric breakdowns** go in a `<dl>` with `flex items-center justify-between` rows — keys on the start side, values on the end side.
- **Preserve every desktop action.** Every entry from the desktop Actions dropdown must remain reachable from the mobile card — never drop an action because the card is collapsed by default or to keep the layout tidy. The reachable path is one of two:
  1. **A tab** — when the action's natural surface is a body of content the user reads/edits (Comment timeline, Player Card form). Putting it on its own tab makes it the destination, not a click-through.
  2. **The Actions bottom sheet** — for everything else (confirmations, navigation, background work like Send Payment Link / Edit Invoice / Pay from Admin / Send Message). The card has a single full-width `Actions` button that opens this sheet.
- **Sheet rules.** The sheet mirrors the desktop `▾` dropdown for the items it owns — same order, same per-row conditional checks (`due > 0`, `r.status !== "paid"`, `!registrationCompletedAt`, `waiverConsents.some(c => c.agreedAt)`, `hasAnyContact`, `!isExpected`, …). Items that have been promoted to tabs are excluded; everything else stays. Applicability gates visibility, not space.
  - **No promoted primary button on the card itself.** Even the contextual next-step (Send Payment Link / Send Registration Link / Edit Invoice) lives inside the sheet — the only button on the card is `Actions`. Inside the sheet you may visually emphasize the primary entry (e.g. blue text) but it stays in the list.
  - **Sheet structure**: a fixed full-viewport overlay, a tinted backdrop (`bg-black/40`) that dismisses on tap, a panel sliding up from the bottom with `rounded-t-2xl` and a small grab handle on top, action rows as `<button class="w-full text-start px-4 py-3 text-sm">`, and a final `Cancel` row separated by `border-t border-gray-100`. Wrap the action list in `max-h-[75vh] overflow-y-auto` so long lists scroll within the sheet. Render the sheet inside the same `md:hidden` block — desktop continues to use its inline `▾` dropdown.
- **Don't invent new actions on mobile.** The mobile card is a re-projection of the same row, not a different surface.

### Reference implementation

`src/features/activities/components/ParticipantsTab/index.jsx`:
- `MOBILE CARD LIST` — the accordion card skeleton (header, tab strip, per-tab body, single `Actions` trigger button).
- `MOBILE ACTIONS BOTTOM SHEET` — the picker; mirrors the desktop `▾` dropdown for the items it still owns (Edit Invoice, Send Payment Link, Pay from Admin, Send Waivers Email, Send Message, …) with matching per-row gating.

Shared content components (extracted bodies of desktop drawer/modal, used by both the desktop surface and the mobile card tab):
- `ParticipantLogsContent` from `src/components/ParticipantLogsDrawer.js` — comment editor + activity timeline.
- `PlayerCardContent` from `src/features/activities/components/PlayerCardModal/index.jsx` — player + parent editing.

Apply the same skeleton when porting other tables (teams, players, leads, transactions, requests).

## Self-maintenance

When you mobile-ify a new table or refactor the input/button conventions, update this rule with the new reference and any deviations the design demands.
