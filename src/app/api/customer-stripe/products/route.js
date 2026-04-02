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

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const starting_after = searchParams.get("starting_after") || undefined;

    const params = { limit, expand: ["data.default_price"] };
    if (starting_after) params.starting_after = starting_after;

    const products = await customerStripe.products.list(params);

    return NextResponse.json({
      products: products.data,
      has_more: products.has_more,
      total: products.data.length,
    });
  } catch (error) {
    console.error("Customer products error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
