import { connectMain } from "@/lib/mongodb";
import { resolvePublicContext } from "@/lib/club-context";
import Club from "@/models/Club";

async function _GET(req, res) {
  try {
    const { id } = req.query;

    const ctx = await resolvePublicContext("registration", id);
    if (!ctx) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const { Registration, Team } = ctx.models;

    const reg = await Registration.findById(id);
    if (!reg) {
      return res.status(404).json({ error: "Registration not found" });
    }

    if (reg.status === "completed" || reg.status === "active") {
      return res.status(400).json({ error: "This registration is already paid" });
    }

    const team = await Team.findById(reg.teamId);
    await connectMain();
    const club = await Club.findById(reg.clubId).select("name");

    return res.status(200).json({
      registration: {
        _id: reg._id,
        parentFirstName: reg.parentFirstName,
        parentLastName: reg.parentLastName,
        parentEmail: reg.parentEmail,
        playerFirstName: reg.playerFirstName,
        playerLastName: reg.playerLastName,
        subscriptionCostCents: reg.subscriptionCostCents,
        discountCents: reg.discountCents,
        finalCostCents: reg.finalCostCents,
        hasLoyaltyDiscount: reg.hasLoyaltyDiscount,
        numPayments: reg.numPayments,
        status: reg.status,
      },
      team: team ? {
        _id: team._id,
        name: team.name,
        season: team.season,
        costCents: team.costCents,
        activityStartDate: team.activityStartDate,
      } : null,
      clubName: club?.name || "",
    });
  } catch (error) {
    console.error("Public registration fetch error:", error);
    return res.status(500).json({ error: "Failed to load registration" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return _GET(req, res);
}
