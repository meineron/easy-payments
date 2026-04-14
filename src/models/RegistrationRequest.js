import mongoose from "mongoose";

const RegistrationRequestSchema = new mongoose.Schema({
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },
  playerName: { type: String, default: "" },
  parentName: { type: String, default: "" },
  parentEmail: { type: String, default: "" },
  parentPhone: { type: String, default: "" },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ["open", "responded", "closed"],
    default: "open",
  },
  respondedAt: { type: Date, default: null },
  respondedBy: { type: String, default: "" },
}, {
  timestamps: true,
});

RegistrationRequestSchema.index({ activityId: 1, clubId: 1 });

if (mongoose.models.RegistrationRequest) {
  delete mongoose.models.RegistrationRequest;
}
export default mongoose.model("RegistrationRequest", RegistrationRequestSchema);
