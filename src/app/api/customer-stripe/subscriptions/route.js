import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function GET(request) {
  try {
    const key = process.env.CUSTOMER_STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json({ error: "CUSTOMER_STRIPE_SECRET_KEY not configured" }, { status: 500 });
    }

    const customerStripe = new Stripe(key);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const starting_after = searchParams.get("starting_after") || undefined;

    const params = { limit, expand: ["data.customer"] };
    if (starting_after) params.starting_after = starting_after;

    const subscriptions = await customerStripe.subscriptions.list(params);

    return NextResponse.json({
      subscriptions: subscriptions.data,
      has_more: subscriptions.has_more,
      total: subscriptions.data.length,
    });
  } catch (error) {
    console.error("Customer subscriptions error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
