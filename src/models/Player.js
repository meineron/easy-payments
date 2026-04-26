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
  registrationDate: {
    type: Date,
    default: null,
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
  // Stored as a plain "YYYY-MM-DD" string. See `src/lib/dob.js`.
  dateOfBirth: { type: String, default: null },
  gender: { type: String, enum: ["Male", "Female", ""], default: "" },
  primaryPosition: { type: String, trim: true, default: "" },
  secondaryPosition: { type: String, trim: true, default: "" },
  school: { type: String, trim: true, default: "" },
  joinDate: { type: Date, default: null },
  phonePrefix: { type: String, trim: true, default: "+1" },
  phoneNumber: { type: String, trim: true, default: "" },
  address: { type: String, trim: true, default: "" },
  city: { type: String, trim: true, default: "" },
  state: { type: String, trim: true, default: "" },
  zip: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, lowercase: true, default: "" },
  previousId: { type: String, trim: true, default: "" },
  extraData: { type: mongoose.Schema.Types.Mixed, default: {} },
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

// Factory: returns a Player model bound to a specific connection. Use this
// from `getClubContext()` when reading/writing tenant data — the connection
// returned by `getTenantConn()` may be the main DB (legacy) or a per-club DB
// (migrated). The default export below stays for backward compatibility with
// every existing import; both points at the SAME schema.
export function getPlayerModel(conn) {
  return conn.models.Player || conn.model("Player", PlayerSchema);
}

if (mongoose.models.Player) {
  delete mongoose.models.Player;
}
export default mongoose.model("Player", PlayerSchema);
