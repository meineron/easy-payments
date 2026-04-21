import mongoose from "mongoose";

const RegistrationSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: true,
    index: true,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Parent",
    default: null,
  },

  parentFirstName: { type: String, required: true, trim: true },
  parentLastName: { type: String, required: true, trim: true },
  parentEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  parentPhonePrefix: { type: String, default: "+1", trim: true },
  parentPhone: { type: String, required: true, trim: true },

  playerFirstName: { type: String, required: true, trim: true },
  playerLastName: { type: String, required: true, trim: true },
  playerAddress: { type: String, required: true, trim: true },
  playerCity: { type: String, required: true, trim: true },
  playerState: { type: String, required: true, trim: true },
  playerZip: { type: String, required: true, trim: true },
  // Stored as a plain "YYYY-MM-DD" string. See `src/lib/dob.js`.
  playerDob: { type: String, default: null },

  subscriptionCostCents: { type: Number, required: true },
  discountCents: { type: Number, default: 0 },
  finalCostCents: { type: Number, required: true },
  hasLoyaltyDiscount: { type: Boolean, default: false },
  numPayments: { type: Number, required: true, min: 1 },

  collectedCents: { type: Number, default: 0 },
  stripeSessionId: { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "active", "completed", "failed"],
    default: "pending",
  },
}, {
  timestamps: true,
});

if (mongoose.models.Registration) {
  delete mongoose.models.Registration;
}
export default mongoose.model("Registration", RegistrationSchema);
