import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Activity from "@/models/Activity";
import Order from "@/models/Order";
import Club from "@/models/Club";

export async function GET(request, { params }) {
  try {
    const { activityId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    await dbConnect();

    const activity = await Activity.findById(activityId)
      .populate("teams.teamId", "name season gender")
      .lean();

    if (!activity) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }

    const club = await Club.findById(activity.clubId, "name logoUrl language supportEmail").lean();

    const safeActivity = {
      _id: activity._id,
      title: activity.title,
      description: activity.description,
      type: activity.type,
      season: activity.season,
      hasPayment: activity.hasPayment,
      startDate: activity.startDate,
      endDate: activity.endDate,
      lastRegisterDate: activity.lastRegisterDate,
      status: activity.status,
      registrationType: activity.registrationType,
      onlyAssignedPlayers: activity.onlyAssignedPlayers,
      coverImage: activity.coverImage,
      afterRegistrationMessage: activity.afterRegistrationMessage,
      teams: (activity.teams || []).map((t) => ({
        teamId: t.teamId?._id || t.teamId,
        name: t.teamId?.name || "Unknown",
        season: t.teamId?.season || "",
        gender: t.teamId?.gender || "",
        playerLimit: t.playerLimit,
        ageLimitType: t.ageLimitType,
      })),
      subscriptions: (activity.subscriptions || []).map((s) => ({
        _id: s._id,
        title: s.title,
        description: s.description,
        priceCents: s.priceCents || 0,
        dueDateAmountCents: s.dueDateAmountCents || 0,
        maxInstallments: s.maxInstallments || 1,
        firstInstallmentDate: s.firstInstallmentDate,
        includedTeamIds: s.includedTeamIds || [],
        hasReduction: s.hasReduction || false,
        reductionSchedule: s.reductionSchedule || [],
        installmentFeeThreshold: s.installmentFeeThreshold || 0,
        installmentFeePercent: s.installmentFeePercent || 0,
        installmentFeeMode: s.installmentFeeMode || "split",
        items: (s.items || []).filter((i) => !i.expiresAt || new Date(i.expiresAt) >= new Date()).map((i) => ({ name: i.name, priceCents: i.priceCents, quantity: i.quantity, isRequired: i.isRequired, isDiscount: i.isDiscount || false })),
        paymentTypes: s.paymentTypes,
        paymentMessages: s.paymentMessages,
      })),
      formSections: activity.formSections || [],
      waivers: (activity.waivers || []).map((w) => ({
        _id: w._id, title: w.title, contentHtml: w.contentHtml, isRequired: w.isRequired, order: w.order,
      })),
      clubName: club?.name || "",
      clubLogoUrl: club?.logoUrl || null,
      clubLanguage: club?.language || "en",
      clubId: String(activity.clubId),
      supportEmail: club?.supportEmail || "",
    };

    if (token) {
      const order = await Order.findOne({ registrationToken: token, activityId })
        .populate("teamId", "name season gender")
        .lean();

      if (!order) {
        return NextResponse.json({ error: "Invalid or expired registration link" }, { status: 404 });
      }

      if (order.registrationTokenExpiresAt && new Date() > new Date(order.registrationTokenExpiresAt)) {
        return NextResponse.json({ error: "Registration link has expired" }, { status: 410 });
      }

      return NextResponse.json({ activity: safeActivity, order, mode: "token" });
    }

    if (activity.registrationType !== "public") {
      return NextResponse.json({ error: "This activity requires an invitation link" }, { status: 403 });
    }

    return NextResponse.json({ activity: safeActivity, order: null, mode: "public" });
  } catch (error) {
    console.error("Load registration error:", error);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}
