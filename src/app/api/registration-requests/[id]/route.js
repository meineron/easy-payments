import { NextResponse } from "next/server";
import { getClubContext, dualSave } from "@/lib/club-context";

export async function PUT(request, { params }) {
  try {
    const { session, ctx, error } = await getClubContext();
    if (error) return NextResponse.json(error.body, { status: error.status });
    const { RegistrationRequest } = ctx.models;

    const { id } = await params;
    const body = await request.json();

    const req = await RegistrationRequest.findOne({ _id: id, clubId: ctx.clubId });
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    if (body.status && ["open", "responded", "closed"].includes(body.status)) {
      req.status = body.status;
      if (body.status === "responded" || body.status === "closed") {
        req.respondedAt = new Date();
        req.respondedBy = session.user.name || session.user.userId || session.user.id;
      }
    }

    await dualSave(ctx, req);
    return NextResponse.json({ request: req });
  } catch (error) {
    console.error("Update registration request error:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
