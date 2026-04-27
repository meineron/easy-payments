import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

// PATCH { action: "accept" | "decline" | "leave" }
//
// Transitions the requester's own membership document.
//   accept  : pending_user -> active   (requires status === "pending_user")
//   decline : pending_user -> declined (requires status === "pending_user")
//   leave   : active        -> left    (requires status === "active")
//
// "deactivated" is a club-side action and lives on the staff CRUD endpoint.
async function _PATCH(req, res) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.query;
  const { action } = req.body;
  if (!["accept", "decline", "leave"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  await dbConnect();
  const membership = await Membership.findOne({ _id: id, userId: session.user.userId });
  if (!membership) {
    return res.status(404).json({ error: "Invitation not found" });
  }

  const now = new Date();
  if (action === "accept") {
    if (membership.status !== "pending_user") {
      return res.status(409).json({ error: "This invitation can no longer be accepted" });
    }
    membership.status = "active";
    membership.acceptedAt = now;
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();

    // First time accepting? Make this their active club so the next page load
    // lands them on the club's dashboard without an extra step.
    const user = await User.findById(session.user.userId);
    if (user && !user.lastActiveClubId) {
      user.lastActiveClubId = membership.clubId;
      await user.save();
    }
  } else if (action === "decline") {
    if (membership.status !== "pending_user") {
      return res.status(409).json({ error: "This invitation can no longer be declined" });
    }
    membership.status = "declined";
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();
  } else if (action === "leave") {
    if (membership.status !== "active") {
      return res.status(409).json({ error: "Only active memberships can be left" });
    }
    membership.status = "left";
    membership.lastChangedBy = String(session.user.userId);
    await membership.save();
  }

  return res.status(200).json({ success: true, status: membership.status });
}
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
  return _PATCH(req, res);
}
