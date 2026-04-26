import mongoose from "mongoose";

// Global identity. One row per human, regardless of how many clubs they belong to.
// Login is by `username`. `email` is optional metadata used for invites and password reset.
//
// Lifecycle:
//   pending → club invited the email but no User credentials are set yet.
//             Recipient completes /signup?token=... to set username + password.
//   active  → can log in.
//   disabled → globally disabled by platform admin (kill switch across all clubs).
//
// Accounts only come into existence because some club invited them — there is no
// public self-signup route. A User with zero active memberships still authenticates
// (so they can see their My Clubs history and any pending invites).
const UserSchema = new mongoose.Schema({
  // Uniqueness is enforced via a partial-filter index defined below — that
  // excludes documents missing the field (or explicitly null), which is what
  // we want for users invited by email but who haven't picked a username, or
  // users without an email at all.
  username: {
    type: String,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  firstName: { type: String, trim: true, default: "" },
  lastName: { type: String, trim: true, default: "" },
  phonePrefix: { type: String, trim: true, default: "+1" },
  phone: { type: String, trim: true, default: "" },
  password: { type: String, default: null },
  temporaryPassword: { type: String, default: null },
  mustChangePassword: { type: Boolean, default: true },
  language: { type: String, enum: ["en", "he"], default: "en" },
  status: {
    type: String,
    enum: ["pending", "active", "disabled"],
    default: "pending",
    index: true,
  },
  isPlatformAdmin: { type: Boolean, default: false },
  // Last clubId the user had selected. Used to restore the active club on login.
  lastActiveClubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    default: null,
  },
  // One-time token used by `/signup?token=...` to claim the account when the
  // user was created via club invite (no password yet). Cleared once consumed.
  signupToken: { type: String, default: null, index: true },
  signupTokenExpiresAt: { type: Date, default: null },
}, {
  timestamps: true,
});

// Partial-filter unique indexes: only enforce uniqueness when the field is a
// string. Avoids the sparse-unique pitfall where multiple `null` values
// collide. Both indexes are added explicitly so the older `sparse:true`
// indexes can be dropped during deployment.
UserSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } },
);
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } },
);

if (mongoose.models.User) {
  delete mongoose.models.User;
}
export default mongoose.model("User", UserSchema);
