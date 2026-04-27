import { resolvePublicContext, dualCreate, dualSave, dualWrite } from "@/lib/club-context";
import { markPlayerRegisteredForTeam } from "@/lib/order-sync";
import { toDobString } from "@/lib/dob";

async function writeRegistrationSubmittedLog(ctx, order) {
  try {
    const existing = await ctx.models.OrderLog.findOne({
      orderId: order._id,
      field: "registration_submitted",
    }).select("_id").lean();
    if (existing) return;
    const playerName = `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim() || order.playerEmail || "—";
    await dualCreate(ctx, "OrderLog", {
      orderId: order._id,
      activityId: order.activityId,
      clubId: order.clubId,
      userId: "system",
      userName: playerName,
      field: "registration_submitted",
      previousValue: "",
      newValue: "submitted",
      description: `Registration submitted by ${playerName}`,
    });
  } catch (e) {
    console.error("Write registration_submitted log:", e);
  }
}

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

async function findOrCreateParent(ctx, clubId, firstName, lastName, email, phone, phonePrefix) {
  if (!firstName || !lastName || !email) return null;
  let parent = await ctx.models.Parent.findOne({ clubId, email: email.trim().toLowerCase() });
  if (parent) {
    parent.firstName = firstName.trim();
    parent.lastName = lastName.trim();
    if (phone) {
      parent.phone = phone.trim();
      parent.phonePrefix = phonePrefix || "+1";
    }
    await dualSave(ctx, parent);
    return parent;
  }
  parent = await dualCreate(ctx, "Parent", {
    clubId,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    phonePrefix: phonePrefix || "+1",
    phone: (phone || "").trim() || "0000000000",
  });
  return parent;
}

async function findOrCreatePlayer(ctx, clubId, body) {
  const playerQuery = {
    clubId,
    firstName: body.playerFirstName.trim(),
    lastName: body.playerLastName.trim(),
  };
  playerQuery.dateOfBirth = toDobString(body.playerDob);

  let player = await ctx.models.Player.findOne(playerQuery).collation({ locale: "en", strength: 2 });

  if (!player) {
    const teamEntries = [];
    if (body.teamId) {
      const teamDoc = await ctx.models.Team.findById(body.teamId).lean();
      if (teamDoc) teamEntries.push({ teamId: body.teamId, season: teamDoc.season || "" });
    }
    player = await dualCreate(ctx, "Player", {
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
  const p1 = await findOrCreateParent(ctx, clubId, body.parent1FirstName, body.parent1LastName, body.parent1Email, body.parent1Phone, body.parent1PhonePrefix);
  if (p1) parentIds.push(p1._id);
  const p2 = await findOrCreateParent(ctx, clubId, body.parent2FirstName, body.parent2LastName, body.parent2Email, body.parent2Phone, body.parent2PhonePrefix);
  if (p2) parentIds.push(p2._id);

  if (parentIds.length > 0) {
    const existingParentIds = (player.parents || []).map((p) => String(p));
    const newParentIds = parentIds.filter((pid) => !existingParentIds.includes(String(pid)));
    if (newParentIds.length > 0) {
      await dualWrite(ctx, (M) => M.Player.updateOne({ _id: player._id }, { $addToSet: { parents: { $each: newParentIds } } }));
      await dualWrite(ctx, (M) => M.Parent.updateMany({ _id: { $in: newParentIds } }, { $addToSet: { players: player._id } }));
    }
  }

  return player._id;
}

async function syncParentsToPlayer(ctx, clubId, playerId, orderData) {
  if (!playerId) return;
  const parentIds = [];
  const p1 = await findOrCreateParent(ctx, clubId, orderData.parent1FirstName, orderData.parent1LastName, orderData.parent1Email, orderData.parent1Phone, orderData.parent1PhonePrefix);
  if (p1) parentIds.push(p1._id);
  const p2 = await findOrCreateParent(ctx, clubId, orderData.parent2FirstName, orderData.parent2LastName, orderData.parent2Email, orderData.parent2Phone, orderData.parent2PhonePrefix);
  if (p2) parentIds.push(p2._id);

  if (parentIds.length > 0) {
    await dualWrite(ctx, (M) => M.Player.updateOne({ _id: playerId }, { parents: parentIds }));
    await dualWrite(ctx, (M) => M.Parent.updateMany({ _id: { $in: parentIds } }, { $addToSet: { players: playerId } }));
  }
}

async function _PUT(req, res) {
  try {
    const { activityId } = req.query;
    const body = req.body;

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return res.status(404).json({ error: "Activity not found" });
    }
    const { Activity, Order } = ctx.models;

    const activity = await Activity.findById(activityId).lean();
    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }

    if (body.token) {
      const order = await Order.findOne({ registrationToken: body.token, activityId });
      if (!order) {
        return res.status(404).json({ error: "Invalid registration link" });
      }

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
      if (!order.waiversLockedAt && Array.isArray(body.waiverConsents) && body.waiverConsents.some((c) => c?.agreedAt)) {
        order.waiversLockedAt = new Date();
      }
      order.totalCostCents = computeTotal(order);

      if (!order.playerId && order.playerFirstName && order.playerLastName) {
        try {
          order.playerId = await findOrCreatePlayer(ctx, order.clubId, order);
        } catch (e) { console.error("Player creation in token save:", e); }
      }

      await dualSave(ctx, order);

      if (order.playerId) {
        try {
          await syncParentsToPlayer(ctx, order.clubId, order.playerId, order);
        } catch (e) { console.error("Parent sync in token save:", e); }
      }

      if (!activity.hasPayment) {
        const wasComplete = !!order.registrationCompletedAt;
        order.registrationCompletedAt = order.registrationCompletedAt || new Date();
        order.status = "paid";
        await dualSave(ctx, order);
        if (!wasComplete) await writeRegistrationSubmittedLog(ctx, order);
        try {
          await markPlayerRegisteredForTeam(ctx, order.playerId, order.teamId, order.registrationCompletedAt);
        } catch (e) { console.error("Mark player registered (token):", e); }
        try {
          const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
          await sendRegistrationPDFEmail(order, ctx);
        } catch (e) { console.error("Registration PDF email (token):", e); }
        try {
          if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
            const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
            await sendWaiverConfirmationPDFEmail(order, { ctx });
          }
        } catch (e) { console.error("Waiver PDF email (token):", e); }
      }

      const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
      return res.status(403).json({ order: populated });
    }

    if (activity.registrationType !== "public") {
      return res.status(200).json({ error: "Registration requires invitation" });
    }

    if (body.orderId) {
      const existing = await Order.findOne({ _id: body.orderId, activityId });
      if (!existing) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (existing.status === "paid" || (existing.paidCents || 0) > 0) {
        const populated = await Order.findById(existing._id).populate("teamId", "name season gender").lean();
        return res.status(200).json({ order: populated });
      }

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
      if (!existing.waiversLockedAt && Array.isArray(body.waiverConsents) && body.waiverConsents.some((c) => c?.agreedAt)) {
        existing.waiversLockedAt = new Date();
      }
      if (body.couponCode !== undefined) existing.couponCode = body.couponCode;
      if (body.couponDiscountCents !== undefined) existing.couponDiscountCents = body.couponDiscountCents;
      existing.totalCostCents = computeTotal(existing);

      if (!existing.playerId && existing.playerFirstName && existing.playerLastName) {
        try {
          existing.playerId = await findOrCreatePlayer(ctx, existing.clubId, existing);
        } catch (e) { console.error("Player creation in public update:", e); }
      }

      await dualSave(ctx, existing);

      if (existing.playerId) {
        try {
          await syncParentsToPlayer(ctx, existing.clubId, existing.playerId, existing);
        } catch (e) { console.error("Parent sync in public update:", e); }
      }

      if (!activity.hasPayment) {
        const wasComplete = !!existing.registrationCompletedAt;
        existing.registrationCompletedAt = existing.registrationCompletedAt || new Date();
        existing.status = "paid";
        await dualSave(ctx, existing);
        if (!wasComplete) await writeRegistrationSubmittedLog(ctx, existing);
        try {
          await markPlayerRegisteredForTeam(ctx, existing.playerId, existing.teamId, existing.registrationCompletedAt);
        } catch (e) { console.error("Mark player registered (public update):", e); }
        try {
          const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
          await sendRegistrationPDFEmail(existing, ctx);
        } catch (e) { console.error("Registration PDF email (public update):", e); }
        try {
          if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
            const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
            await sendWaiverConfirmationPDFEmail(existing, { ctx });
          }
        } catch (e) { console.error("Waiver PDF email (public update):", e); }
      }

      const populated = await Order.findById(existing._id).populate("teamId", "name season gender").lean();
      return res.status(400).json({ order: populated });
    }

    if (!body.playerFirstName || !body.playerLastName) {
      return res.status(200).json({ error: "Player name is required" });
    }

    let playerId = null;
    try {
      playerId = await findOrCreatePlayer(ctx, activity.clubId, body);
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
    if (Array.isArray(body.waiverConsents) && body.waiverConsents.some((c) => c?.agreedAt)) {
      orderData.waiversLockedAt = new Date();
    }
    orderData.totalCostCents = computeTotal(orderData);

    const order = await dualCreate(ctx, "Order", orderData);

    if (!activity.hasPayment) {
      order.registrationCompletedAt = new Date();
      order.status = "paid";
      await dualSave(ctx, order);
      await writeRegistrationSubmittedLog(ctx, order);
      try {
        await markPlayerRegisteredForTeam(ctx, order.playerId, order.teamId, order.registrationCompletedAt);
      } catch (e) { console.error("Mark player registered (public create):", e); }
      try {
        const { sendRegistrationPDFEmail } = await import("@/lib/registration-email");
        await sendRegistrationPDFEmail(order, ctx);
      } catch (e) { console.error("Registration PDF email:", e); }
      try {
        if ((activity.waivers || []).length > 0 && !activity.waiverEmailConfirmation) {
          const { sendWaiverConfirmationPDFEmail } = await import("@/lib/waiver-confirmation-email");
          await sendWaiverConfirmationPDFEmail(order, { ctx });
        }
      } catch (e) { console.error("Waiver PDF email (public create):", e); }
    }

    const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
    return res.status(201).json({ order: populated });
  } catch (error) {
    console.error("Save registration error:", error);
    return res.status(500).json({ error: "Failed to save registration" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });
  return _PUT(req, res);
}
