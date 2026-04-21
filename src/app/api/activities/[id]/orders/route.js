import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import OrderLog from "@/models/OrderLog";
import Activity from "@/models/Activity";
import Player from "@/models/Player";
import Parent from "@/models/Parent";
import { syncOrderItemsWithSubscription, computeOrderTotalCents, isOrderSyncEligible } from "@/lib/order-sync";
import { toDobString } from "@/lib/dob";

export async function GET(request, { params }) {
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

    // Keep every unpaid order's invoice in sync with its subscription — the club never has
    // to click "repair" to get discounts/items that were added to the subscription later.
    const syncCandidates = await Order.find({
      activityId: id,
      clubId: session.user.id,
      paidCents: { $lte: 0 },
      status: { $nin: ["paid", "refunded"] },
    });
    const bulkOps = [];
    for (const doc of syncCandidates) {
      if (!isOrderSyncEligible(doc)) continue;
      const sub = (activity.subscriptions || []).find((s) => String(s._id) === String(doc.subscriptionId));
      if (!sub) continue;
      const { changed, items } = syncOrderItemsWithSubscription(doc, sub);
      if (!changed) continue;
      const snapshot = { ...doc.toObject(), items };
      const totalCostCents = computeOrderTotalCents(snapshot);
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { items, totalCostCents } },
        },
      });
    }
    if (bulkOps.length > 0) {
      await Order.bulkWrite(bulkOps);
    }

    const orders = await Order.find({ activityId: id, clubId: session.user.id })
      .populate("teamId", "name season gender")
      .sort({ createdAt: -1 })
      .lean();

    const teamIds = (activity?.teams || []).map((t) => t.teamId);
    let expectedPlayers = [];

    if (teamIds.length > 0) {
      const players = await Player.find({
        clubId: session.user.id,
        "teams.teamId": { $in: teamIds },
      })
        .populate("parents", "firstName lastName phone email")
        .lean();

      const orderPlayerKeys = new Set();
      orders.forEach((o) => {
        if (o.playerId) orderPlayerKeys.add(String(o.playerId));
        orderPlayerKeys.add(
          `${(o.playerFirstName || "").toLowerCase().trim()}|${(o.playerLastName || "").toLowerCase().trim()}|${o.teamId?._id || o.teamId || ""}`
        );
      });

      const subscriptions = activity?.subscriptions || [];
      const now = new Date();
      const teamSubMap = {};
      for (const tid of teamIds) {
        const tidStr = String(tid);
        const matching = subscriptions.filter((s) =>
          (s.includedTeamIds || []).some((id) => String(id) === tidStr)
        );
        if (matching.length === 1) {
          const sub = matching[0];
          const activeItems = (sub.items || []).filter((item) =>
            !item.expiresAt || new Date(item.expiresAt) >= now
          );
          let itemTotal = 0;
          activeItems.forEach((item) => {
            const amt = (item.priceCents || 0) * (item.quantity || 1);
            itemTotal += item.isDiscount ? -amt : amt;
          });
          teamSubMap[tidStr] = {
            subscriptionId: String(sub._id),
            subscriptionTitle: sub.title,
            subscriptionPriceCents: sub.priceCents || 0,
            items: activeItems.map((item) => ({
              name: item.name,
              priceCents: item.priceCents,
              quantity: item.quantity,
              isRequired: item.isRequired,
              isDiscount: item.isDiscount || false,
            })),
            itemTotal,
          };
        }
      }

      for (const player of players) {
        if (orderPlayerKeys.has(String(player._id))) continue;

        const playerTeamIds = (player.teams || []).map((t) => String(t.teamId));
        const matchingTeams = teamIds.filter((tid) => playerTeamIds.includes(String(tid)));

        for (const tid of matchingTeams) {
          const nameTeamKey = `${player.firstName.toLowerCase().trim()}|${player.lastName.toLowerCase().trim()}|${tid}`;
          if (orderPlayerKeys.has(nameTeamKey)) continue;
          orderPlayerKeys.add(nameTeamKey);

          const parent1 = player.parents?.[0];
          const parent2 = player.parents?.[1];
          const autoSub = teamSubMap[String(tid)];
          const subPrice = autoSub?.subscriptionPriceCents || 0;
          const autoItems = autoSub?.items || [];
          const itemAdj = autoSub?.itemTotal || 0;

          expectedPlayers.push({
            _id: `expected_${player._id}_${tid}`,
            _isExpected: true,
            playerId: player._id,
            playerFirstName: player.firstName,
            playerLastName: player.lastName,
            playerDob: player.dateOfBirth,
            playerGender: player.gender || "",
            playerPhonePrefix: player.phonePrefix || "+1",
            playerPhone: player.phoneNumber || "",
            playerEmail: player.email || "",
            parent1FirstName: parent1?.firstName || "",
            parent1LastName: parent1?.lastName || "",
            parent1PhonePrefix: parent1?.phonePrefix || "+1",
            parent1Phone: parent1?.phone || "",
            parent1Email: parent1?.email || "",
            parent2FirstName: parent2?.firstName || "",
            parent2LastName: parent2?.lastName || "",
            parent2PhonePrefix: parent2?.phonePrefix || "+1",
            parent2Phone: parent2?.phone || "",
            parent2Email: parent2?.email || "",
            teamId: tid,
            teamName: "",
            subscriptionId: autoSub?.subscriptionId || "",
            subscriptionTitle: autoSub?.subscriptionTitle || "",
            subscriptionPriceCents: subPrice,
            items: autoItems,
            discountType: "none",
            discountValue: 0,
            couponCode: "",
            couponDiscountCents: 0,
            totalCostCents: Math.max(0, subPrice + itemAdj),
            paidCents: 0,
            refundedCents: 0,
            status: "expected",
          });
        }
      }

      if (expectedPlayers.length > 0) {
        const Team = (await import("@/models/Team")).default;
        const teamDocs = await Team.find({ _id: { $in: teamIds } }, "name season gender").lean();
        const teamMap = {};
        teamDocs.forEach((t) => { teamMap[String(t._id)] = t; });
        expectedPlayers.forEach((ep) => {
          const t = teamMap[String(ep.teamId)];
          if (t) {
            ep.teamId = t;
          }
        });
      }
    }

    return NextResponse.json({ orders, expectedPlayers });
  } catch (error) {
    console.error("List orders error:", error);
    return NextResponse.json({ error: "Failed to list orders" }, { status: 500 });
  }
}

