import mongoose from "mongoose";

// Audit trail for the per-club DB migration (Phase 4). Written by the migration
// CLI as it copies collections from the main DB into each `club_<clubId>` DB
// and as the dual-write router records each shadow write.
const MigrationLogSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  phase: {
    type: String,
    enum: ["copy", "verify", "flip", "shadow_write_error", "rollback"],
    required: true,
  },
  collection: { type: String, default: null },
  message: { type: String, default: "" },
  detail: { type: mongoose.Schema.Types.Mixed, default: null },
  // Counts for copy/verify phases.
  scanned: { type: Number, default: null },
  copied: { type: Number, default: null },
  matched: { type: Number, default: null },
  level: {
    type: String,
    enum: ["info", "warn", "error"],
    default: "info",
  },
}, {
  timestamps: true,
});

if (mongoose.models.MigrationLog) {
  delete mongoose.models.MigrationLog;
}
export default mongoose.model("MigrationLog", MigrationLogSchema);
