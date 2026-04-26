import mongoose from "mongoose";

const LeadLogSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
  submissionId: { type: mongoose.Schema.Types.ObjectId, ref: "LeadSubmission", default: null, index: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },

  type: {
    type: String,
    enum: [
      "submission_received",
      "comment",
      "message_sent",
      "submission_deleted",
      "lead_updated",
      "status_changed",
      "staff_notified",
      "submission_status_changed",
    ],
    required: true,
  },

  authorType: { type: String, enum: ["club", "staff", "system"], required: true },
  authorId: { type: String, default: "" },
  authorName: { type: String, default: "" },

  content: { type: String, default: "" },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

LeadLogSchema.index({ leadId: 1, createdAt: -1 });
LeadLogSchema.index({ submissionId: 1, createdAt: -1 });

export function getLeadLogModel(conn) {
  return conn.models.LeadLog || conn.model("LeadLog", LeadLogSchema);
}

if (mongoose.models.LeadLog) {
  delete mongoose.models.LeadLog;
}
export default mongoose.model("LeadLog", LeadLogSchema);
