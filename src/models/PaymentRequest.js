import mongoose from "mongoose";

const PaymentRequestItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  amountCents: { type: Number, default: 0 },
}, { _id: false });

const PaymentRequestSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true },

  items: [PaymentRequestItemSchema],
  totalCents: { type: Number, default: 0 },
  paidCents: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ["pending", "paid", "cancelled"],
    default: "pending",
  },

  recipientEmail: { type: String, default: "" },
  recipientName: { type: String, default: "" },
  sendMethod: {
    type: String,
    enum: ["parent1", "parent2", "custom", "copy_only"],
    default: "copy_only",
  },

  paymentToken: { type: String, default: null, unique: true, sparse: true },
  stripeSessionId: { type: String, default: "" },
  stripePaymentIntentId: { type: String, default: "" },

  note: { type: String, default: "" },
  sentAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, {
  timestamps: true,
});

PaymentRequestSchema.index({ orderId: 1, clubId: 1 });
PaymentRequestSchema.index({ paymentToken: 1 }, { sparse: true });

if (mongoose.models.PaymentRequest) {
  delete mongoose.models.PaymentRequest;
}
export default mongoose.model("PaymentRequest", PaymentRequestSchema);
