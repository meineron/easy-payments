import mongoose from "mongoose";

const ClubUserSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phonePrefix: { type: String, default: "+1", trim: true },
  phone: { type: String, default: "", trim: true },
  mainRole: { type: String, required: true },
  customRoleLabel: { type: String, default: "", trim: true },
  language: { type: String, enum: ["en", "he"], default: "en" },
  password: { type: String, default: null },
  temporaryPassword: { type: String, default: null },
  mustChangePassword: { type: Boolean, default: true },
  status: { type: String, enum: ["draft", "invited", "active", "disabled"], default: "draft" },
  invitedAt: { type: Date, default: null },
  teams: [{
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    role: { type: String },
  }],
}, { timestamps: true });

ClubUserSchema.index({ clubId: 1, email: 1 }, { unique: true });

if (mongoose.models.ClubUser) {
  delete mongoose.models.ClubUser;
}
export default mongoose.model("ClubUser", ClubUserSchema);
