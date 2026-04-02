import mongoose from "mongoose";

const PlayerTeamSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: true,
  },
  season: {
    type: String,
    required: true,
  },
}, { _id: false });

const PlayerSchema = new mongoose.Schema({
  clubId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Club",
    required: true,
    index: true,
  },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, enum: ["Male", "Female", ""], default: "" },
  primaryPosition: { type: String, trim: true, default: "" },
  secondaryPosition: { type: String, trim: true, default: "" },
  school: { type: String, trim: true, default: "" },
  joinDate: { type: Date, default: null },
  phoneNumber: { type: String, trim: true, default: "" },
  address: { type: String, trim: true, default: "" },
  city: { type: String, trim: true, default: "" },
  state: { type: String, trim: true, default: "" },
  zip: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, lowercase: true, default: "" },
  registrationTeamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    default: null,
  },
  teams: [PlayerTeamSchema],
  parents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Parent",
  }],
}, {
  timestamps: true,
});

PlayerSchema.index(
  { clubId: 1, firstName: 1, lastName: 1, dateOfBirth: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
  }
);

if (mongoose.models.Player) {
  delete mongoose.models.Player;
}
export default mongoose.model("Player", PlayerSchema);
