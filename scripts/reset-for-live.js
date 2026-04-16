/**
 * Reset database for Stripe live mode.
 *
 * Clears all sandbox payment data while preserving player registrations,
 * activities, subscriptions, and pricing. After running, update .env.local
 * with live Stripe keys.
 *
 * Run:  node scripts/reset-for-live.js
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not found in .env.local");
  process.exit(1);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (ans) => { rl.close(); res(ans); }));
}

async function reset() {
  console.log("Connecting to MongoDB...");
  console.log(`URI: ${MONGODB_URI.replace(/\/\/.*@/, "//***@")}\n`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const orders = db.collection("orders");
  const transactions = db.collection("transactions");
  const paymentrequests = db.collection("paymentrequests");
  const orderlogs = db.collection("orderlogs");
  const registrations = db.collection("registrations");
  const clubs = db.collection("clubs");

  // ── Print current counts ──────────────────────────────────────────
  const counts = {
    orders: await orders.countDocuments(),
    transactions: await transactions.countDocuments(),
    paymentRequests: await paymentrequests.countDocuments(),
    orderLogs: await orderlogs.countDocuments(),
    registrations: await registrations.countDocuments(),
    clubs: await clubs.countDocuments(),
  };

  const paidOrders = await orders.countDocuments({ status: { $in: ["paid", "partial"] } });
  const clubsWithStripe = await clubs.countDocuments({
    $or: [
      { stripeAccountId: { $ne: null, $exists: true } },
      { stripeSecretKey: { $ne: null, $exists: true } },
    ],
  });

  console.log("=== Current Database State ===");
  console.log(`  Orders:           ${counts.orders}  (${paidOrders} paid/partial)`);
  console.log(`  Transactions:     ${counts.transactions}  (will be DELETED)`);
  console.log(`  PaymentRequests:  ${counts.paymentRequests}  (will be DELETED)`);
  console.log(`  OrderLogs:        ${counts.orderLogs}  (will be DELETED)`);
  console.log(`  Registrations:    ${counts.registrations}  (legacy, will be DELETED)`);
  console.log(`  Clubs:            ${counts.clubs}  (${clubsWithStripe} with Stripe credentials)`);
  console.log("");

  console.log("This script will:");
  console.log("  1. Reset ALL orders to pending (clear Stripe IDs, paidCents, installments)");
  console.log("  2. Delete ALL transactions");
  console.log("  3. Delete ALL payment requests");
  console.log("  4. Delete ALL order logs");
  console.log("  5. Delete ALL legacy registrations");
  console.log("  6. Reset Stripe credentials on ALL clubs (for live re-onboarding)");
  console.log("");
  console.log("Preserved: players, teams, activities, parents, order pricing/subscriptions");
  console.log("");

  const answer = await ask("Type YES to proceed: ");
  if (answer.trim() !== "YES") {
    console.log("Aborted.");
    await mongoose.disconnect();
    return;
  }

  console.log("\n--- Running reset ---\n");

  // ── 1. Reset Orders ───────────────────────────────────────────────
  const orderResult = await orders.updateMany({}, {
    $set: {
      status: "pending",
      paidCents: 0,
      refundedCents: 0,
      stripeSessionId: "",
      stripePaymentIntentId: "",
      stripeCustomerId: "",
      stripeSubscriptionId: "",
      installmentSchedule: [],
      chosenInstallments: 1,
      installmentFeeCents: 0,
      processingFeeCents: 0,
      registrationCompletedAt: null,
      invoiceSentAt: null,
      linkSentAt: null,
      paymentLinkSentAt: null,
      paymentToken: null,
      registrationToken: null,
      registrationTokenExpiresAt: null,
      waiverConsents: [],
    },
  });
  console.log(`Orders reset:          ${orderResult.modifiedCount} modified`);

  // ── 2. Delete Transactions ────────────────────────────────────────
  const txResult = await transactions.deleteMany({});
  console.log(`Transactions deleted:  ${txResult.deletedCount}`);

  // ── 3. Delete PaymentRequests ─────────────────────────────────────
  const prResult = await paymentrequests.deleteMany({});
  console.log(`PaymentRequests deleted: ${prResult.deletedCount}`);

  // ── 4. Delete OrderLogs ───────────────────────────────────────────
  const logResult = await orderlogs.deleteMany({});
  console.log(`OrderLogs deleted:     ${logResult.deletedCount}`);

  // ── 5. Delete legacy Registrations ────────────────────────────────
  const regResult = await registrations.deleteMany({});
  console.log(`Registrations deleted: ${regResult.deletedCount}`);

  // ── 6. Reset Club Stripe credentials ──────────────────────────────
  const clubResult = await clubs.updateMany({}, {
    $set: {
      stripeAccountId: null,
      onboardingComplete: false,
      hasDirectStripeAccess: false,
      stripeSecretKey: null,
      stripeWebhookSecret: null,
    },
  });
  console.log(`Clubs reset:           ${clubResult.modifiedCount} modified`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n=== Reset Complete ===");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Update .env.local with LIVE Stripe keys:");
  console.log("     STRIPE_SECRET_KEY=sk_live_...");
  console.log("     STRIPE_PUBLISHABLE_KEY=pk_live_...");
  console.log("     STRIPE_WEBHOOK_SECRET=whsec_...  (from live webhook endpoint)");
  console.log("");
  console.log("  2. Register a live webhook at https://dashboard.stripe.com/webhooks");
  console.log("     URL: https://your-domain.com/api/stripe/webhook");
  console.log("     Events: checkout.session.completed, invoice.paid, invoice.payment_failed");
  console.log("");
  console.log("  3. Re-onboard clubs with direct Stripe access from the admin panel");
  console.log("");

  await mongoose.disconnect();
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
