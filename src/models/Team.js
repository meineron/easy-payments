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

if (mongoose.models.Team) {
  delete mongoose.models.Team;
}
export default mongoose.model("Team", TeamSchema);
