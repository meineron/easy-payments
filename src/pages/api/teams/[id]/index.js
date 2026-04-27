import { getClubContext, dualWrite } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;
    const team = await ctx.models.Team.findOne({ _id: id, clubId: ctx.clubId });

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    return res.status(200).json({ team });
  } catch (error) {
    console.error("Get team error:", error);
    return res.status(500).json({ error: "Failed to get team" });
  }
}

async function _PUT(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;
    const { name, season, gender, teamType, costDollars, loyaltyDiscountDollars, activityStartDate } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (season) updates.season = season;
    if (teamType !== undefined) updates.teamType = teamType.trim();
    if (gender !== undefined) {
      if (gender && !["Male", "Female", ""].includes(gender)) {
        return res.status(400).json({ error: "Gender must be Male or Female" });
      }
      updates.gender = gender;
    }
    if (costDollars !== undefined) {
      const costCents = Math.round(parseFloat(costDollars) * 100);
      updates.costCents = Math.max(costCents, 0);
    }
    if (loyaltyDiscountDollars !== undefined) {
      updates.loyaltyDiscountCents = Math.max(Math.round(parseFloat(loyaltyDiscountDollars) * 100) || 0, 0);
    }
    if (activityStartDate) {
      const startDate = new Date(activityStartDate);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid activity start date" });
      }
      updates.activityStartDate = startDate;
    }

    const team = await dualWrite(ctx, (M) => M.Team.findOneAndUpdate(
      { _id: id, clubId: ctx.clubId },
      updates,
      { new: true },
    ));

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    return res.status(200).json({ team });
  } catch (error) {
    console.error("Update team error:", error);
    return res.status(500).json({ error: "Failed to update team" });
  }
}

async function _DELETE(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;
    const team = await dualWrite(ctx, (M) => M.Team.findOneAndDelete({ _id: id, clubId: ctx.clubId }));

    if (!team) {
      return res.status(404).json({ error: "Team not found" });
    }

    return res.status(200).json({ message: "Team deleted" });
  } catch (error) {
    console.error("Delete team error:", error);
    return res.status(500).json({ error: "Failed to delete team" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else if (req.method === "DELETE") {
    return _DELETE(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
