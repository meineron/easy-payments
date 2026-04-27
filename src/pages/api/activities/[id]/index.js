import { getClubContext, dualSave, dualWrite } from "@/lib/club-context";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    try {
      const { ctx, error } = await getClubContext(req, res);
      if (error) return res.status(error.status).json(error.body);

      const activity = await ctx.models.Activity.findOne({ _id: id, clubId: ctx.clubId })
        .populate("teams.teamId", "name season gender teamType year costCents");

      if (!activity) return res.status(404).json({ error: "Activity not found" });
      return res.status(200).json({ activity });
    } catch (err) {
      console.error("Get activity error:", err);
      return res.status(500).json({ error: "Failed to get activity" });
    }
  }

  if (req.method === "PUT") {
    try {
      const { ctx, error } = await getClubContext(req, res);
      if (error) return res.status(error.status).json(error.body);

      const body = req.body;
      const activity = await ctx.models.Activity.findOne({ _id: id, clubId: ctx.clubId });
      if (!activity) return res.status(404).json({ error: "Activity not found" });

      const allowed = [
        "title", "coverImage", "description", "type", "season", "hasPayment",
        "startDate", "endDate", "lastRegisterDate",
        "status", "registrationType", "hiddenLink", "onlyAssignedPlayers", "playerAssignment",
        "teams", "formSections", "subscriptions", "coupons", "waivers",
        "waiverEmailConfirmation",
        "passStripeFeeToCustomer", "afterRegistrationMessage",
        "registrationInvitation",
      ];

      for (const key of allowed) {
        if (body[key] !== undefined) activity[key] = body[key];
      }

      await dualSave(ctx, activity);

      const populated = await ctx.models.Activity.findById(activity._id)
        .populate("teams.teamId", "name season gender teamType year costCents");

      return res.status(200).json({ activity: populated });
    } catch (err) {
      console.error("Update activity error:", err);
      return res.status(500).json({ error: "Failed to update activity" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { ctx, error } = await getClubContext(req, res);
      if (error) return res.status(error.status).json(error.body);

      const result = await dualWrite(ctx, (M) => M.Activity.deleteOne({ _id: id, clubId: ctx.clubId }));
      if (result.deletedCount === 0) return res.status(404).json({ error: "Activity not found" });

      return res.status(200).json({ message: "Activity deleted" });
    } catch (err) {
      console.error("Delete activity error:", err);
      return res.status(500).json({ error: "Failed to delete activity" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
