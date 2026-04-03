import mongoose from "mongoose";

const ActivityFormFieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "text", "textarea", "input", "multichoice_checkbox",
      "radio", "dropdown_single", "dropdown_multi",
      "title_description", "phone", "email", "address", "date",
    ],
    required: true,
  },
  label: { type: String, default: "" },
  description: { type: String, default: "" },
  required: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  isMust: { type: Boolean, default: false },
  options: [{ type: String }],
  order: { type: Number, default: 0 },
}, { _id: false });

const ActivityFormSectionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  fields: [ActivityFormFieldSchema],
}, { _id: false });

const ActivityTeamSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  playerLimit: { type: Number, default: null },
  ageLimitType: { type: String, enum: ["none", "yob", "range"], default: "none" },
  ageLimitYobMin: { type: Number, default: null },
  ageLimitYobMax: { type: Number, default: null },
  ageLimitDateMin: { type: Date, default: null },
  ageLimitDateMax: { type: Date, default: null },
  serialNumber: { type: String, default: "", trim: true },
}, { _id: false });

const ReductionRowSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  priceCents: { type: Number, default: 0 },
  maxInstallments: { type: Number, default: 1 },
}, { _id: false });

const SubscriptionItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  priceCents: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  isRequired: { type: Boolean, default: false },
  isDiscount: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
}, { _id: false });

const SubscriptionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  priceCents: { type: Number, default: 0 },
  dueDateAmountCents: { type: Number, default: 0 },
  maxInstallments: { type: Number, default: 1 },
  firstInstallmentDate: { type: Date, default: null },
  months: { type: Number, default: 10 },
  hasReduction: { type: Boolean, default: false },
  reductionSchedule: [ReductionRowSchema],
  includedTeamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Team" }],
  items: [SubscriptionItemSchema],
  paymentTypes: {
    card: { type: Boolean, default: true },
    bankTransfer: { type: Boolean, default: false },
    cash: { type: Boolean, default: false },
    check: { type: Boolean, default: false },
  },
  paymentMessages: {
    card: { type: String, default: "" },
    bankTransfer: { type: String, default: "Payment will not be completed until confirmed by the office" },
    cash: { type: String, default: "Please turn into the office and complete payment" },
    check: { type: String, default: "Please turn into the office and complete payment" },
  },
});

const CouponSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  type: { type: String, enum: ["fixed", "percentage", "greater_than"], required: true },
  amount: { type: Number, default: 0 },
  duration: { type: String, enum: ["one_time", "x_times", "until_date", "unlimited"], default: "one_time" },
  maxUses: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
});

const ActivitySchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },

  title: { type: String, required: true, trim: true },
  coverImage: { type: String, default: "" },
  description: { type: String, default: "" },
  type: {
    type: String,
    enum: ["Season Registration", "Tryout", "Camp"],
    default: "Season Registration",
  },
  season: { type: String, default: "", trim: true },
  hasPayment: { type: Boolean, default: false },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  lastRegisterDate: { type: Date, default: null },

  status: { type: String, enum: ["published", "draft"], default: "draft" },
  registrationType: { type: String, enum: ["public", "login"], default: "public" },
  hiddenLink: { type: Boolean, default: false },
  onlyAssignedPlayers: { type: Boolean, default: false },
  playerAssignment: { type: String, enum: ["auto", "after_paid", "manual"], default: "manual" },

  teams: [ActivityTeamSchema],
  formSections: [ActivityFormSectionSchema],
  subscriptions: [SubscriptionSchema],
  coupons: [CouponSchema],

  afterRegistrationMessage: { type: String, default: "" },
}, {
  timestamps: true,
});

if (mongoose.models.Activity) {
  delete mongoose.models.Activity;
}
export default mongoose.model("Activity", ActivitySchema);
