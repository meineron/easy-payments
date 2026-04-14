import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import RegistrationRequest from "@/models/RegistrationRequest";

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "club") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    await dbConnect();

    const req = await RegistrationRequest.findOne({ _id: id, clubId: session.user.id });
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

    if (body.status && ["open", "responded", "closed"].includes(body.status)) {
      req.status = body.status;
      if (body.status === "responded" || body.status === "closed") {
        req.respondedAt = new Date();
        req.respondedBy = session.user.name || session.user.id;
      }
    }

    await req.save();
    return NextResponse.json({ request: req });
  } catch (error) {
    console.error("Update registration request error:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
