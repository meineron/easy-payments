import { getClubContext, dualWrite } from "@/lib/club-context";

async function _GET(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { Parent, Player } = ctx.models;
    void Player;

    const { id } = req.query;

    const parent = await Parent.findOne({ _id: id, clubId: ctx.clubId })
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition school email phoneNumber");

    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }

    return res.status(200).json({ parent });
  } catch (error) {
    console.error("Get parent error:", error);
    return res.status(500).json({ error: "Failed to get parent" });
  }
}

async function _PUT(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    void ctx.models.Player;

    const { id } = req.query;
    const body = req.body;

    const updates = {};
    if (body.firstName) updates.firstName = body.firstName.trim();
    if (body.lastName) updates.lastName = body.lastName.trim();
    if (body.email) updates.email = body.email.trim();
    if (body.phonePrefix !== undefined) updates.phonePrefix = body.phonePrefix.trim();
    if (body.phone) updates.phone = body.phone.trim();

    if (body.playerIds !== undefined) {
      updates.players = body.playerIds;
    }

    const parent = await dualWrite(ctx, (M) => M.Parent.findOneAndUpdate(
      { _id: id, clubId: ctx.clubId },
      updates,
      { new: true },
    ));

    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }

    const populated = await ctx.models.Parent.findById(parent._id)
      .populate("players", "firstName lastName dateOfBirth gender primaryPosition school email phoneNumber");

    return res.status(200).json({ parent: populated });
  } catch (error) {
    console.error("Update parent error:", error);
    return res.status(500).json({ error: "Failed to update parent" });
  }
}

async function _DELETE(req, res) {
  try {
    const { ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });

    const { id } = req.query;

    const parent = await dualWrite(ctx, (M) => M.Parent.findOneAndDelete({ _id: id, clubId: ctx.clubId }));
    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }

    await dualWrite(ctx, (M) => M.Player.updateMany(
      { clubId: ctx.clubId, parents: parent._id },
      { $pull: { parents: parent._id } },
    ));

    return res.status(200).json({ message: "Parent deleted" });
  } catch (error) {
    console.error("Delete parent error:", error);
    return res.status(500).json({ error: "Failed to delete parent" });
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
