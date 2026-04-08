import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  priceCents: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  isDiscount: { type: Boolean, default: false },
}, { _id: false });

const InstallmentSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  date: { type: Date, required: true },
  amountCents: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  paymentMethod: { type: String, enum: ["card", "bank_transfer", "cash", "check"], default: "card" },
  stripeInvoiceId: { type: String, default: "" },
  paidAt: { type: Date, default: null },
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true, index: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },

  playerFirstName: { type: String, required: true, trim: true },
  playerLastName: { type: String, required: true, trim: true },
  playerDob: { type: Date, default: null },
  playerGender: { type: String, default: "" },
  playerPhone: { type: String, default: "" },
  playerEmail: { type: String, default: "" },

  parent1FirstName: { type: String, default: "", trim: true },
  parent1LastName: { type: String, default: "", trim: true },
  parent1Phone: { type: String, default: "" },
  parent1Email: { type: String, default: "" },
  parent2FirstName: { type: String, default: "", trim: true },
  parent2LastName: { type: String, default: "", trim: true },
  parent2Phone: { type: String, default: "" },
  parent2Email: { type: String, default: "" },

  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
  subscriptionId: { type: String, default: "" },
  subscriptionTitle: { type: String, default: "" },
  subscriptionPriceCents: { type: Number, default: 0 },

  items: [OrderItemSchema],

  discountType: { type: String, enum: ["none", "amount", "percentage"], default: "none" },
  discountValue: { type: Number, default: 0 },
  couponCode: { type: String, default: "" },
  couponDiscountCents: { type: Number, default: 0 },

  totalCostCents: { type: Number, default: 0 },
  installmentFeeCents: { type: Number, default: 0 },
  processingFeeCents: { type: Number, default: 0 },
  paidCents: { type: Number, default: 0 },
  refundedCents: { type: Number, default: 0 },

  chosenInstallments: { type: Number, default: 1 },
  installmentSchedule: [InstallmentSchema],
  stripeCustomerId: { type: String, default: "" },
  stripeSubscriptionId: { type: String, default: "" },

  status: {
    type: String,
    enum: ["pending", "partial", "paid", "refunded", "cancelled"],
    default: "pending",
  },

  registrationToken: { type: String, default: null, index: true, sparse: true },
  registrationTokenExpiresAt: { type: Date, default: null },
  paymentToken: { type: String, default: null, index: true, sparse: true },
  stripeSessionId: { type: String, default: "" },
  stripePaymentIntentId: { type: String, default: "" },
  registrationCompletedAt: { type: Date, default: null },
  invoiceSentAt: { type: Date, default: null },
  linkSentAt: { type: Date, default: null },
  paymentLinkSentAt: { type: Date, default: null },

  waiverConsents: [{
    waiverId: { type: String, required: true },
    title: { type: String, default: "" },
    agreedAt: { type: Date, default: null },
    agreedByName: { type: String, default: "" },
    agreedByEmail: { type: String, default: "" },
  }],

  formData: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

OrderSchema.index({ activityId: 1, clubId: 1 });
OrderSchema.index({ teamId: 1 });
OrderSchema.index({ registrationToken: 1 }, { sparse: true });

if (mongoose.models.Order) {
  delete mongoose.models.Order;
}
export default mongoose.model("Order", OrderSchema);
