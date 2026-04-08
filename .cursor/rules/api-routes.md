---
description: Conventions for writing Next.js API route handlers
globs:
  - src/app/api/**
---

# API Route Conventions

## Required Pattern

Every API route handler must follow this structure:

```js
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    // ... business logic ...
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Descriptive error:", error);
    return NextResponse.json({ error: "User-facing message" }, { status: 500 });
  }
}
```

## Rules

1. **Always `await dbConnect()`** before any Mongoose operation
2. **Always check session** with `getServerSession(authOptions)` — check `session.user.role` for authorization
3. **Return `NextResponse.json()`** with appropriate HTTP status codes
4. **Wrap in try/catch** — log with `console.error()`, return generic error to client
5. **Dynamic params** come from the second argument: `{ params }` — e.g., `const { id } = await params`
6. **Parse body** with `await request.json()` for POST/PATCH/PUT
7. **Use `@/` path alias** for all imports

## Auth Patterns

- Public routes (payment, register): no session check needed
- Club routes: `session.user.role !== "club"` → 401
- Admin routes: `session.user.role !== "admin"` → 401 (also guarded by middleware)
- Club-owned resources: always filter by `clubId: session.user.id`

## Stripe Routes

- Platform Stripe: `import { stripe } from "@/lib/stripe"`
- Club direct Stripe: `import { getClubStripe } from "@/lib/get-club-stripe"`
- Webhook: verify signature with `stripe.webhooks.constructEvent()`

## Response Conventions

- Success: `{ data }` or `{ modelName }` (e.g., `{ activity }`, `{ orders }`)
- Error: `{ error: "message" }` with status 400/401/404/500
- Created: status 201
