import mongoose from "mongoose";

const ClubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  stripeAccountId: {
    type: String,
    default: null,
  },
  onboardingComplete: {
    type: Boolean,
    default: false,
  },
  hasDirectStripeAccess: {
    type: Boolean,
    default: false,
  },
  stripeSecretKey: {
    type: String,
    default: null,
  },
  stripeWebhookSecret: {
    type: String,
    default: null,
  },
  logoUrl: {
    type: String,
    default: null,
  },
  language: {
    type: String,
    enum: ["en", "he"],
    default: "en",
  },
  maxPaymentRequestInstallments: { type: Number, default: 10, min: 1, max: 10 },
  supportEmail: { type: String, default: "" },
  smtpHost: { type: String, default: "" },
  smtpPort: { type: Number, default: 587 },
  smtpEmail: { type: String, default: "" },
  smtpPassword: { type: String, default: "" },

  // Multi-tenancy: drives connection routing in `getTenantConn()`.
  //   legacy    → reads/writes the main shared DB (current behavior)
  //   migrating → reads main DB; writes to BOTH main DB and the club's own DB
  //   migrated  → reads/writes only the club's own DB (`dbName`)
  migrationStatus: {
    type: String,
    enum: ["legacy", "migrating", "migrated"],
    default: "legacy",
    index: true,
  },
  dbName: {
    type: String,
    default: null,
  },

  // Lifecycle state — separate from migrationStatus. `deactivated` means the
  // platform admin has soft-deleted the club: login is blocked, public flows
  // return 404, Stripe webhooks are acknowledged but ignored. Data stays put
  // and the club can be reactivated at any time.
  status: {
    type: String,
    enum: ["active", "deactivated"],
    default: "active",
    index: true,
  },
  deactivatedAt: { type: Date, default: null },
  deactivatedBy: { type: String, default: null },
  deactivationReason: { type: String, default: "" },
}, {
  timestamps: true,
});

// Default the club's own database name to `club_<_id>` when not explicitly set.
// Mongoose 9 hooks: return synchronously (or a Promise); no `next` callback.
ClubSchema.pre("save", function setDbName() {
  if (!this.dbName && this._id) {
    this.dbName = `club_${this._id.toString()}`;
  }
});

if (mongoose.models.Club) {
  delete mongoose.models.Club;
}
export default mongoose.model("Club", ClubSchema);
