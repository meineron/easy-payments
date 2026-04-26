import mongoose from "mongoose";

// Cross-club content. Lives in the main DB so it follows the user across every
// club they belong to — listing query is `{ ownerUserId: session.user.userId }`,
// regardless of which club is currently active.
//
// Future: visibility rules ("share with teammates", "fork into another club's
// playbook") can extend this without changing storage.
const ExerciseSchema = new mongoose.Schema({
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  contentHtml: { type: String, default: "" },
  tags: [{ type: String, trim: true }],
  visibility: {
    type: String,
    enum: ["private", "shared"],
    default: "private",
  },
}, {
  timestamps: true,
});

if (mongoose.models.Exercise) {
  delete mongoose.models.Exercise;
}
export default mongoose.model("Exercise", ExerciseSchema);
