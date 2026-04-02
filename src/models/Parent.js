import mongoose from "mongoose";

const ParentSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
  },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  phonePrefix: { type: String, default: "+1", trim: true },
  phone: { type: String, required: true, trim: true },
  emailVerified: { type: Boolean, default: false },
  emailVerifiedAt: { type: Date, default: null },
  invitedAt: { type: Date, default: null },
  inviteToken: { type: String, default: null },
  players: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
  }],
}, {
  timestamps: true,
});

ParentSchema.index({ clubId: 1, email: 1 }, { unique: true });

if (mongoose.models.Parent) {
  delete mongoose.models.Parent;
}
export default mongoose.model("Parent", ParentSchema);
