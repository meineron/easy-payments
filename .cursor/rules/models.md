---
description: Mongoose model conventions and schema patterns
globs:
  - src/models/**
---

# Mongoose Model Conventions

## File Pattern

Every model file in `src/models/` follows this exact structure:

```js
import mongoose from "mongoose";

const ModelSchema = new mongoose.Schema({
  // fields...
}, {
  timestamps: true,
});

if (mongoose.models.ModelName) {
  delete mongoose.models.ModelName;
}
export default mongoose.model("ModelName", ModelSchema);
```

## Rules

1. **Always include the hot-reload guard** — the `if (mongoose.models.X) delete` block prevents "Cannot overwrite model" errors in Next.js dev mode
2. **Use `timestamps: true`** on all top-level schemas
3. **Use `{ _id: false }` on subdocument schemas** that don't need their own ObjectId (e.g., form fields, items)
4. **Reference other models** with `mongoose.Schema.Types.ObjectId` and `ref: "ModelName"`
5. **Default export** — one model per file, default export the model

## Existing Models

| Model | File | Key fields |
|---|---|---|
| Club | `Club.js` | name, username, password, stripeAccountId, hasDirectStripeAccess, stripeSecretKey, logoUrl, language |
| Activity | `Activity.js` | clubId, title, type (Season Registration/Tryout/Camp), status (published/draft), teams[], subscriptions[], coupons[], waivers[], formSections[] |
| Team | `Team.js` | clubId, name |
| Player | `Player.js` | clubId, name, parent refs |
| Parent | `Parent.js` | clubId, name, email, phone |
| Order | `Order.js` | activityId, clubId, player/parent fields, subscription, items[], installmentSchedule[], status (pending/partial/paid/refunded/cancelled), payment tokens |
| OrderLog | `OrderLog.js` | Audit trail for order changes |
| Registration | `Registration.js` | Links order to registration flow |
| Transaction | `Transaction.js` | Payment transaction records |

## Subdocument Schemas

Activity has complex nested schemas:
- `ActivityFormSectionSchema` → contains `ActivityFormFieldSchema` (field types: input, textarea, phone, email, address, date, dropdown_single, dropdown_multi, multichoice_checkbox, radio, title_description)
- `SubscriptionSchema` → contains `SubscriptionItemSchema`, `ReductionRowSchema`
- `CouponSchema` — types: fixed, percentage, greater_than
- `WaiverSchema` — title, contentHtml, isRequired

Order has:
- `OrderItemSchema` — name, priceCents, quantity, isDiscount
- `InstallmentSchema` — number, date, amountCents, status

## Amounts

All monetary values are stored in **cents** (integer): `priceCents`, `totalCostCents`, `paidCents`, `amountCents`, etc.
