import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    default: null,
    index: true,
  },
  stripeSessionId: {
    type: String,
    required: true,
    unique: true,
  },
  stripePaymentIntentId: {
    type: String,
    default: null,
  },
  amount: {
    type: Number,
    required: true,
  },
  applicationFee: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: "usd",
  },
  status: {
    type: String,
    enum: ["succeeded", "pending", "failed"],
    default: "pending",
  },
  invoiceUrl: {
    type: String,
    default: null,
  },
  invoicePdf: {
    type: String,
    default: null,
  },
  customerEmail: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

if (mongoose.models.Transaction) {
  delete mongoose.models.Transaction;
}
export default mongoose.model("Transaction", TransactionSchema);
