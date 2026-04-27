import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

// GET, PUT, DELETE on Membership._id (kept as `_id` in the legacy response
// shape). User identity (firstName/lastName/email/phone/language) is stored
// on the global User row and is shared across every club they belong to;
// edits to identity fields update the User. Per-club role/teams stay on the
// Membership.
async function _GET(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();

    const { id } = req.query;
    const membership = await Membership.findOne({ _id: id, clubId })
      .populate("teams.teamId", "name season")
      .lean();
    if (!membership) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(membership.userId)
      .select("firstName lastName email phonePrefix phone language")
      .lean();

    return res.status(200).json({
      user: {
        _id: String(membership._id),
        userId: String(membership.userId),
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        email: user?.email || "",
        phonePrefix: user?.phonePrefix || "+1",
        phone: user?.phone || "",
        language: user?.language || "en",
        mainRole: membership.mainRole,
        customRoleLabel: membership.customRoleLabel || "",
        status: legacyStatus(membership.status),
        membershipStatus: membership.status,
        teams: membership.teams || [],
      },
    });
  } catch (err) {
    console.error("Get club user error:", err);
    return res.status(500).json({ error: "Failed to get user" });
  }
}

async function _PUT(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();
    const { id } = req.query;

    const membership = await Membership.findOne({ _id: id, clubId });
    if (!membership) return res.status(404).json({ error: "User not found" });

    const user = await User.findById(membership.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const body = req.body;

    // Identity fields → update the global User. NOTE: editing identity here
    // changes how this user appears in EVERY club they belong to. That is
    // intentional (it's the same person), but worth being aware of.
    if (body.firstName !== undefined) user.firstName = body.firstName.trim();
    if (body.lastName !== undefined) user.lastName = body.lastName.trim();
    if (body.email !== undefined) user.email = body.email.trim().toLowerCase();
    if (body.phonePrefix !== undefined) user.phonePrefix = body.phonePrefix;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.language !== undefined) user.language = body.language;
    await user.save();

    // Per-club role + teams + (optional) status transitions.
    if (body.mainRole !== undefined) {
      membership.mainRole = body.mainRole;
      membership.customRoleLabel = body.mainRole === "custom" ? (body.customRoleLabel || "").trim() : "";
    }
    if (body.teams !== undefined) {
      membership.teams = body.teams.map((t) => ({ teamId: t.teamId, role: t.role }));
    }

    // Allow the club to deactivate / reactivate a member from this endpoint:
    //   { status: "disabled" } → membership.status = "deactivated"
    //   { status: "active"   } → membership.status = "active"
    if (body.status !== undefined) {
      if (body.status === "disabled" && membership.status === "active") {
        membership.status = "deactivated";
        membership.deactivatedAt = new Date();
      } else if (body.status === "active" && membership.status === "deactivated") {
        membership.status = "active";
        membership.deactivatedAt = null;
      }
      membership.lastChangedBy = String(session.user.userId || clubId);
    }

    await membership.save();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Update club user error:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
}

async function _DELETE(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();
    const { id } = req.query;

    // Deleting the *Membership* removes the user from this club only; their
    // User identity (and any other club memberships) is untouched.
    const result = await Membership.deleteOne({ _id: id, clubId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete club user error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
}

function legacyStatus(s) {
  switch (s) {
    case "pending_user": return "invited";
    case "active": return "active";
    case "deactivated": return "disabled";
    case "declined": return "disabled";
    case "left": return "disabled";
    default: return "draft";
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
