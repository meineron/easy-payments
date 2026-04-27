import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

// Admin invoice edits must be visible to the parent immediately, so this
// route must never be served from the Next.js route-handler cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function _GET(req, res) {
  try {
    const { activityId } = req.query;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    const ctx = await resolvePublicContext("activity", activityId);
    if (!ctx) {
      return res.status(404).json({ error: "Activity not found" });
    }
    const { Activity, Order } = ctx.models;

    const activity = await Activity.findById(activityId)
      .populate("teams.teamId", "name season gender")
      .lean();

    if (!activity) {
      return res.status(404).json({ error: "Activity not found" });
    }

    await connectMain();
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
      waiverEmailConfirmation: !!activity.waiverEmailConfirmation,
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
        return res.status(404).json({ error: "Invalid or expired registration link" });
      }

      if (order.registrationTokenExpiresAt && new Date() > new Date(order.registrationTokenExpiresAt)) {
        return res.status(410).json({ error: "Registration link has expired" });
      }

      return res.status(200).json(
        { activity: safeActivity, order, mode: "token" },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
      );
    }

    if (activity.registrationType !== "public") {
      return res.status(403).json({ error: "This activity requires an invitation link" });
    }

    return res.status(200).json(
      { activity: safeActivity, order: null, mode: "public" },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
  } catch (error) {
    console.error("Load registration error:", error);
    return res.status(500).json({ error: "Failed to load registration" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
