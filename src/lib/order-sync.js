/**
 * Keep an unpaid Order's items aligned with its Activity subscription.
 *
 * Rules (match the UX the club owner expects):
 *  - Runs only when the order has no real payment yet (paidCents === 0, status !== "paid"/"refunded").
 *  - Items with `isManual: true` are untouched — they represent manual additions or price edits
 *    the club made on the invoice and must never be overwritten.
 *  - Items whose name appears in `order.dismissedSubItemNames` are NEVER re-added by the sync —
 *    that's how an admin permanently removes a template-sourced line from a specific order.
 *  - All other items are regenerated from the subscription's currently-active (non-expired) items.
 *  - If the subscription gains a new item (e.g. a discount row) after the order was created,
 *    it appears on the order automatically (unless its name was dismissed on this order).
 *  - If the subscription removes an item, it disappears from the order (again, only for non-manual rows).
 *
 * Returns { changed, items } so callers can decide whether to persist.
 */
function normalizeItem(item) {
  return {
    name: item?.name || "",
    priceCents: Number(item?.priceCents || 0),
    quantity: Number(item?.quantity || 1),
    isDiscount: !!item?.isDiscount,
    isManual: !!item?.isManual,
  };
}

function serialize(items) {
  return JSON.stringify((items || []).map(normalizeItem));
}

export function isOrderSyncEligible(order) {
  if (!order) return false;
  if ((order.paidCents || 0) > 0) return false;
  if (order.status === "paid" || order.status === "refunded") return false;
  return true;
}

export function syncOrderItemsWithSubscription(order, subscription) {
  const currentItems = (order?.items || []).map(normalizeItem);

  if (!isOrderSyncEligible(order) || !subscription) {
    return { changed: false, items: currentItems };
  }

  const now = new Date();
  const activeSubItems = (subscription.items || []).filter((item) =>
    !item.expiresAt || new Date(item.expiresAt) >= now,
  );

  // Preserve every manual row exactly as-is.
  const manualItems = currentItems.filter((i) => i.isManual);
  const manualNames = new Set(manualItems.map((i) => i.name));
  // Admin-dismissed template lines never come back.
  const dismissedNames = new Set((order?.dismissedSubItemNames || []).map((n) => String(n)));

  // Replace all non-manual rows with the live subscription items, skipping any name
  // that collides with a manual override (manual always wins) or that the admin
  // has explicitly removed from this order.
  const syncedSubItems = activeSubItems
    .filter((item) => !manualNames.has(item.name) && !dismissedNames.has(item.name))
    .map((item) => ({
      name: item.name,
      priceCents: Number(item.priceCents || 0),
      quantity: Number(item.quantity || 1),
      isDiscount: !!item.isDiscount,
      isManual: false,
    }));

  const nextItems = [...syncedSubItems, ...manualItems];
  const changed = serialize(currentItems) !== serialize(nextItems);

  return { changed, items: nextItems };
}

/**
 * Diff a previous items list against an admin-submitted items list, and return
 * the set of subscription-template item names that were removed by the admin.
 * Callers should merge this into `order.dismissedSubItemNames` so the sync
 * knows not to re-add them.
 *
 * Only template rows (isManual !== true) count — removing a manual row just
 * means the admin deleted their own manual entry and isn't a "dismissal".
 */
export function computeDismissedSubItemNames(previousItems, nextItems, subscription) {
  const prev = (previousItems || []).map(normalizeItem);
  const next = (nextItems || []).map(normalizeItem);

  const now = new Date();
  const templateNames = new Set(
    (subscription?.items || [])
      .filter((i) => !i.expiresAt || new Date(i.expiresAt) >= now)
      .map((i) => i.name),
  );

  const nextNames = new Set(next.map((i) => i.name));
  const dismissed = [];
  for (const item of prev) {
    if (item.isManual) continue;
    if (!templateNames.has(item.name)) continue;
    if (nextNames.has(item.name)) continue;
    dismissed.push(item.name);
  }
  return dismissed;
}

/**
 * Stamp a registration date onto the Player's team entry so downstream
 * tooling (rosters, reports) knows when the participant actually registered.
 *
 * - Creates the team entry if it doesn't exist yet.
 * - Keeps the earliest registrationDate if already set (never overwrites).
 */
export async function markPlayerRegisteredForTeam(ctxOrPlayerId, teamId, date = new Date()) {
  // Back-compat: legacy callers passed (playerId, teamId, date). New callers
  // pass (ctx, playerId, teamId, date) — when the first arg looks like a tenant
  // context object, shift positional args.
  let ctx = null;
  let playerId = ctxOrPlayerId;
  let realDate = date;
  if (ctxOrPlayerId && typeof ctxOrPlayerId === "object" && ctxOrPlayerId.models) {
    ctx = ctxOrPlayerId;
    playerId = teamId;
    teamId = arguments[2];
    realDate = arguments[3] || new Date();
  }

  if (!playerId || !teamId) return;

  let player;
  let teamDoc;
  if (ctx) {
    player = await ctx.models.Player.findById(playerId);
    if (!player) return;
    teamDoc = await ctx.models.Team.findById(teamId).lean();
  } else {
    const Player = (await import("@/models/Player")).default;
    player = await Player.findById(playerId);
    if (!player) return;
    const Team = (await import("@/models/Team")).default;
    teamDoc = await Team.findById(teamId).lean();
  }

  const existing = (player.teams || []).find((t) => String(t.teamId) === String(teamId));
  if (existing) {
    if (!existing.registrationDate) {
      existing.registrationDate = realDate;
      if (ctx) {
        const { dualSave } = await import("@/lib/club-context");
        await dualSave(ctx, player);
      } else {
        await player.save();
      }
    }
    return;
  }

  player.teams.push({
    teamId,
    season: teamDoc?.season || "",
    registrationDate: realDate,
  });
  if (ctx) {
    const { dualSave } = await import("@/lib/club-context");
    await dualSave(ctx, player);
  } else {
    await player.save();
  }
}

/**
 * Recompute an order's totalCostCents from the invoice breakdown
 * (subscription price + items + order-level discount + coupon).
 */
export function computeOrderTotalCents(order) {
  let total = order?.subscriptionPriceCents || 0;
  (order?.items || []).forEach((item) => {
    const amt = (item.priceCents || 0) * (item.quantity || 1);
    if (item.isDiscount) total -= amt; else total += amt;
  });
  if (order?.discountType === "amount") total -= order.discountValue || 0;
  else if (order?.discountType === "percentage") total -= Math.round(total * (order.discountValue || 0) / 100);
  total -= order?.couponDiscountCents || 0;
  return Math.max(0, total);
}
