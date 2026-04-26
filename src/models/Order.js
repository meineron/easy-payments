import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  priceCents: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  isDiscount: { type: Boolean, default: false },
  // true  = item was added or edited manually via the invoice UI (never overwritten by auto-sync)
  // false = item was seeded from the subscription (replaced whenever the subscription changes, until paid)
  isManual: { type: Boolean, default: false },
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
  // Stored as a plain "YYYY-MM-DD" string. See `src/lib/dob.js`.
  playerDob: { type: String, default: null },
  playerGender: { type: String, default: "" },
  playerPhonePrefix: { type: String, default: "+1" },
  playerPhone: { type: String, default: "" },
  playerEmail: { type: String, default: "" },

  parent1FirstName: { type: String, default: "", trim: true },
  parent1LastName: { type: String, default: "", trim: true },
  parent1PhonePrefix: { type: String, default: "+1" },
  parent1Phone: { type: String, default: "" },
  parent1Email: { type: String, default: "" },
  parent2FirstName: { type: String, default: "", trim: true },
  parent2LastName: { type: String, default: "", trim: true },
  parent2PhonePrefix: { type: String, default: "+1" },
  parent2Phone: { type: String, default: "" },
  parent2Email: { type: String, default: "" },

  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
  subscriptionId: { type: String, default: "" },
  subscriptionTitle: { type: String, default: "" },
  subscriptionPriceCents: { type: Number, default: 0 },
  // Per-order override of the subscription's dueDateAmountCents (0 = fall back to subscription default).
  dueDateAmountCents: { type: Number, default: 0 },

  items: [OrderItemSchema],
  // Names of subscription-template items the admin has explicitly removed from
  // this order. The auto-sync that keeps unpaid orders in step with their
  // subscription will NOT re-add any item whose name is in this list — this is
  // the only way to "dismiss" a template-sourced line permanently.
  dismissedSubItemNames: { type: [String], default: [] },

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
  registrationEmailSentAt: { type: Date, default: null },
  linkSentAt: { type: Date, default: null },
  paymentLinkSentAt: { type: Date, default: null },

  waiverConsents: [{
    waiverId: { type: String, required: true },
    title: { type: String, default: "" },
    agreedAt: { type: Date, default: null },
    agreedByName: { type: String, default: "" },
    agreedByEmail: { type: String, default: "" },
  }],
  // Stamp for the dedicated waiver-confirmation PDF email. Used as an
  // idempotency guard so we never double-send across the ON path
  // (post-OTP-verification) and the OFF path (post-payment webhook).
  waiverConfirmationSentAt: { type: Date, default: null },
  // Set the first time the parent persists their signed waivers from step 3
  // (OFF path: /save with consents; ON path: /save after OTP verification).
  // Once set, the registration-info portion of the flow (steps 1–3) is
  // considered locked: revisiting the link takes the parent straight to the
  // Invoice step, the waiver checkboxes are read-only, and the "Back" button
  // is hidden on step 4. Payment is the only remaining action.
  waiversLockedAt: { type: Date, default: null },

  formData: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

OrderSchema.index({ activityId: 1, clubId: 1 });
OrderSchema.index({ teamId: 1 });
OrderSchema.index({ registrationToken: 1 }, { sparse: true });

// Mirror new/changed publicly-addressable tokens into the main-DB PublicLookup
// table so unauthenticated routes (`/register/...`, `/payment/...`) can resolve
// `clubId` once the owning club is migrated to its own DB. Best-effort: a
// failure here is logged but never aborts the order save.
//
// Loaded lazily to avoid a model-resolution cycle (Order.js is imported by
// the route layer, which is also where PublicLookup is registered).
async function mirrorOrderTokensToLookup(doc) {
  if (!doc?.clubId) return;
  try {
    const { recordPublicLookup } = await import("@/lib/public-lookup.js");
    if (doc.paymentToken) {
      await recordPublicLookup("paymentToken", doc.paymentToken, doc.clubId);
    }
    if (doc.registrationToken) {
      await recordPublicLookup("registrationToken", doc.registrationToken, doc.clubId);
    }
  } catch (err) {
    console.error("[Order] PublicLookup mirror failed:", err.message);
  }
}

OrderSchema.post("save", function (doc) { mirrorOrderTokensToLookup(doc); });
OrderSchema.post("findOneAndUpdate", function (doc) { mirrorOrderTokensToLookup(doc); });
OrderSchema.post("insertMany", function (docs) {
  if (Array.isArray(docs)) docs.forEach(mirrorOrderTokensToLookup);
});

export function getOrderModel(conn) {
  return conn.models.Order || conn.model("Order", OrderSchema);
}

if (mongoose.models.Order) {
  delete mongoose.models.Order;
}
export default mongoose.model("Order", OrderSchema);
