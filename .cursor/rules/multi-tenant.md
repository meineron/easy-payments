---
description: Multi-tenant architecture, per-club databases, and the staged migration playbook
globs: src/lib/mongodb.js, src/lib/club-context.js, src/lib/public-lookup.js, src/models/**, src/app/api/**, scripts/**
alwaysApply: false
---

# Multi-tenant architecture

EasyCoach Payments is moving from a single shared database (with `clubId` filters) to a **database per club**. This rule captures the model and the migration playbook so changes stay consistent during the transition.

## Layout

- **Main DB** (`MONGODB_URI`'s default db): houses cross-tenant data only — `Club`, `User`, `Membership`, `Exercise`, `PublicLookup`, `MigrationLog`.
- **Tenant DB** (`club_<_id>`, one per club): houses everything that belongs to one club — `Player`, `Parent`, `Team`, `Activity`, `Order`, `OrderLog`, `Registration`, `RegistrationRequest`, `Transaction`, `PaymentRequest`, `Message`, `Lead`, `LeadSubmission`, `LeadLog`.
- **Migration switch** lives on `Club.migrationStatus` (`legacy` → `migrating` → `migrated`).

## Connection routing

Always go through `getTenantConn(clubId)` (or one of the helpers in `src/lib/club-context.js`) for tenant data — never call `dbConnect()` and use a default model export inside a route that runs after a club starts migrating.

```js
// Authenticated dashboard routes
const { session, ctx, error } = await getClubContext();
if (error) return NextResponse.json(error.body, { status: error.status });
const player = await dualWrite(ctx, (M) => M.Player.create({ ... }));

// Public routes (Stripe webhook, /register, /payment, /lead)
const ctx = await resolvePublicContext("paymentToken", token);
if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
const order = await ctx.models.Order.findOne({ paymentToken: token });
```

Invariants:

- `ctx.primary` is the source of truth — read from it, write to it.
- `ctx.shadow` is non-null only while `migrationStatus === "migrating"`. All writes that go through `dualWrite()` are mirrored to it.
- `ctx.status === "migrated"` ⇒ the main DB no longer receives writes for this club. Any remaining direct-import write would silently corrupt data.

## Public lookup

`PublicLookup` is the only way unauthenticated routes can find the right tenant DB. It maps a globally-unique key to a `clubId`:

| kind                | key                            |
|---------------------|--------------------------------|
| `activity`          | `Activity._id` as string        |
| `paymentToken`      | `Order.paymentToken` / `PaymentRequest.paymentToken` |
| `registrationToken` | `Order.registrationToken`       |
| `leadSlug`          | `Lead.slug`                     |

Writes are populated three ways and you must keep all three working when extending the system:

1. Explicit calls to `recordPublicLookup(...)` in route handlers (e.g. activity / lead creation).
2. Mongoose `post("save")` and `post("findOneAndUpdate")` hooks on `Order` and `PaymentRequest` (covers token rotations).
3. The one-time backfill script `scripts/backfill-public-lookup.js`.

## Migration playbook (per club)

Always refactor every route that writes a club's tenant collections to use `getClubContext()` / `dualWrite()` before that club leaves `legacy`. A `migrated` club whose routes still use direct model imports will silently write to the main DB.

```bash
# 0. Pre-flight
node scripts/backfill-public-lookup.js                          # once per cluster
# (re)deploy after refactoring all writes for this club's surface.

# 1. Flag → start dual-writes
node scripts/migrate-club-to-tenant-db.js --club <id> --phase flag

# 2. Bulk copy main → tenant (idempotent, can be re-run)
node scripts/migrate-club-to-tenant-db.js --club <id> --phase copy

# 3. Open a brief maintenance window for THIS club only (5–10 min):
node scripts/migrate-club-to-tenant-db.js --club <id> --phase copy     # delta catch-up
node scripts/migrate-club-to-tenant-db.js --club <id> --phase verify   # counts must match

# 4. Flip → reads/writes go to tenant DB
node scripts/migrate-club-to-tenant-db.js --club <id> --phase flip

# 5. After a soak period, drop the legacy rows from the main DB:
node scripts/cleanup-migrated-club.js --club <id>          # dry run
node scripts/cleanup-migrated-club.js --club <id> --apply  # delete
```

### Canary: rename instead of delete

Before running the irreversible cleanup, you can rename the legacy tenant
collections in the main DB to `<name>_x` to confirm nothing is still reading
them. Refuses to run unless every Club is `migrated`, and `--undo` restores.

```bash
node scripts/rename-legacy-collections.js                # dry run
node scripts/rename-legacy-collections.js --apply        # rename to *_x
node scripts/rename-legacy-collections.js --undo --apply # restore
```

Rollback escape hatch: at any point before cleanup, `--phase rollback` returns the club to `legacy`. Tenant DB rows are left in place (harmless) and reads/writes go back to the main DB.

## Auth & sessions

- `session.user.userId` → global `User._id`.
- `session.user.id` → currently active `Membership.clubId` (kept named `id` for legacy API compatibility).
- `session.user.activeClubId` → same as `id`, more explicit; prefer this in new code.
- `session.user.role` → `"club"` for any active member, `"admin"` for platform admins.
- `session.user.membershipRole` → club-scoped role for fine-grained permissions.
- Switching clubs goes through `POST /api/auth/switch-club` and re-issues the JWT.

## Adding a new tenant model

1. Define the schema with a factory export:
   ```js
   export function getThingModel(conn) {
     return conn.models.Thing || conn.model("Thing", ThingSchema);
   }
   if (mongoose.models.Thing) delete mongoose.models.Thing;
   export default mongoose.model("Thing", ThingSchema);
   ```
2. Register it in `buildModels()` in `src/lib/club-context.js`.
3. Add the collection name to `TENANT_COLLECTIONS` in `scripts/migrate-club-to-tenant-db.js` and `scripts/cleanup-migrated-club.js`.
4. If it has a publicly-addressable identifier, extend `PublicLookup.kind` enum and either add a `post("save")` hook or call `recordPublicLookup(...)` from the route that creates it.

## Self-maintenance

When you add or rename collections, when you change the `migrationStatus` state machine, or when you add a new public-facing identifier, update this rule plus the relevant scripts in `scripts/` so the migration playbook stays accurate.
