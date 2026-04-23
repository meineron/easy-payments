import mongoose from "mongoose";

const LeadSubmissionSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true, index: true },

  name: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true, lowercase: true, index: true },
  phonePrefix: { type: String, default: "", trim: true },
  phone: { type: String, default: "", trim: true },

  responses: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

LeadSubmissionSchema.index({ leadId: 1, createdAt: -1 });

if (mongoose.models.LeadSubmission) {
  delete mongoose.models.LeadSubmission;
}
export default mongoose.model("LeadSubmission", LeadSubmissionSchema);
