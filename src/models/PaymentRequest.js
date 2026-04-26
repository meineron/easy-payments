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
    enum: ["parent1", "parent2", "sms_parent1", "sms_parent2", "custom", "copy_only"],
    default: "copy_only",
  },

  paymentToken: { type: String, default: null, unique: true, sparse: true },
  stripeSessionId: { type: String, default: "" },
  stripePaymentIntentId: { type: String, default: "" },

  allowedInstallments: { type: [Number], default: [1] },
  chosenInstallments: { type: Number, default: 1 },

  note: { type: String, default: "" },
  sentAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, {
  timestamps: true,
});

PaymentRequestSchema.index({ orderId: 1, clubId: 1 });
PaymentRequestSchema.index({ paymentToken: 1 }, { sparse: true });

async function mirrorPaymentRequestTokenToLookup(doc) {
  if (!doc?.clubId || !doc?.paymentToken) return;
  try {
    const { recordPublicLookup } = await import("@/lib/public-lookup.js");
    await recordPublicLookup("paymentToken", doc.paymentToken, doc.clubId);
  } catch (err) {
    console.error("[PaymentRequest] PublicLookup mirror failed:", err.message);
  }
}

PaymentRequestSchema.post("save", function (doc) { mirrorPaymentRequestTokenToLookup(doc); });
PaymentRequestSchema.post("findOneAndUpdate", function (doc) { mirrorPaymentRequestTokenToLookup(doc); });

export function getPaymentRequestModel(conn) {
  return conn.models.PaymentRequest || conn.model("PaymentRequest", PaymentRequestSchema);
}

if (mongoose.models.PaymentRequest) {
  delete mongoose.models.PaymentRequest;
}
export default mongoose.model("PaymentRequest", PaymentRequestSchema);
