---
description: Backend services-layer pattern — keep API route handlers thin
globs:
  - src/app/api/**
  - src/lib/**
alwaysApply: false
---

# Backend Services Layer

This rule extends `.cursor/rules/api-routes.md` with the services-layer pattern. Existing routes have not been refactored to it yet — apply when **adding new routes or substantially editing an existing one**.

## Route handler responsibility (thin)

A route handler in `src/app/api/.../route.js` does five things, in order:

1. `const session = await getServerSession(authOptions)` and reject if missing/wrong role.
2. Resolve the tenant (`getClubContext` / per-club db connection — see `.cursor/rules/multi-tenant.md`).
3. Parse and validate the request (params, query, body).
4. Call into a **service function** in `src/lib/services/<domain>.js`.
5. Return `NextResponse.json(result)` (or an error response).

No business logic — no DB queries, no Stripe calls, no email sends — directly inside the handler.

## Service layer

Business logic lives in `src/lib/services/<domain>.js`. One file per domain (orders, payments, registrations, leads, …). Services:

- Take plain inputs (ids, parsed body) and the tenant connection — never the `Request` object.
- Are async functions that return plain data or throw typed errors.
- Are testable in isolation (no Next.js types).
- May call into other services or `lib/` utilities, never into route handlers.

Example shape:

```js
// src/lib/services/orders.js
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";

export async function listOrders({ clubDb, activityId }) {
  await dbConnect();
  return Order.find({ activity: activityId }).lean();
}

export async function bulkAction({ clubDb, activityId, ids, action }) {
  // validate, mutate, return summary
}
```

```js
// src/app/api/activities/[id]/orders/route.js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveClubContext } from "@/lib/club-context";
import { listOrders } from "@/lib/services/orders";

export async function GET(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "club") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { clubDb } = await resolveClubContext(session);
  const { id } = await params;
  const orders = await listOrders({ clubDb, activityId: id });
  return NextResponse.json({ orders });
}
```

## What stays in `lib/` (vs `lib/services/`)

- `lib/` — pure framework / infrastructure utilities: `mongodb.js`, `auth.js`, `email.js`, `stripe.js`, `pdf.js`, `i18n.js`. No domain logic.
- `lib/services/` — domain operations that may compose multiple `lib/` utilities and Mongoose models.

## What stays in API routes

- HTTP-shaped concerns: status codes, headers, redirects, streaming, file uploads, webhook signature verification.
- Auth/role gating.
- Schema parsing of `Request` body / query / params.

## Errors

Throw typed errors from services and let the route translate. A minimal pattern:

```js
export class ServiceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
```

```js
try {
  const result = await doIt(...);
  return NextResponse.json(result);
} catch (e) {
  if (e instanceof ServiceError) {
    const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: e.code, message: e.message }, { status });
  }
  throw e;
}
```

## Migration policy

- New routes: services-layer required.
- Routes you substantially edit: pull the body into a service function while you're there.
- Routes untouched: leave alone for now.

## Self-maintenance

When you add a new domain service, update this file with a one-line entry under "Existing services" once that section grows.
