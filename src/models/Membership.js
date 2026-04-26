import mongoose from "mongoose";

// Join table between User (global) and Club (tenant). Lives in the main DB.
// This is the ONLY collection that knows "user X belongs to club Y" — clubs
// query their own memberships, never see other clubs'. The same human at two
// clubs is one User with two Memberships.
//
// Status state machine (double-opt-in):
//   pending_user  ─[user accepts]──► active
//                 ─[user declines]─► declined
//   active        ─[club deactivates]─► deactivated
//                 ─[user leaves]──────► left
//   deactivated   ─[club re-activates]─► active
const MembershipTeamSchema = new mongoose.Schema({
  // Note: teamId references a Team document that lives in the *club's own DB*
  // once that club is migrated. We store the ObjectId only and resolve it via
  // a per-club connection — never via Mongoose `populate` (which can't cross
  // `useDb` connections without explicit model registration).
  teamId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, default: "" },
}, { _id: false });

const MembershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  mainRole: {
    type: String,
    required: true,
  },
  customRoleLabel: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["pending_user", "active", "declined", "deactivated", "left"],
    default: "pending_user",
    index: true,
  },
  invitedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  deactivatedAt: { type: Date, default: null },
  // Who triggered the most recent state change (a User._id, or "system" / "platform").
  lastChangedBy: { type: String, default: null },
  teams: [MembershipTeamSchema],
}, {
  timestamps: true,
});

// One membership per (user, club) pair.
MembershipSchema.index({ userId: 1, clubId: 1 }, { unique: true });

if (mongoose.models.Membership) {
  delete mongoose.models.Membership;
}
export default mongoose.model("Membership", MembershipSchema);
