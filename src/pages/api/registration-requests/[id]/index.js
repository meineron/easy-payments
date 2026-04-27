import { getClubContext, dualSave } from "@/lib/club-context";

async function _PUT(req, res) {
  try {
    const { session, ctx, error } = await getClubContext(req, res);
    if (error) return res.status(200).json(error.body, { status: error.status });
    const { RegistrationRequest } = ctx.models;

    const { id } = req.query;
    const body = req.body;

    const req = await RegistrationRequest.findOne({ _id: id, clubId: ctx.clubId });
    if (!req) return res.status(404).json({ error: "Request not found" });

    if (body.status && ["open", "responded", "closed"].includes(body.status)) {
      req.status = body.status;
      if (body.status === "responded" || body.status === "closed") {
        req.respondedAt = new Date();
        req.respondedBy = session.user.name || session.user.userId || session.user.id;
      }
    }

    await dualSave(ctx, req);
    return res.status(200).json({ request: req });
  } catch (error) {
    console.error("Update registration request error:", error);
    return res.status(500).json({ error: "Failed to update request" });
  }
}
export default async function handler(req, res) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });
  return _PUT(req, res);
}
