import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectMain, getTenantConn } from "@/lib/mongodb";
import MigrationLog from "@/models/MigrationLog";
import { resolveClubIdByPublicKey } from "@/lib/public-lookup";

import { getPlayerModel } from "@/models/Player";
import { getParentModel } from "@/models/Parent";
import { getTeamModel } from "@/models/Team";
import { getActivityModel } from "@/models/Activity";
import { getOrderModel } from "@/models/Order";
import { getOrderLogModel } from "@/models/OrderLog";
import { getRegistrationModel } from "@/models/Registration";
import { getRegistrationRequestModel } from "@/models/RegistrationRequest";
import { getTransactionModel } from "@/models/Transaction";
import { getPaymentRequestModel } from "@/models/PaymentRequest";
import { getMessageModel } from "@/models/Message";
import { getLeadModel } from "@/models/Lead";
import { getLeadSubmissionModel } from "@/models/LeadSubmission";
import { getLeadLogModel } from "@/models/LeadLog";

// Build the full set of tenant models bound to a single connection.
function buildModels(conn) {
  return {
    Player: getPlayerModel(conn),
    Parent: getParentModel(conn),
    Team: getTeamModel(conn),
    Activity: getActivityModel(conn),
    Order: getOrderModel(conn),
    OrderLog: getOrderLogModel(conn),
    Registration: getRegistrationModel(conn),
    RegistrationRequest: getRegistrationRequestModel(conn),
    Transaction: getTransactionModel(conn),
    PaymentRequest: getPaymentRequestModel(conn),
    Message: getMessageModel(conn),
    Lead: getLeadModel(conn),
    LeadSubmission: getLeadSubmissionModel(conn),
    LeadLog: getLeadLogModel(conn),
  };
}

// Sentinel error thrown by tenant resolvers when a club has been soft-deleted
// (lifecycle status `deactivated`). Callers can `instanceof` check or look at
// `.code === "CLUB_DEACTIVATED"` to translate this into a 404 / silent ack.
export class ClubDeactivatedError extends Error {
  constructor(clubId) {
    super(`Club ${clubId} is deactivated`);
    this.name = "ClubDeactivatedError";
    this.code = "CLUB_DEACTIVATED";
    this.clubId = String(clubId);
  }
}

// Returns the tenant context for a known clubId — primary models, optional
// shadow models for dual-write during the `migrating` phase, and the current
// migration status.
//
// Throws `ClubDeactivatedError` if the club has been soft-deleted by the
// platform admin. Public callers should treat that as 404; Stripe webhook
// should ack 200 and skip writes.
//
// Use this from public/unauthenticated routes (Stripe webhook, register page,
// payment page, lead submission) once they've resolved a clubId via metadata
// or `PublicLookup`.
export async function getClubContextById(clubId, { allowDeactivated = false } = {}) {
  const tenant = await getTenantConn(clubId);
  if (!allowDeactivated && tenant.lifecycleStatus === "deactivated") {
    throw new ClubDeactivatedError(tenant.clubId);
  }
  return {
    clubId: tenant.clubId,
    status: tenant.status,
    lifecycleStatus: tenant.lifecycleStatus,
    dbName: tenant.dbName,
    primary: tenant.primary,
    shadow: tenant.shadow,
    models: buildModels(tenant.primary),
    shadowModels: tenant.shadow ? buildModels(tenant.shadow) : null,
  };
}

// Returns the tenant context for the currently active club of the requesting
// session. Use this from authenticated dashboard API routes.
//
// Returns `{ session, ctx }` on success or `{ error }` (a NextResponse) on
// missing session / no active membership.
export async function getClubContext() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { error: { status: 401, body: { error: "Unauthorized" } } };
  }
  const clubId = session.user.activeClubId || session.user.id;
  if (!clubId || session.user.role === "admin") {
    return { error: { status: 403, body: { error: "No active club" } } };
  }
  try {
    const ctx = await getClubContextById(clubId);
    return { session, ctx };
  } catch (err) {
    if (err?.code === "CLUB_DEACTIVATED") {
      return { error: { status: 403, body: { error: "Club is deactivated" } } };
    }
    throw err;
  }
}

// Resolve the tenant context for an unauthenticated public request via a
// globally unique key (activity id, payment token, registration token, lead
// slug). Returns `null` if the key is not registered in `PublicLookup`.
//
// Falls back to scanning the legacy main DB for activity/lead documents that
// pre-date PublicLookup population, so old links keep working until the
// backfill script has run on the cluster.
export async function resolvePublicContext(kind, key) {
  if (!kind || !key) return null;
  let clubId = await resolveClubIdByPublicKey(kind, key);

  if (!clubId) {
    // Backfill fallback: existing public links predate PublicLookup. Scan
    // the legacy main DB by natural key once. The next save on the doc will
    // populate PublicLookup automatically via the model post-save hooks.
    const main = await connectMain();
    try {
      if (kind === "activity") {
        const a = await main.collection("activities").findOne({ _id: toObjectId(key) }, { projection: { clubId: 1 } });
        clubId = a?.clubId || null;
      } else if (kind === "leadSlug") {
        const l = await main.collection("leads").findOne({ slug: String(key) }, { projection: { clubId: 1 } });
        clubId = l?.clubId || null;
      } else if (kind === "paymentToken") {
        const o = await main.collection("orders").findOne({ paymentToken: String(key) }, { projection: { clubId: 1 } });
        clubId = o?.clubId
          || (await main.collection("paymentrequests").findOne({ paymentToken: String(key) }, { projection: { clubId: 1 } }))?.clubId
          || null;
      } else if (kind === "registrationToken") {
        const o = await main.collection("orders").findOne({ registrationToken: String(key) }, { projection: { clubId: 1 } });
        clubId = o?.clubId || null;
      } else if (kind === "team") {
        const t = await main.collection("teams").findOne({ _id: toObjectId(key) }, { projection: { clubId: 1 } });
        clubId = t?.clubId || null;
      } else if (kind === "registration") {
        const r = await main.collection("registrations").findOne({ _id: toObjectId(key) }, { projection: { clubId: 1 } });
        clubId = r?.clubId || null;
      }
    } catch (err) {
      console.error("[resolvePublicContext] fallback scan failed:", err.message);
    }
  }

  if (!clubId) return null;
  try {
    return await getClubContextById(clubId);
  } catch (err) {
    if (err?.code === "CLUB_DEACTIVATED") return null;
    throw err;
  }
}

