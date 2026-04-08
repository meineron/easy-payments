import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import mongoose from "mongoose";
import Activity from "@/models/Activity";
import Order from "@/models/Order";
import Transaction from "@/models/Transaction";

function buildSeasonFilter(clubId, seasonActivities, params) {
  const activityIds = seasonActivities.map((a) => a._id);
  const toOid = (id) => new mongoose.Types.ObjectId(String(id));

  const match = {
    clubId: toOid(clubId),
    activityId: { $in: activityIds.map((id) => toOid(id)) },
    status: { $nin: ["cancelled"] },
  };

  const activityIdsParam = params.get("activityIds");
  if (activityIdsParam) {
    const ids = activityIdsParam.split(",").filter(Boolean);
    const filtered = ids.filter((id) => activityIds.some((sid) => String(sid) === id));
    if (filtered.length > 0) {
      match.activityId = { $in: filtered.map((id) => toOid(id)) };
    }
  }

  const teamIdsParam = params.get("teamIds");
  if (teamIdsParam) {
    const tids = teamIdsParam.split(",").filter(Boolean);
    match.teamId = { $in: tids.map((id) => toOid(id)) };
  }

  const paymentMethodsParam = params.get("paymentMethods");
  if (paymentMethodsParam) {
    const methods = paymentMethodsParam.split(",").filter(Boolean);
    match["installmentSchedule.paymentMethod"] = { $in: methods };
  }

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo + "T23:59:59.999Z");
  }

  return match;
}

