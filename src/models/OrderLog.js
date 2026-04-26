import mongoose from "mongoose";

const OrderLogSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity", required: true, index: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club", required: true },
  userId: { type: String, required: true },
  userName: { type: String, default: "" },

  field: { type: String, required: true },
  previousValue: { type: String, default: "" },
  newValue: { type: String, default: "" },
  description: { type: String, default: "" },
}, {
  timestamps: true,
});

OrderLogSchema.index({ activityId: 1, createdAt: -1 });
OrderLogSchema.index({ orderId: 1, createdAt: -1 });

export function getOrderLogModel(conn) {
  return conn.models.OrderLog || conn.model("OrderLog", OrderLogSchema);
}

if (mongoose.models.OrderLog) {
  delete mongoose.models.OrderLog;
}
export default mongoose.model("OrderLog", OrderLogSchema);
