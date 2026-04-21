import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Player from "@/models/Player";
import Parent from "@/models/Parent";
import { syncOrderItemsWithSubscription, computeOrderTotalCents, isOrderSyncEligible } from "@/lib/order-sync";
import { toDobString } from "@/lib/dob";

async function findOrCreateParent(clubId, firstName, lastName, email, phone, phonePrefix) {
  if (!firstName || !lastName || !email) return null;
  let parent = await Parent.findOne({ clubId, email: email.trim().toLowerCase() });
  if (parent) return parent;
  parent = await Parent.create({
    clubId,
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
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await dbConnect();

    const activity = await Activity.findOne({ _id: id, clubId: session.user.id }).lean();
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const subscriptions = activity.subscriptions || [];

    const orders = await Order.find({
      activityId: id,
      clubId: session.user.id,
    });

    let repaired = 0;
    let playersCreated = 0;

    for (const order of orders) {
      let changed = false;

      // Resync subscription items/discounts into the invoice while preserving manual rows.
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

      // Repair missing playerId — create Player/Parent documents
      if (!order.playerId && order.playerFirstName && order.playerLastName) {
        try {
          const playerQuery = {
            clubId: session.user.id,
            firstName: order.playerFirstName.trim(),
            lastName: order.playerLastName.trim(),
          };
          playerQuery.dateOfBirth = toDobString(order.playerDob);

          let player = await Player.findOne(playerQuery).collation({ locale: "en", strength: 2 });

          if (!player) {
            const teamEntries = [];
            if (order.teamId) {
              const Team = (await import("@/models/Team")).default;
              const teamDoc = await Team.findById(order.teamId).lean();
              if (teamDoc) teamEntries.push({ teamId: order.teamId, season: teamDoc.season || "" });
            }
            player = await Player.create({
              clubId: session.user.id,
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
          const p1 = await findOrCreateParent(session.user.id, order.parent1FirstName, order.parent1LastName, order.parent1Email, order.parent1Phone, order.parent1PhonePrefix);
          if (p1) parentIds.push(p1._id);
          const p2 = await findOrCreateParent(session.user.id, order.parent2FirstName, order.parent2LastName, order.parent2Email, order.parent2Phone, order.parent2PhonePrefix);
          if (p2) parentIds.push(p2._id);

          if (parentIds.length > 0) {
            const existing = player.parents.map((p) => String(p));
            const newIds = parentIds.filter((pid) => !existing.includes(String(pid)));
            if (newIds.length > 0) {
              await Player.updateOne({ _id: player._id }, { $addToSet: { parents: { $each: newIds } } });
              await Parent.updateMany({ _id: { $in: newIds } }, { $addToSet: { players: player._id } });
            }
          }

          order.playerId = player._id;
          changed = true;
        } catch (e) {
          console.error(`Repair player for order ${order._id}:`, e);
        }
      }

      if (changed) {
        await order.save();
        repaired++;
      }
    }

    return NextResponse.json({ success: true, repaired, playersCreated, total: orders.length });
  } catch (error) {
    console.error("Repair orders error:", error);
    return NextResponse.json({ error: "Failed to repair orders" }, { status: 500 });
  }
}