function computeTotal(order) {
  let total = order.subscriptionPriceCents || 0;
  (order.items || []).forEach((item) => {
    const amt = (item.priceCents || 0) * (item.quantity || 1);
    if (item.isDiscount) {
      total -= amt;
    } else {
      total += amt;
    }
  });
  if (order.discountType === "amount") {
    total -= order.discountValue || 0;
  } else if (order.discountType === "percentage") {
    total -= Math.round(total * (order.discountValue || 0) / 100);
  }
  total -= order.couponDiscountCents || 0;
  return Math.max(0, total);
}

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await dbConnect();

    const activity = await Activity.findOne({ _id: id, clubId: session.user.id });
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const body = await request.json();
    if (!body.playerFirstName || !body.playerLastName) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    let playerId = body.playerId || null;
    const parentIds = [];

    async function findOrCreateParent(firstName, lastName, email, phone, phonePrefix) {
      if (!firstName || !lastName || !email) return null;
      let parent = await Parent.findOne({
        clubId: session.user.id,
        email: email.trim().toLowerCase(),
      });
      if (parent) {
        if (phone && !parent.phone) {
          parent.phone = phone;
          parent.phonePrefix = phonePrefix || "+1";
          await parent.save();
        }
        return parent;
      }
      parent = await Parent.create({
        clubId: session.user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phonePrefix: phonePrefix || "+1",
        phone: (phone || "").trim() || "0000000000",
      });
      return parent;
    }

    if (!playerId) {
      const playerQuery = {
        clubId: session.user.id,
        firstName: body.playerFirstName.trim(),
        lastName: body.playerLastName.trim(),
      };
      playerQuery.dateOfBirth = toDobString(body.playerDob);

      let player = await Player.findOne(playerQuery).collation({ locale: "en", strength: 2 });

      if (!player) {
        const teamEntries = [];
        if (body.teamId) {
          const Team = (await import("@/models/Team")).default;
          const teamDoc = await Team.findById(body.teamId).lean();
          if (teamDoc) {
            teamEntries.push({ teamId: body.teamId, season: teamDoc.season || "" });
          }
        }

        player = await Player.create({
          clubId: session.user.id,
          firstName: body.playerFirstName.trim(),
          lastName: body.playerLastName.trim(),
          dateOfBirth: toDobString(body.playerDob),
          gender: body.playerGender || "",
          phonePrefix: body.playerPhonePrefix || "+1",
          phoneNumber: (body.playerPhone || "").trim(),
          email: (body.playerEmail || "").trim().toLowerCase(),
          teams: teamEntries,
          registrationTeamId: body.teamId || null,
          parents: [],
        });
      }
      playerId = player._id;

      const p1 = await findOrCreateParent(
        body.parent1FirstName, body.parent1LastName,
        body.parent1Email, body.parent1Phone, body.parent1PhonePrefix
      );
      if (p1) parentIds.push(p1._id);

      const p2 = await findOrCreateParent(
        body.parent2FirstName, body.parent2LastName,
        body.parent2Email, body.parent2Phone, body.parent2PhonePrefix
      );
      if (p2) parentIds.push(p2._id);

      if (parentIds.length > 0) {
        const existingParentIds = player.parents.map((p) => String(p));
        const newParentIds = parentIds.filter((pid) => !existingParentIds.includes(String(pid)));
        if (newParentIds.length > 0) {
          await Player.updateOne(
            { _id: player._id },
            { $addToSet: { parents: { $each: newParentIds } } }
          );
          await Parent.updateMany(
            { _id: { $in: newParentIds } },
            { $addToSet: { players: player._id } }
          );
        }
      }
    }

    const orderData = {
      activityId: id,
      clubId: session.user.id,
      playerId,
      playerFirstName: body.playerFirstName,
      playerLastName: body.playerLastName,
      playerDob: toDobString(body.playerDob),
      playerGender: body.playerGender || "",
      playerPhonePrefix: body.playerPhonePrefix || "+1",
      playerPhone: body.playerPhone || "",
      playerEmail: body.playerEmail || "",
      parent1FirstName: body.parent1FirstName || "",
      parent1LastName: body.parent1LastName || "",
      parent1PhonePrefix: body.parent1PhonePrefix || "+1",
      parent1Phone: body.parent1Phone || "",
      parent1Email: body.parent1Email || "",
      parent2FirstName: body.parent2FirstName || "",
      parent2LastName: body.parent2LastName || "",
      parent2PhonePrefix: body.parent2PhonePrefix || "+1",
      parent2Phone: body.parent2Phone || "",
      parent2Email: body.parent2Email || "",
      teamId: body.teamId || null,
      subscriptionId: body.subscriptionId || "",
      subscriptionTitle: body.subscriptionTitle || "",
      subscriptionPriceCents: body.subscriptionPriceCents || 0,
      items: body.items || [],
      discountType: body.discountType || "none",
      discountValue: body.discountValue || 0,
      couponCode: body.couponCode || "",
      couponDiscountCents: body.couponDiscountCents || 0,
      paidCents: body.paidCents || 0,
      refundedCents: body.refundedCents || 0,
      status: body.status || "pending",
      formData: body.formData || {},
    };
    orderData.totalCostCents = computeTotal(orderData);

    const order = await Order.create(orderData);

    await OrderLog.create({
      orderId: order._id,
      activityId: id,
      clubId: session.user.id,
      userId: session.user.id,
      userName: session.user.name || session.user.username || "Admin",
      field: "order",
      previousValue: "",
      newValue: "created",
      description: `Order created for ${body.playerFirstName} ${body.playerLastName}`,
    });

    const populated = await Order.findById(order._id)
      .populate("teamId", "name season gender")
      .lean();

    return NextResponse.json({ order: populated }, { status: 201 });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
