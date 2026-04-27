import { getClubStripe } from "@/lib/get-club-stripe";

async function _GET(req, res) {
  try {
    const { searchParams } = new URL(request.url);
    const clubId = searchParams.get("clubId") || undefined;
    const stripe = await getClubStripe(clubId);
    if (!stripe) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const limit = parseInt(searchParams.get("limit") || "25", 10);

    const links = await stripe.paymentLinks.list({
      limit,
      expand: ["data.line_items"],
    });

    return res.status(200).json({
      paymentLinks: links.data,
      has_more: links.has_more,
    });
  } catch (error) {
    console.error("List payment links error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function _POST(req, res) {
  try {
    const body = req.body;
    const stripe = await getClubStripe(body.clubId);
    if (!stripe) {
      return res.status(401).json({ error: "Unauthorized" });
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
      return res.status(400).json({ error: "Either priceId or inlinePrice is required" });
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

    return res.status(201).json({ paymentLink: link });
  } catch (error) {
    console.error("Create payment link error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "POST") {
    return _POST(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
