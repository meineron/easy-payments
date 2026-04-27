import { getClubContext } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Activity, Order, Team } = ctx.models;

    const clubId = ctx.clubId;
    const { searchParams } = new URL(request.url);
    const seasonParam = searchParams.get("season");
    const paymentMethodsParam = searchParams.get("paymentMethods");
    const activityIdsParam = searchParams.get("activityIds");
    const teamIdsParam = searchParams.get("teamIds");

    const allActivities = await Activity.find({ clubId }, "title season startDate endDate teams")
      .sort({ createdAt: -1 })
      .lean();

    const seasonSet = [...new Set(allActivities.map((a) => a.season).filter(Boolean))];
    const currentSeason = seasonParam || seasonSet[0] || "";

    const seasonActivities = currentSeason
      ? allActivities.filter((a) => a.season === currentSeason)
      : allActivities;

    const startDates = seasonActivities.map((a) => a.startDate).filter(Boolean);
    const endDates = seasonActivities.map((a) => a.endDate).filter(Boolean);
    const seasonFrom = startDates.length > 0
      ? new Date(Math.min(...startDates.map((d) => d.getTime())))
      : new Date(Date.now() - 365 * 86400000);
    const seasonTo = endDates.length > 0
      ? new Date(Math.max(...endDates.map((d) => d.getTime())))
      : new Date();

    const seasonActivityIds = seasonActivities.map((a) => a._id);

    const allTeamIds = new Set();
    for (const act of seasonActivities) {
      for (const t of act.teams || []) {
        allTeamIds.add(String(t.teamId));
      }
    }
    const teamDocs = await Team.find(
      { _id: { $in: [...allTeamIds] }, clubId },
      "name"
    ).lean();

    let activityFilter = seasonActivityIds;
    if (activityIdsParam) {
      const ids = activityIdsParam.split(",").filter(Boolean);
      activityFilter = ids.filter((id) =>
        seasonActivityIds.some((sid) => String(sid) === id)
      );
    }

    const orderMatch = {
      clubId: { $toObjectId: clubId },
      activityId: { $in: activityFilter.map((id) => ({ $toObjectId: String(id) })) },
      status: { $nin: ["cancelled"] },
    };

    if (teamIdsParam) {
      const tids = teamIdsParam.split(",").filter(Boolean);
      orderMatch.teamId = { $in: tids.map((id) => ({ $toObjectId: id })) };
    }

    const paymentMethods = paymentMethodsParam
      ? paymentMethodsParam.split(",").filter(Boolean)
      : null;

    const mongoose = (await import("mongoose")).default;
    const toOid = (id) => new mongoose.Types.ObjectId(String(id));

    const matchStage = {
      clubId: toOid(clubId),
      activityId: { $in: activityFilter.map((id) => toOid(id)) },
      status: { $nin: ["cancelled"] },
    };
    if (teamIdsParam) {
      const tids = teamIdsParam.split(",").filter(Boolean);
      matchStage.teamId = { $in: tids.map((id) => toOid(id)) };
    }
    if (paymentMethods) {
      matchStage["installmentSchedule.paymentMethod"] = { $in: paymentMethods };
    }

    const [totalsResult, dailyResult, methodResult, teamsResult, collectionResult] =
      await Promise.all([
        Order.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$totalCostCents" },
              totalCollected: { $sum: "$paidCents" },
              totalRefunded: { $sum: "$refundedCents" },
              totalRegistered: { $sum: 1 },
            },
          },
        ]),

        Order.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              revenue: { $sum: "$totalCostCents" },
              collected: { $sum: "$paidCents" },
              refunded: { $sum: "$refundedCents" },
              registrations: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        Order.aggregate([
          { $match: matchStage },
          { $unwind: "$installmentSchedule" },
          { $match: { "installmentSchedule.status": "paid" } },
          {
            $group: {
              _id: "$installmentSchedule.paymentMethod",
              totalCents: { $sum: "$installmentSchedule.amountCents" },
            },
          },
        ]),

        Order.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: "$teamId",
              subscriptionPlayers: { $sum: 1 },
              totalPaid: { $sum: "$paidCents" },
              totalCost: { $sum: "$totalCostCents" },
            },
          },
        ]),

        Order.aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              collected: {
                $sum: "$paidCents",
              },
              outstanding: {
                $sum: {
                  $cond: [
                    { $gt: ["$paidCents", 0] },
                    { $subtract: ["$totalCostCents", "$paidCents"] },
                    0,
                  ],
                },
              },
              unpaid: {
                $sum: {
                  $cond: [
                    { $eq: ["$paidCents", 0] },
                    "$totalCostCents",
                    0,
                  ],
                },
              },
              refunded: {
                $sum: "$refundedCents",
              },
            },
          },
        ]),
      ]);

    const totals = totalsResult[0] || {
      totalRevenue: 0,
      totalCollected: 0,
      totalRefunded: 0,
      totalRegistered: 0,
    };

    const dailyData = dailyResult.map((d) => ({
      date: d._id,
      revenue: d.revenue,
      collected: d.collected,
      refunded: d.refunded,
      registrations: d.registrations,
    }));

    const dailyMethodResult = await Order.aggregate([
      { $match: matchStage },
      { $unwind: "$installmentSchedule" },
      { $match: { "installmentSchedule.status": "paid" } },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$installmentSchedule.paidAt",
              },
            },
            method: "$installmentSchedule.paymentMethod",
          },
          total: { $sum: "$installmentSchedule.amountCents" },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    const dailyMethodMap = {};
    for (const row of dailyMethodResult) {
      const date = row._id.date || "unknown";
      if (!dailyMethodMap[date]) {
        dailyMethodMap[date] = { card: 0, bank_transfer: 0, cash: 0, check: 0 };
      }
      const method = row._id.method || "card";
      dailyMethodMap[date][method] = (dailyMethodMap[date][method] || 0) + row.total;
    }

    for (const day of dailyData) {
      day.byMethod = dailyMethodMap[day.date] || {
        card: 0,
        bank_transfer: 0,
        cash: 0,
        check: 0,
      };
    }

    const byPaymentMethod = methodResult.map((m) => ({
      method: m._id || "card",
      totalCents: m.totalCents,
    }));

    const collection = collectionResult[0] || {
      collected: 0,
      outstanding: 0,
      unpaid: 0,
      refunded: 0,
    };

    const teamMap = {};
    for (const t of teamDocs) {
      teamMap[String(t._id)] = t.name;
    }
    const teamsTable = teamsResult.map((t) => ({
      teamId: t._id ? String(t._id) : null,
      teamName: t._id ? teamMap[String(t._id)] || "Unknown" : "No Team",
      subscriptionPlayers: t.subscriptionPlayers,
      totalPaid: t.totalPaid,
      totalNotPaid: Math.max(0, t.totalCost - t.totalPaid),
    }));

    return res.status(200).json({
      season: currentSeason,
      seasonDateRange: { from: seasonFrom, to: seasonTo },
      availableSeasons: seasonSet,
      activities: seasonActivities.map((a) => ({ _id: a._id, title: a.title })),
      teams: teamDocs.map((t) => ({ _id: t._id, name: t.name })),

      totalRevenue: totals.totalRevenue,
      totalCollected: totals.totalCollected,
      totalRefunded: totals.totalRefunded,
      totalRegistered: totals.totalRegistered,

      dailyData,
      byPaymentMethod,
      collectionStatus: collection,
      teamsTable,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({ error: "Failed to load dashboard stats" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
