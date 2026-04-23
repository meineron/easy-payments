import mongoose from "mongoose";

const LeadFormFieldSchema = new mongoose.Schema({
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

const LeadFormSectionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  fields: [LeadFormFieldSchema],
}, { _id: false });

const NotifyChannelsSchema = new mongoose.Schema({
  email: { type: Boolean, default: true },
  sms: { type: Boolean, default: false },
}, { _id: false });

const LeadSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  coverImage: { type: String, default: "" },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ["enabled", "disabled"], default: "enabled" },

  formSections: [LeadFormSectionSchema],

  notifyStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ClubUser" }],
  notifyChannels: { type: NotifyChannelsSchema, default: () => ({ email: true, sms: false }) },
}, {
  timestamps: true,
});

if (mongoose.models.Lead) {
  delete mongoose.models.Lead;
}
export default mongoose.model("Lead", LeadSchema);
