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
- **Change project structure** → update `project-overview.md` (Project Structure tree)
- **Add a new shared component** → update `project-overview.md` or create a `components.md` rule if the component layer grows

## How to Update

1. Make the code change first
2. Then update the relevant `.cursor/rules/*.md` file(s) with a concise description
3. If the change is significant (new subsystem, new integration), also update `AGENTS.md`

## Do NOT

- Add verbose explanations — keep rules concise and scannable
- Duplicate information across multiple rule files — reference other files instead
- Remove the existing content — append or edit in place
