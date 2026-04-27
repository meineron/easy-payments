import { getClubContext, dualInsertMany } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const teams = await ctx.models.Team.find({ clubId: ctx.clubId }).sort({ teamType: 1, name: 1 });

    return res.status(200).json({ teams });
  } catch (error) {
    console.error("List teams error:", error);
    return res.status(500).json({ error: "Failed to list teams" });
  }
}

async function _POST(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const body = req.body;
    const items = Array.isArray(body.teams) ? body.teams : [body];

    if (items.length === 0) {
      return res.status(400).json({ error: "At least one team is required" });
    }

    const docs = [];
    for (let i = 0; i < items.length; i++) {
      const { name, season, gender, teamType, costDollars, loyaltyDiscountDollars, activityStartDate } = items[i];

      if (!name || !season) {
        return res.status(400).json({ error: `Team ${i + 1}: Name and season are required` });
      }

      if (gender && !["Male", "Female", ""].includes(gender)) {
        return res.status(400).json({ error: `Team ${i + 1}: Gender must be Male or Female` });
      }

      const costCents = costDollars ? Math.round(parseFloat(costDollars) * 100) : 0;
      const loyaltyDiscountCents = loyaltyDiscountDollars ? Math.round(parseFloat(loyaltyDiscountDollars) * 100) : 0;
      const startDate = activityStartDate ? new Date(activityStartDate) : null;

      if (activityStartDate && (!startDate || isNaN(startDate.getTime()))) {
        return res.status(400).json({ error: `Team ${i + 1}: Invalid activity start date` });
      }

      docs.push({
        clubId: ctx.clubId,
        name: name.trim(),
        season,
        gender: gender || "",
        teamType: teamType ? teamType.trim() : "",
        costCents,
        loyaltyDiscountCents: Math.max(loyaltyDiscountCents, 0),
        activityStartDate: startDate,
      });
    }

    const teams = await dualInsertMany(ctx, "Team", docs);

    return res.status(201).json({ teams });
  } catch (error) {
    console.error("Create team error:", error);
    return res.status(500).json({ error: "Failed to create teams" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
