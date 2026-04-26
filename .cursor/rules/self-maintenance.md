---
description: Keep project rules and documentation up to date when making changes
globs:
alwaysApply: true
---

# Self-Maintenance Rule

When you make changes to the codebase, **update the relevant rule files** in `.cursor/rules/` and `AGENTS.md` to reflect those changes. This prevents future chats from needing to re-explore the codebase.

## When to Update

Update rules when you:

- **Add a new model** → update `models.md` (add to the table, document key fields)
- **Add a new API route pattern** → update `api-routes.md` if the pattern differs
- **Add a new dashboard page/section** → update `dashboard-pages.md`
- **Add or change i18n namespaces** → update `i18n.md`
- **Add a new lib module** → update `project-overview.md` (Key Lib Modules table)
- **Add a new dependency** → update `project-overview.md` (Tech Stack table)
- **Change auth roles or session fields** → update `project-overview.md`
- **Add environment variables** → update `project-overview.md` (Environment Variables list)
- **Change project structure** → update `project-overview.md` and `frontend-architecture.md`
- **Add a new shared primitive** → update `shared-components.md`
- **Add a new feature folder** → update `frontend-architecture.md`
- **Add a new RTK Query tag type or slice** → update `state-management.md`
- **Add a new design-token category** → update `styling.md`
- **Add a new domain service in `lib/services/`** → update `backend-services.md`
- **Add a new heavy component or lazy-loading pattern** → update `performance.md`
- **Add a page-local component (`src/app/<route>/_components/`)** → no rule update needed. Only update `frontend-architecture.md` when you change the convention itself, or when you promote a component from `_components/` to `features/`/`shared/`.

## How to Update

1. Make the code change first
2. Then update the relevant `.cursor/rules/*.md` file(s) with a concise description
3. If the change is significant (new subsystem, new integration), also update `AGENTS.md`

## Do NOT

- Add verbose explanations — keep rules concise and scannable
- Duplicate information across multiple rule files — reference other files instead
- Remove the existing content — append or edit in place
