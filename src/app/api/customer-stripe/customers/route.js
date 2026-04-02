import { NextResponse } from "next/server";
import { getClubStripe } from "@/lib/get-club-stripe";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId") || undefined;
    const customerStripe = await getClubStripe(clubId);
    if (!customerStripe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const starting_after = searchParams.get("starting_after") || undefined;

    const params = { limit };
    if (starting_after) params.starting_after = starting_after;

    const customers = await customerStripe.customers.list(params);

    return NextResponse.json({
      customers: customers.data,
      has_more: customers.has_more,
      total: customers.data.length,
    });
  } catch (error) {
    console.error("Customer customers error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