async function getRegistrations(match, params) {
  const statusFilter = params.get("status");
  if (statusFilter) {
    match.status = statusFilter;
  }

  const search = params.get("search");
  if (search) {
    const regex = new RegExp(search, "i");
    match.$or = [
      { playerFirstName: regex },
      { playerLastName: regex },
      { parent1FirstName: regex },
      { parent1LastName: regex },
      { parent1Email: regex },
    ];
  }

  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Order.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teamId", "name")
      .populate("activityId", "title")
      .lean(),
    Order.countDocuments(match),
  ]);

  return {
    rows: rows.map((o) => ({
      _id: o._id,
      playerFirstName: o.playerFirstName,
      playerLastName: o.playerLastName,
      playerPhone: o.playerPhone,
      playerEmail: o.playerEmail,
      parent1FirstName: o.parent1FirstName,
      parent1LastName: o.parent1LastName,
      parent1Phone: o.parent1Phone,
      parent1Email: o.parent1Email,
      teamName: o.teamId?.name || "",
      activityTitle: o.activityId?.title || "",
      subscriptionTitle: o.subscriptionTitle,
      totalCostCents: o.totalCostCents,
      paidCents: o.paidCents,
      status: o.status,
      paymentMethod: o.installmentSchedule?.[0]?.paymentMethod || "card",
      createdAt: o.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

async function getTransactions(clubId, seasonActivities, params) {
  const toOid = (id) => new mongoose.Types.ObjectId(String(id));
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const txMatch = { clubId: toOid(clubId) };

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (dateFrom || dateTo) {
    txMatch.createdAt = {};
    if (dateFrom) txMatch.createdAt.$gte = new Date(dateFrom);
    if (dateTo) txMatch.createdAt.$lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const activityIds = seasonActivities.map((a) => String(a._id));

  const [rows, total] = await Promise.all([
    Transaction.find(txMatch)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "orderId",
        select:
          "playerFirstName playerLastName parent1FirstName parent1LastName parent1Phone parent1Email teamId activityId subscriptionTitle totalCostCents paidCents installmentSchedule",
        populate: [
          { path: "teamId", select: "name" },
          { path: "activityId", select: "title" },
        ],
      })
      .lean(),
    Transaction.countDocuments(txMatch),
  ]);

  const searchTerm = (params.get("search") || "").trim().toLowerCase();

  const filtered = rows.filter((tx) => {
    const inSeason = !tx.orderId || activityIds.includes(String(tx.orderId.activityId?._id || tx.orderId.activityId));
    if (!inSeason) return false;
    if (!searchTerm) return true;
    const order = tx.orderId;
    const haystack = [
      tx.customerEmail,
      order?.playerFirstName, order?.playerLastName,
      order?.parent1FirstName, order?.parent1LastName,
      order?.parent1Email, order?.parent1Phone,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchTerm);
  });

  return {
    rows: filtered.map((tx) => {
      const order = tx.orderId;
      const actId = order?.activityId?._id || order?.activityId;
      return {
        _id: tx._id,
        orderId: order ? String(order._id) : null,
        activityId: actId ? String(actId) : null,
        amount: tx.amount,
        status: tx.status,
        currency: tx.currency,
        customerEmail: tx.customerEmail,
        createdAt: tx.createdAt,
        invoiceUrl: tx.invoiceUrl,
        invoicePdf: tx.invoicePdf,
        playerFirstName: order?.playerFirstName || "",
        playerLastName: order?.playerLastName || "",
        parent1FirstName: order?.parent1FirstName || "",
        parent1LastName: order?.parent1LastName || "",
        parent1Phone: order?.parent1Phone || "",
        parent1Email: order?.parent1Email || tx.customerEmail || "",
        teamName: order?.teamId?.name || "",
        activityTitle: order?.activityId?.title || "",
        subscriptionTitle: order?.subscriptionTitle || "",
        totalCostCents: order?.totalCostCents || 0,
        paidCents: order?.paidCents || 0,
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

async function getLateDue(match, params) {
  delete match.status;

  const search = params.get("search");
  if (search) {
    const regex = new RegExp(search, "i");
    match.$or = [
      { playerFirstName: regex },
      { playerLastName: regex },
      { parent1FirstName: regex },
      { parent1LastName: regex },
    ];
  }

  const now = new Date();
  match.paidCents = { $gt: 0 };
  match["installmentSchedule"] = {
    $elemMatch: {
      date: { $lt: now },
      status: { $in: ["pending", "failed"] },
    },
  };

  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Order.find(match)
      .sort({ "installmentSchedule.date": 1 })
      .skip(skip)
      .limit(limit)
      .populate("teamId", "name")
      .populate("activityId", "title")
      .lean(),
    Order.countDocuments(match),
  ]);

  return {
    rows: rows.map((o) => {
      const overdueInst = (o.installmentSchedule || []).find(
        (i) => new Date(i.date) < now && (i.status === "pending" || i.status === "failed")
      );
      const daysOverdue = overdueInst
        ? Math.floor((now - new Date(overdueInst.date)) / 86400000)
        : 0;

      return {
        _id: o._id,
        playerFirstName: o.playerFirstName,
        playerLastName: o.playerLastName,
        parent1FirstName: o.parent1FirstName,
        parent1LastName: o.parent1LastName,
        parent1Phone: o.parent1Phone,
        parent1Email: o.parent1Email,
        teamName: o.teamId?.name || "",
        activityTitle: o.activityId?.title || "",
        subscriptionTitle: o.subscriptionTitle,
        totalCostCents: o.totalCostCents,
        paidCents: o.paidCents,
        overdueAmount: overdueInst?.amountCents || 0,
        overdueDate: overdueInst?.date || null,
        overdueStatus: overdueInst?.status || "pending",
        paymentMethod: overdueInst?.paymentMethod || "card",
        daysOverdue,
      };
    }),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clubId = session.user.id;
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "registrations";
    const seasonParam = searchParams.get("season");

    await dbConnect();

    const allActivities = await Activity.find({ clubId }, "title season startDate endDate teams")
      .sort({ createdAt: -1 })
      .lean();

    const seasonSet = [...new Set(allActivities.map((a) => a.season).filter(Boolean))];
    const currentSeason = seasonParam || seasonSet[0] || "";

    const seasonActivities = currentSeason
      ? allActivities.filter((a) => a.season === currentSeason)
      : allActivities;

    let result;
    if (tab === "transactions") {
      result = await getTransactions(clubId, seasonActivities, searchParams);
    } else if (tab === "late_due") {
      const match = buildSeasonFilter(clubId, seasonActivities, searchParams);
      result = await getLateDue(match, searchParams);
    } else {
      const match = buildSeasonFilter(clubId, seasonActivities, searchParams);
      result = await getRegistrations(match, searchParams);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Dashboard records error:", error);
    return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
  }
}
