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
  smtpHost: { type: String, default: "" },
  smtpPort: { type: Number, default: 587 },
  smtpEmail: { type: String, default: "" },
  smtpPassword: { type: String, default: "" },
}, {
  timestamps: true,
});

if (mongoose.models.Club) {
  delete mongoose.models.Club;
}
export default mongoose.model("Club", ClubSchema);
