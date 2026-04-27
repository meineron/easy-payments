import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";
import Team from "@/models/Team";

// Lists every Membership for the active club, joined with the corresponding
// User identity (firstName/lastName/email/phone). The shape is intentionally
// kept compatible with the legacy ClubUser response so the existing
// /dashboard/users page keeps working.
async function _GET(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();

    const memberships = await Membership.find({ clubId }).sort({ createdAt: -1 }).lean();
    if (memberships.length === 0) return res.status(200).json({ users: [] });

    const userIds = memberships.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } })
      .select("firstName lastName email phonePrefix phone language status")
      .lean();
    const userById = Object.fromEntries(users.map((u) => [String(u._id), u]));

    const teamIds = [...new Set(memberships.flatMap((m) => (m.teams || []).map((t) => String(t.teamId))))];
    const teams = teamIds.length
      ? await Team.find({ _id: { $in: teamIds } }).select("name season").lean()
      : [];
    const teamMap = Object.fromEntries(teams.map((t) => [String(t._id), t]));

    const enriched = memberships.map((m) => {
      const u = userById[String(m.userId)] || {};
      return {
        // _id refers to the Membership document — that's what the UI uses for
        // PUT/DELETE/invite calls. The User._id is on `userId` for cross-club
        // identity needs.
        _id: String(m._id),
        userId: String(m.userId),
        clubId: String(m.clubId),
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email || "",
        phonePrefix: u.phonePrefix || "+1",
        phone: u.phone || "",
        language: u.language || "en",
        mainRole: m.mainRole,
        customRoleLabel: m.customRoleLabel || "",
        status: legacyStatus(m.status),
        membershipStatus: m.status,
        invitedAt: m.invitedAt,
        acceptedAt: m.acceptedAt,
        teams: (m.teams || []).map((t) => ({
          teamId: t.teamId,
          role: t.role || "",
          teamName: teamMap[String(t.teamId)]?.name || "",
          teamSeason: teamMap[String(t.teamId)]?.season || "",
        })),
      };
    });

    return res.status(200).json({ users: enriched });
  } catch (err) {
    console.error("List club users error:", err);
    return res.status(500).json({ error: "Failed to list users" });
  }
}

// Map the new Membership status enum back to the legacy ClubUser status
// vocabulary the UI already understands. Keeping the existing UI green.
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

// Create a Membership in `pending_user` state. Also creates a User row (in
// `pending` state) when the email isn't already on the platform. The actual
// invite email is sent by POST /api/club-users/[id]/invite — same as before.
//
// Body: { firstName, lastName, email, phonePrefix, phone, mainRole,
//         customRoleLabel, language, teams }
async function _POST(req, res) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const clubId = session.user.activeClubId || session.user.id;
    await dbConnect();

    const body = req.body;
    const { firstName, lastName, email, phonePrefix, phone, mainRole, customRoleLabel, language, teams } = body;

    if (!firstName || !lastName || !email || !mainRole) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const emailLc = email.trim().toLowerCase();

    // Find or create the global User. Existing User keeps their identity —
    // we never overwrite it from a club-side form.
    let user = await User.findOne({ email: emailLc });
    if (!user) {
      user = await User.create({
        email: emailLc,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phonePrefix: phonePrefix || "+1",
        phone: phone || "",
        language: language || "en",
        status: "pending",
        mustChangePassword: true,
      });
    }

    const existing = await Membership.findOne({ userId: user._id, clubId });
    if (existing && existing.status !== "left" && existing.status !== "declined") {
      return res.status(200).json(
        { error: "This person already has a membership in this club" },
        { status: 409 },
      );
    }

    const membershipDoc = existing || new Membership({ userId: user._id, clubId });
    membershipDoc.mainRole = mainRole;
    membershipDoc.customRoleLabel = mainRole === "custom" ? (customRoleLabel || "").trim() : "";
    membershipDoc.teams = (teams || []).map((t) => ({ teamId: t.teamId, role: t.role || "" }));
    // New rows start as "pending_user" and remain so until either the club
    // sends an invite (which doesn't change status — invite just delivers
    // credentials/email) and the user explicitly accepts on /invitations.
    membershipDoc.status = "pending_user";
    membershipDoc.lastChangedBy = String(session.user.userId || clubId);
    await membershipDoc.save();

    return res.status(200).json({ user: { _id: String(membershipDoc._id), userId: String(user._id) } }, { status: 201 });
  } catch (err) {
    console.error("Create club user error:", err);
    return res.status(500).json({ error: "Failed to create user" });
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