function toObjectId(v) {
  try { return new mongoose.Types.ObjectId(String(v)); } catch (_) { return v; }
}

async function logShadowError(ctx, err, detail = {}) {
  try {
    await MigrationLog.create({
      clubId: ctx.clubId,
      phase: "shadow_write_error",
      level: "error",
      message: err?.message || "Shadow write failed",
      detail: { ...detail, stack: err?.stack },
    });
  } catch (_) { /* best-effort */ }
}

// Use for query-based mutations (`updateOne`, `updateMany`, `findOneAndUpdate`,
// `deleteOne`, `deleteMany`, `findOneAndDelete`, `replaceOne`, etc.) where the
// SAME query+update can be safely replayed against the shadow connection.
//
//   await dualWrite(ctx, (M) => M.Player.updateOne({ _id }, { $set: { ... } }))
//
// Do NOT use this for `create()` or `insertMany()` — those auto-generate
// different `_id`s per connection. Use `dualCreate` / `dualInsertMany` instead.
export async function dualWrite(ctx, op) {
  const result = await op(ctx.models);
  if (ctx.shadowModels) {
    try {
      await op(ctx.shadowModels);
    } catch (err) {
      await logShadowError(ctx, err);
    }
  }
  return result;
}

// Insert one document on primary, then mirror to shadow with the SAME `_id`.
// Pre-allocates an `_id` if the caller didn't supply one so both writes refer
// to the same logical row.
export async function dualCreate(ctx, modelKey, data) {
  const payload = { ...data };
  if (!payload._id) payload._id = new mongoose.Types.ObjectId();
  const doc = await ctx.models[modelKey].create(payload);
  if (ctx.shadowModels) {
    try {
      await ctx.shadowModels[modelKey].create(payload);
    } catch (err) {
      await logShadowError(ctx, err, { modelKey, op: "create", _id: String(payload._id) });
    }
  }
  return doc;
}

// Bulk insert variant of `dualCreate`. Returns the primary insertMany result.
export async function dualInsertMany(ctx, modelKey, docs) {
  const payload = docs.map((d) => ({ ...d, _id: d._id || new mongoose.Types.ObjectId() }));
  const result = await ctx.models[modelKey].insertMany(payload);
  if (ctx.shadowModels) {
    try {
      await ctx.shadowModels[modelKey].insertMany(payload);
    } catch (err) {
      await logShadowError(ctx, err, { modelKey, op: "insertMany", count: payload.length });
    }
  }
  return result;
}

// `await dualUpsertById(ctx, modelKey, doc)` — given a Mongoose doc returned
// from a primary-side `findOneAndUpdate({ upsert: true })`, mirror its full
// post-write state to the shadow connection via `replaceOne` keyed by the
// primary `_id` (so both DBs end up with the same identity).
export async function dualUpsertById(ctx, modelKey, doc) {
  if (!ctx.shadowModels || !doc) return doc;
  try {
    const data = typeof doc.toObject === "function"
      ? doc.toObject({ depopulate: true, virtuals: false })
      : doc;
    await ctx.shadowModels[modelKey].replaceOne(
      { _id: doc._id },
      data,
      { upsert: true },
    );
  } catch (err) {
    await logShadowError(ctx, err, { modelKey, op: "upsertById", _id: String(doc._id) });
  }
  return doc;
}

// `await dualSave(ctx, mongooseDoc)` — saves the loaded Mongoose document on
// the primary connection (its native db) and mirrors the post-save state to
// the shadow connection via `replaceOne` keyed by `_id`. Use this whenever a
// route does `doc = await ctx.models.X.findOne(...); doc.foo = bar; doc.save()`.
export async function dualSave(ctx, doc) {
  const result = await doc.save();
  if (ctx.shadowModels) {
    const modelName = doc.constructor?.modelName;
    if (modelName && ctx.shadowModels[modelName]) {
      try {
        const data = doc.toObject({ depopulate: true, virtuals: false });
        await ctx.shadowModels[modelName].replaceOne(
          { _id: doc._id },
          data,
          { upsert: true },
        );
      } catch (err) {
        await logShadowError(ctx, err, { modelKey: modelName, op: "save", _id: String(doc._id) });
      }
    }
  }
  return result;
}
