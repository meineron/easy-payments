<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EasyCoach Payments

Sports-club payment & registration platform built with Next.js 16 (App Router), React 19, Mongoose 9, NextAuth 4, Stripe, Nodemailer, next-intl 4, Tailwind CSS v4.

## Quick Reference

- **Path alias**: `@/` → `src/`
- **DB**: Always `await dbConnect()` from `@/lib/mongodb` before any Mongoose call
- **Auth**: `getServerSession(authOptions)` from `@/lib/auth` — roles: `admin`, `club`
- **i18n**: `en` + `he` (RTL) in `src/messages/` — always update both files
- **Models**: `src/models/` — all use hot-reload guard (`delete mongoose.models.X`)
- **Money**: All amounts in **cents** (integers)
- **Stripe**: Platform key (`lib/stripe.js`) + per-club direct keys (`lib/get-club-stripe.js`)
- **Email**: `lib/email.js` — Nodemailer SMTP, inline HTML templates, `{placeholder}` replacement from i18n

## Detailed conventions live in `.cursor/rules/`

Read the relevant rule file before working on that area:
- `project-overview.md` — full stack overview (always loaded)
- `api-routes.md` — API route handler patterns
- `dashboard-pages.md` — dashboard UI conventions
- `i18n.md` — internationalization rules
- `models.md` — Mongoose schema patterns
- `self-maintenance.md` — keep rules up to date when code changes

## Token Usage

After every response, provide a rough estimate of context size (small/medium/large) based on how many files were read and how long the conversation is.
