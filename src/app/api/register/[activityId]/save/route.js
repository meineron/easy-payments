import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Activity from "@/models/Activity";

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

      const fields = [
        "playerFirstName", "playerLastName", "playerDob", "playerGender",
        "playerPhone", "playerEmail",
        "parent1FirstName", "parent1LastName", "parent1Phone", "parent1Email",
        "parent2FirstName", "parent2LastName", "parent2Phone", "parent2Email",
        "teamId", "subscriptionId", "subscriptionTitle", "subscriptionPriceCents",
        "formData",
      ];
      fields.forEach((f) => { if (body[f] !== undefined) order[f] = body[f]; });
      if (body.waiverConsents) order.waiverConsents = body.waiverConsents;
      order.totalCostCents = computeTotal(order);
      await order.save();

      const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
      return NextResponse.json({ order: populated });
    }

    if (activity.registrationType !== "public") {
      return NextResponse.json({ error: "Registration requires invitation" }, { status: 403 });
    }

    if (!body.playerFirstName || !body.playerLastName) {
      return NextResponse.json({ error: "Player name is required" }, { status: 400 });
    }

    const orderData = {
      activityId,
      clubId: activity.clubId,
      playerFirstName: body.playerFirstName,
      playerLastName: body.playerLastName,
      playerDob: body.playerDob || null,
      playerGender: body.playerGender || "",
      playerPhone: body.playerPhone || "",
      playerEmail: body.playerEmail || "",
      parent1FirstName: body.parent1FirstName || "",
      parent1LastName: body.parent1LastName || "",
      parent1Phone: body.parent1Phone || "",
      parent1Email: body.parent1Email || "",
      parent2FirstName: body.parent2FirstName || "",
      parent2LastName: body.parent2LastName || "",
      parent2Phone: body.parent2Phone || "",
      parent2Email: body.parent2Email || "",
      teamId: body.teamId || null,
      subscriptionId: body.subscriptionId || "",
      subscriptionTitle: body.subscriptionTitle || "",
      subscriptionPriceCents: body.subscriptionPriceCents || 0,
      items: body.items || [],
      waiverConsents: body.waiverConsents || [],
      formData: body.formData || {},
      status: "pending",
    };
    orderData.totalCostCents = computeTotal(orderData);

    const order = await Order.create(orderData);
    const populated = await Order.findById(order._id).populate("teamId", "name season gender").lean();
    return NextResponse.json({ order: populated }, { status: 201 });
  } catch (error) {
    console.error("Save registration error:", error);
    return NextResponse.json({ error: "Failed to save registration" }, { status: 500 });
  }
}
