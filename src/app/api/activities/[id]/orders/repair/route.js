import { NextResponse } from "next/server";
import { getClubContext, dualCreate, dualSave, dualWrite } from "@/lib/club-context";
import { syncOrderItemsWithSubscription, computeOrderTotalCents, isOrderSyncEligible } from "@/lib/order-sync";
import { toDobString } from "@/lib/dob";

async function findOrCreateParent(ctx, firstName, lastName, email, phone, phonePrefix) {
  if (!firstName || !lastName || !email) return null;
  const { Parent } = ctx.models;
  let parent = await Parent.findOne({ clubId: ctx.clubId, email: email.trim().toLowerCase() });
  if (parent) return parent;
  parent = await dualCreate(ctx, "Parent", {
    clubId: ctx.clubId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    phonePrefix: phonePrefix || "+1",
    phone: (phone || "").trim() || "0000000000",
  });
  return parent;
}

export async function POST(request, { params }) {
  try {
    const { ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { Activity, Order, Player, Team } = ctx.models;

    const { id } = await params;

    const activity = await Activity.findOne({ _id: id, clubId: ctx.clubId }).lean();
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const subscriptions = activity.subscriptions || [];

    const orders = await Order.find({
      activityId: id,
      clubId: ctx.clubId,
    });

    let repaired = 0;
    let playersCreated = 0;

    for (const order of orders) {
      let changed = false;

      if (isOrderSyncEligible(order)) {
        const sub = subscriptions.find((s) => String(s._id) === String(order.subscriptionId));
        if (sub) {
          if (!order.subscriptionPriceCents && sub.priceCents) {
            order.subscriptionPriceCents = sub.priceCents;
            order.subscriptionTitle = sub.title;
            changed = true;
          }
          const { changed: itemsChanged, items } = syncOrderItemsWithSubscription(order, sub);
          if (itemsChanged) {
            order.items = items;
            changed = true;
          }
          if (changed) {
            order.totalCostCents = computeOrderTotalCents(order);
          }
        }
      }

      if (!order.playerId && order.playerFirstName && order.playerLastName) {
        try {
          const playerQuery = {
            clubId: ctx.clubId,
            firstName: order.playerFirstName.trim(),
            lastName: order.playerLastName.trim(),
          };
          playerQuery.dateOfBirth = toDobString(order.playerDob);

          let player = await Player.findOne(playerQuery).collation({ locale: "en", strength: 2 });

          if (!player) {
            const teamEntries = [];
            if (order.teamId) {
              const teamDoc = await Team.findById(order.teamId).lean();
              if (teamDoc) teamEntries.push({ teamId: order.teamId, season: teamDoc.season || "" });
            }
            player = await dualCreate(ctx, "Player", {
              clubId: ctx.clubId,
              firstName: order.playerFirstName.trim(),
              lastName: order.playerLastName.trim(),
              dateOfBirth: toDobString(order.playerDob),
              gender: order.playerGender || "",
              phonePrefix: order.playerPhonePrefix || "+1",
              phoneNumber: (order.playerPhone || "").trim(),
              email: (order.playerEmail || "").trim().toLowerCase(),
              teams: teamEntries,
              registrationTeamId: order.teamId || null,
              parents: [],
            });
            playersCreated++;
          }

          const parentIds = [];
          const p1 = await findOrCreateParent(ctx, order.parent1FirstName, order.parent1LastName, order.parent1Email, order.parent1Phone, order.parent1PhonePrefix);
          if (p1) parentIds.push(p1._id);
          const p2 = await findOrCreateParent(ctx, order.parent2FirstName, order.parent2LastName, order.parent2Email, order.parent2Phone, order.parent2PhonePrefix);
          if (p2) parentIds.push(p2._id);

          if (parentIds.length > 0) {
            const existing = (player.parents || []).map((p) => String(p));
            const newIds = parentIds.filter((pid) => !existing.includes(String(pid)));
            if (newIds.length > 0) {
              await dualWrite(ctx, (M) => M.Player.updateOne({ _id: player._id }, { $addToSet: { parents: { $each: newIds } } }));
              await dualWrite(ctx, (M) => M.Parent.updateMany({ _id: { $in: newIds } }, { $addToSet: { players: player._id } }));
            }
          }

          order.playerId = player._id;
          changed = true;
        } catch (e) {
          console.error(`Repair player for order ${order._id}:`, e);
        }
      }

      if (changed) {
        await dualSave(ctx, order);
        repaired++;
      }
    }

    return NextResponse.json({ success: true, repaired, playersCreated, total: orders.length });
  } catch (error) {
    console.error("Repair orders error:", error);
    return NextResponse.json({ error: "Failed to repair orders" }, { status: 500 });
  }
}
