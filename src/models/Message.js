import mongoose from "mongoose";

const RecipientSchema = new mongoose.Schema({
  type: { type: String, enum: ["player", "parent", "custom", "lead"], required: true },
  id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, default: "" },
  phonePrefix: { type: String, default: "" },
  phone: { type: String, default: "" },
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },
  channel: { type: String, enum: ["email", "sms"], default: "email" },
  subject: { type: String, default: "", trim: true },
  bodyHtml: { type: String, default: "" },
  bodyText: { type: String, default: "" },
  recipients: [RecipientSchema],
  recipientCount: { type: Number, default: 0 },
  fromEmail: { type: String, default: "" },
  smsNotification: { type: Boolean, default: false },
  smsNotificationText: { type: String, default: "" },
  sentAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["sent", "failed"], default: "sent" },
}, {
  timestamps: true,
});

if (mongoose.models.Message) {
  delete mongoose.models.Message;
}
export default mongoose.model("Message", MessageSchema);
