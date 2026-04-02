import { NextResponse } from "next/server";
import { getClubStripe } from "@/lib/get-club-stripe";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId") || undefined;
    const stripe = await getClubStripe(clubId);
    if (!stripe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const links = await stripe.paymentLinks.list({
      limit,
      expand: ["data.line_items"],
    });

    return NextResponse.json({
      paymentLinks: links.data,
      has_more: links.has_more,
    });
  } catch (error) {
    console.error("List payment links error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const stripe = await getClubStripe(body.clubId);
    if (!stripe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      priceId,
      inlinePrice,
      quantity,
      adjustableQuantity,
      submitType,
      allowPromotionCodes,
      savePaymentDetails,
      customFields,
    } = body;

    let lineItem = {};

    if (priceId) {
      lineItem.price = priceId;
    } else if (inlinePrice) {
      lineItem.price_data = {
        currency: inlinePrice.currency || "usd",
        product_data: { name: inlinePrice.name },
        unit_amount: Math.round(inlinePrice.amount * 100),
      };
      if (inlinePrice.recurring) {
        lineItem.price_data.recurring = {
          interval: inlinePrice.recurringInterval || "month",
        };
      }
    } else {
      return NextResponse.json({ error: "Either priceId or inlinePrice is required" }, { status: 400 });
    }

    lineItem.quantity = quantity || 1;

    if (adjustableQuantity?.enabled) {
      lineItem.adjustable_quantity = {
        enabled: true,
        minimum: adjustableQuantity.minimum || 1,
        maximum: adjustableQuantity.maximum || 99,
      };
    }

    const params = {
      line_items: [lineItem],
    };

    const isRecurring = !!inlinePrice?.recurring;
    if (submitType && ["pay", "book", "donate"].includes(submitType) && !isRecurring) {
      params.submit_type = submitType;
    }

    if (allowPromotionCodes) {
      params.allow_promotion_codes = true;
    }

    if (savePaymentDetails) {
      params.payment_intent_data = {
        setup_future_usage: "off_session",
      };
    }

    if (customFields && customFields.length > 0) {
      params.custom_fields = customFields
        .filter((f) => f.key && f.label)
        .map((field) => {
          const cf = {
            key: field.key.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
            label: { type: "custom", custom: field.label },
            type: field.type || "text",
          };

          if (field.optional) {
            cf.optional = true;
          }

          if (field.type === "dropdown" && field.options?.length > 0) {
            cf.dropdown = {
              options: field.options
                .filter((o) => o.label && o.value)
                .map((o) => ({ label: o.label, value: o.value })),
            };
            if (field.defaultValue) {
              cf.dropdown.default_value = field.defaultValue;
            }
          }

          if (field.type === "text" && field.defaultValue) {
            cf.text = { default_value: field.defaultValue };
          }

          if (field.type === "numeric" && field.defaultValue) {
            cf.numeric = { default_value: field.defaultValue };
          }

          return cf;
        });
    }

    const link = await stripe.paymentLinks.create(params);

    return NextResponse.json({ paymentLink: link }, { status: 201 });
  } catch (error) {
    console.error("Create payment link error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
