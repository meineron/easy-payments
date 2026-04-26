import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  season: {
    type: String,
    required: true,
    default: "26/27",
  },
  gender: {
    type: String,
    enum: ["Male", "Female", ""],
    default: "",
  },
  teamType: {
    type: String,
    default: "",
    trim: true,
  },
  year: {
    type: String,
    default: "",
    trim: true,
  },
  costCents: {
    type: Number,
    default: 0,
    min: 0,
  },
  loyaltyDiscountCents: {
    type: Number,
    default: 0,
    min: 0,
  },
  activityStartDate: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Mirror new teams into PublicLookup so the unauthenticated payment-link
// route (`/api/teams/[id]/payment-link`) can resolve clubId once the owning
// club is migrated to its own DB.
async function mirrorTeamToLookup(doc) {
  if (!doc?._id || !doc?.clubId) return;
  try {
    const { recordPublicLookup } = await import("@/lib/public-lookup.js");
    await recordPublicLookup("team", String(doc._id), doc.clubId);
  } catch (err) {
    console.error("[Team] PublicLookup mirror failed:", err.message);
  }
}

TeamSchema.post("save", function (doc) { mirrorTeamToLookup(doc); });
TeamSchema.post("insertMany", function (docs) {
  if (Array.isArray(docs)) docs.forEach(mirrorTeamToLookup);
});

export function getTeamModel(conn) {
  return conn.models.Team || conn.model("Team", TeamSchema);
}

if (mongoose.models.Team) {
  delete mongoose.models.Team;
}
export default mongoose.model("Team", TeamSchema);
