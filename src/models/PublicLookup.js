import mongoose from "mongoose";

// Tiny global index that resolves a public, unauthenticated request carrying
// only a globally-unique key (activity id, payment token, registration token,
// lead slug) to the clubId whose database actually holds the document.
//
// Without this, public routes like `/register/[activityId]` and `/payment/[token]`
// have no way to know which per-club DB to open. Stripe webhooks don't need it
// because Stripe metadata already carries `clubId`.
//
// kind:
//   activity            → Activity._id
//   paymentToken        → Order.paymentToken (or whichever field the public page uses)
//   registrationToken   → Order.registrationToken
//   leadSlug            → Lead.slug
//   team                → Team._id (used by /api/teams/[id]/payment-link, an
//                         unauthenticated quick-checkout flow)
const PublicLookupSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ["activity", "paymentToken", "registrationToken", "leadSlug", "team"],
    required: true,
  },
  key: { type: String, required: true },
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

PublicLookupSchema.index({ kind: 1, key: 1 }, { unique: true });

if (mongoose.models.PublicLookup) {
  delete mongoose.models.PublicLookup;
}
export default mongoose.model("PublicLookup", PublicLookupSchema);
