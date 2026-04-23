import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";
import Player from "@/models/Player";
import Parent from "@/models/Parent";
import { markPlayerRegisteredForTeam } from "@/lib/order-sync";
import { toDobString } from "@/lib/dob";

function computeTotal(order) {
  let total = order.subscriptionPriceCents || 0;
  (order.items || []).forEach((item) => {
    const amt = (item.priceCents || 0) * (item.quantity || 1);
    if (item.isDiscount) total -= amt; else total += amt;
  });
  if (order.discountType === "amount") total -= order.discountValue || 0;
  else if (order.discountType === "percentage") total -= Math.round(total * (order.discountValue || 0) / 100);
  total -= order.couponDiscountCents || 0;
  return Math.max(0, total);
}

async function findOrCreateParent(clubId, firstName, lastName, email, phone, phonePrefix) {
  if (!firstName || !lastName || !email) return null;
  let parent = await Parent.findOne({ clubId, email: email.trim().toLowerCase() });
  if (parent) {
    parent.firstName = firstName.trim();
    parent.lastName = lastName.trim();
    if (phone) {
      parent.phone = phone.trim();
      parent.phonePrefix = phonePrefix || "+1";
    }
    await parent.save();
    return parent;
  }
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

async function findOrCreatePlayer(clubId, body) {
  const playerQuery = {
    clubId,
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
      if (teamDoc) teamEntries.push({ teamId: body.teamId, season: teamDoc.season || "" });
    }
    player = await Player.create({
      clubId,
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

  const parentIds = [];
  const p1 = await findOrCreateParent(clubId, body.parent1FirstName, body.parent1LastName, body.parent1Email, body.parent1Phone, body.parent1PhonePrefix);
  if (p1) parentIds.push(p1._id);
  const p2 = await findOrCreateParent(clubId, body.parent2FirstName, body.parent2LastName, body.parent2Email, body.parent2Phone, body.parent2PhonePrefix);
  if (p2) parentIds.push(p2._id);

  if (parentIds.length > 0) {
    const existingParentIds = player.parents.map((p) => String(p));
    const newParentIds = parentIds.filter((pid) => !existingParentIds.includes(String(pid)));
    if (newParentIds.length > 0) {
      await Player.updateOne({ _id: player._id }, { $addToSet: { parents: { $each: newParentIds } } });
      await Parent.updateMany({ _id: { $in: newParentIds } }, { $addToSet: { players: player._id } });
    }
  }

  return player._id;
}

async function syncParentsToPlayer(clubId, playerId, orderData) {
  if (!playerId) return;
  const parentIds = [];
  const p1 = await findOrCreateParent(clubId, orderData.parent1FirstName, orderData.parent1LastName, orderData.parent1Email, orderData.parent1Phone, orderData.parent1PhonePrefix);
  if (p1) parentIds.push(p1._id);
  const p2 = await findOrCreateParent(clubId, orderData.parent2FirstName, orderData.parent2LastName, orderData.parent2Email, orderData.parent2Phone, orderData.parent2PhonePrefix);
  if (p2) parentIds.push(p2._id);

  if (parentIds.length > 0) {
    await Player.updateOne({ _id: playerId }, { parents: parentIds });
    await Parent.updateMany({ _id: { $in: parentIds } }, { $addToSet: { players: playerId } });
  }
}

export async function PUT(request, { params }) {
  try {
    const { activityId } = await params;
    const body = await request.json();
    await dbConnect();

    const activity = await Activity.findById(activityId).lean();
    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    if (body.token) {
      const order = await Order.findOne({ registrationToken: body.token, activityId });
      if (!order) {
        return NextResponse.json({ error: "Invalid registration link" }, { status: 404 });
      }

      // Contact / waivers / form fields are safe to overwrite from the client.
      // Pricing fields (`subscriptionPriceCents`, `subscriptionTitle`) are NOT —
      // the admin may have overridden them in the dashboard, and a stale client
      // would blow that override away. We re-derive them server-side below
      // whenever the subscription selection actually changes.
      const fields = [
        "playerFirstName", "playerLastName", "playerDob", "playerGender",
        "playerPhonePrefix", "playerPhone", "playerEmail",
        "parent1FirstName", "parent1LastName", "parent1PhonePrefix", "parent1Phone", "parent1Email",
        "parent2FirstName", "parent2LastName", "parent2PhonePrefix", "parent2Phone", "parent2Email",
        "teamId",
        "formData",
      ];
      fields.forEach((f) => {
        if (body[f] === undefined) return;
        order[f] = f === "playerDob" ? toDobString(body[f]) : body[f];
      });

      if (body.subscriptionId !== undefined && String(body.subscriptionId) !== String(order.subscriptionId || "")) {
        const sub = (activity.subscriptions || []).find((s) => String(s._id) === String(body.subscriptionId));
        order.subscriptionId = body.subscriptionId;
        // The parent picked a different subscription → "dismissed" names were
        // scoped to the old template and no longer apply.
        order.dismissedSubItemNames = [];
        if (sub) {
          order.subscriptionTitle = sub.title || "";
          order.subscriptionPriceCents = sub.priceCents || 0;
        } else {
          order.subscriptionTitle = "";
          order.subscriptionPriceCents = 0;
        }
      }

      if (body.waiverConsents) order.waiverConsents = body.waiverConsents;
      order.totalCostCents = computeTotal(order);

      if (!order.playerId && order.playerFirstName && order.playerLastName) {
        try {
          order.playerId = await findOrCreatePlayer(order.clubId, order);
        } catch (e) { console.error("Player creation in token save:", e); }
      }

      await order.save();

      if (order.playerId) {
        try {
          await syncParentsToPlayer(order.clubId, order.playerId, order);
        } catch (e) { console.error("Parent sync in token save:", e); }
      }

      // Only auto-complete the order when the activity genuinely has no payment.
      // Previously a 0 total (e.g. discounts cancelling out the sub price during
      // mid-edit) also flipped status → "paid", which left orders stuck as
      // "paid with paidCents=0" and rejected every future checkout attempt.
      if (!activity.hasPayment) {
        order.registrationCompletedAt = order.registrationCompletedAt || new Date();
        order.status = "paid";
        await order.save();
        try {
          await markPlayerRegisteredForTeam(order.playerId, order.teamId, order.registrationCompletedAt);
        } catch (e) { console.error("Mark player registered (token):", e); }
        try {
          const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
          await sendRegistrationPDFEmail(order);
        } catch (e) { console.error("Registration PDF email (token):", e); }
        try {
          if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
            const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
            await sendWaiverConfirmationPDFEmail(order);
          }
        } catch (e) { console.error("Waiver PDF email (token):", e); }
      }

      const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
      return NextResponse.json({ order: populated });
    }

    if (activity.registrationType !== "public") {
      return NextResponse.json({ error: "Registration requires invitation" }, { status: 403 });
    }

    if (body.orderId) {
      const existing = await Order.findOne({ _id: body.orderId, activityId });
      if (!existing) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (existing.status === "paid" || (existing.paidCents || 0) > 0) {
        const populated = await Order.findById(existing._id).populate("teamId", "name season gender").lean();
        return NextResponse.json({ order: populated });
      }

      // Pricing fields (`subscriptionPriceCents`, `subscriptionTitle`, `items`)
      // are NOT accepted from the client — the admin may have overridden them
      // and a stale client submission would clobber that. We re-derive them
      // server-side below when the subscription selection actually changes.
      const fields = [
        "playerFirstName", "playerLastName", "playerDob", "playerGender",
        "playerPhonePrefix", "playerPhone", "playerEmail",
        "parent1FirstName", "parent1LastName", "parent1PhonePrefix", "parent1Phone", "parent1Email",
        "parent2FirstName", "parent2LastName", "parent2PhonePrefix", "parent2Phone", "parent2Email",
        "teamId",
        "formData",
      ];
      fields.forEach((f) => {
        if (body[f] === undefined) return;
        existing[f] = f === "playerDob" ? toDobString(body[f]) : body[f];
      });

      if (body.subscriptionId !== undefined && String(body.subscriptionId) !== String(existing.subscriptionId || "")) {
        const sub = (activity.subscriptions || []).find((s) => String(s._id) === String(body.subscriptionId));
        existing.subscriptionId = body.subscriptionId;
        // Subscription changed → previously dismissed line names don't apply.
        existing.dismissedSubItemNames = [];
        if (sub) {
          existing.subscriptionTitle = sub.title || "";
          existing.subscriptionPriceCents = sub.priceCents || 0;
          existing.items = (sub.items || [])
            .filter((i) => !i.expiresAt || new Date(i.expiresAt) >= new Date())
            .map((i) => ({
              name: i.name,
              priceCents: i.priceCents || 0,
              quantity: i.quantity || 1,
              isDiscount: !!i.isDiscount,
              isManual: false,
            }));
        } else {
          existing.subscriptionTitle = "";
          existing.subscriptionPriceCents = 0;
          existing.items = [];
        }
      }

      if (body.waiverConsents) existing.waiverConsents = body.waiverConsents;
      if (body.couponCode !== undefined) existing.couponCode = body.couponCode;
      if (body.couponDiscountCents !== undefined) existing.couponDiscountCents = body.couponDiscountCents;
      existing.totalCostCents = computeTotal(existing);

      if (!existing.playerId && existing.playerFirstName && existing.playerLastName) {
        try {
          existing.playerId = await findOrCreatePlayer(existing.clubId, existing);
        } catch (e) { console.error("Player creation in public update:", e); }
      }

      await existing.save();

      if (existing.playerId) {
        try {
          await syncParentsToPlayer(existing.clubId, existing.playerId, existing);
        } catch (e) { console.error("Parent sync in public update:", e); }
      }

      // Same rationale as the token branch: a 0 total must not auto-paid an
      // order on an activity that has payment enabled.
      if (!activity.hasPayment) {
        existing.registrationCompletedAt = existing.registrationCompletedAt || new Date();
        existing.status = "paid";
        await existing.save();
        try {
          await markPlayerRegisteredForTeam(existing.playerId, existing.teamId, existing.registrationCompletedAt);
        } catch (e) { console.error("Mark player registered (public update):", e); }
        try {
          const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
          await sendRegistrationPDFEmail(existing);
        } catch (e) { console.error("Registration PDF email (public update):", e); }
        try {
          if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
            const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
            await sendWaiverConfirmationPDFEmail(existing);
          }
        } catch (e) { console.error("Waiver PDF email (public update):", e); }
      }

      const populated = await Order.findById(existing._id).populate("teamId", "name season gender").lean();
      return NextResponse.json({ order: populated });
    }

    if (!body.playerFirstName || !body.playerLastName) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    let playerId = null;
    try {
      playerId = await findOrCreatePlayer(activity.clubId, body);
    } catch (e) { console.error("Player creation in public save:", e); }

    const orderData = {
      activityId,
      clubId: activity.clubId,
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
      items: (body.items || []).map((i) => ({
        name: i.name,
        priceCents: i.priceCents || 0,
        quantity: i.quantity || 1,
        isDiscount: !!i.isDiscount,
        isManual: false,
      })),
      waiverConsents: body.waiverConsents || [],
      formData: body.formData || {},
      status: "pending",
    };
    orderData.totalCostCents = computeTotal(orderData);

    const order = await Order.create(orderData);

    // Same rationale as above: never auto-paid a brand-new order on an activity
    // that has payment enabled, even if the math currently zeros out.
    if (!activity.hasPayment) {
      order.registrationCompletedAt = new Date();
      order.status = "paid";
      await order.save();
      try {
        await markPlayerRegisteredForTeam(order.playerId, order.teamId, order.registrationCompletedAt);
      } catch (e) { console.error("Mark player registered (public create):", e); }
      try {
        const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
        await sendRegistrationPDFEmail(order);
      } catch (e) { console.error("Registration PDF email:", e); }
      try {
        if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
          const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
          await sendWaiverConfirmationPDFEmail(order);
        }
      } catch (e) { console.error("Waiver PDF email (public create):", e); }
    }

    const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
    return NextResponse.json({ order: populated }, { status: 201 });
  } catch (error) {
    console.error("Save registration error:", error);
    return NextResponse.json({ error: "Failed to save registration" }, { status: 500 });
  }
}
