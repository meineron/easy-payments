import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import Club from "@/models/Club";

const PASSWORD_MASK = "••••••••";

function serializeClub(club) {
  const obj = club.toObject ? club.toObject() : club;
  const {
    password: _password,
    stripeSecretKey: _stripeSecretKey,
    stripeWebhookSecret: _stripeWebhookSecret,
    smtpPassword,
    ...rest
  } = obj;
  return {
    ...rest,
    status: rest.status || "active",
    hasStripeKey: !!_stripeSecretKey,
    hasWebhookSecret: !!_stripeWebhookSecret,
    smtpPassword: smtpPassword ? PASSWORD_MASK : "",
    hasSmtpPassword: !!smtpPassword,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    return { error: res.status(401).json({ error: "Unauthorized" }) };
  }
  return { session };
}

async function _GET(req, res) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = req.query;

  await dbConnect();
  const club = await Club.findById(id);

  if (!club) {
    return res.status(404).json({ error: "Club not found" });
  }

  return res.status(200).json({ club: serializeClub(club) });
}

async function _PUT(req, res) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = req.query;

  try {
    const body = req.body;
    const {
      name,
      hasDirectStripeAccess,
      stripeSecretKey,
      stripeWebhookSecret,
      logoUrl,
      language,
      supportEmail,
      smtpHost,
      smtpPort,
      smtpEmail,
      smtpPassword,
      maxPaymentRequestInstallments,
    } = body;

    await dbConnect();
    const club = await Club.findById(id);

    if (!club) {
      return res.status(404).json({ error: "Club not found" });
    }

    const stripeSectionTouched =
      typeof hasDirectStripeAccess !== "undefined" ||
      typeof stripeSecretKey !== "undefined" ||
      typeof stripeWebhookSecret !== "undefined";

    if (stripeSectionTouched && club.onboardingComplete && !club.hasDirectStripeAccess) {
      return res.status(400).json(
        { error: "Cannot change Stripe status — this club has already completed Connect onboarding" });
    }

    if (typeof name === "string" && name.trim()) {
      club.name = name.trim();
    }

    if (typeof logoUrl !== "undefined") {
      club.logoUrl = logoUrl || null;
    }
    if (typeof language !== "undefined" && ["en", "he"].includes(language)) {
      club.language = language;
    }
    if (typeof supportEmail === "string") {
      club.supportEmail = supportEmail.trim();
    }
    if (typeof smtpHost === "string") {
      club.smtpHost = smtpHost.trim();
    }
    if (typeof smtpPort !== "undefined") {
      const parsed = parseInt(smtpPort, 10);
      club.smtpPort = Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
    }
    if (typeof smtpEmail === "string") {
      club.smtpEmail = smtpEmail.trim();
    }
    if (typeof smtpPassword === "string" && smtpPassword !== PASSWORD_MASK) {
      club.smtpPassword = smtpPassword;
    }
    if (typeof maxPaymentRequestInstallments !== "undefined") {
      const parsed = parseInt(maxPaymentRequestInstallments, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10) {
        club.maxPaymentRequestInstallments = parsed;
      }
    }

    if (stripeSectionTouched) {
      const wasDirectAccess = club.hasDirectStripeAccess;
      const wantDirectAccess = !!hasDirectStripeAccess;

      if (wasDirectAccess && !wantDirectAccess) {
        // Switching from Direct Access → Connect: create a new Express account
        const account = await stripe.accounts.create({
          type: "express",
          metadata: { clubName: club.name },
        });

        club.hasDirectStripeAccess = false;
        club.stripeSecretKey = null;
        club.stripeWebhookSecret = null;
        club.stripeAccountId = account.id;
        club.onboardingComplete = false;
      } else if (!wasDirectAccess && wantDirectAccess) {
        // Switching from Connect → Direct Access: delete the Express account
        if (!stripeSecretKey) {
          return res.status(400).json(
            { error: "Stripe secret key is required when enabling direct access" });
        }

        if (club.stripeAccountId) {
          try {
            await stripe.accounts.del(club.stripeAccountId);
          } catch (err) {
            console.error("Failed to delete Stripe account (may already be gone):", err.message);
          }
        }

        club.hasDirectStripeAccess = true;
        club.stripeSecretKey = stripeSecretKey;
        if (typeof stripeWebhookSecret === "string" && stripeWebhookSecret.trim()) {
          club.stripeWebhookSecret = stripeWebhookSecret.trim();
        }
        club.stripeAccountId = null;
        club.onboardingComplete = true;
      } else if (wantDirectAccess && wasDirectAccess) {
        // Staying on Direct Access — update the key/webhook secret if provided
        if (typeof stripeSecretKey === "string" && stripeSecretKey.trim()) {
          club.stripeSecretKey = stripeSecretKey.trim();
        }
        if (typeof stripeWebhookSecret === "string" && stripeWebhookSecret.trim()) {
          club.stripeWebhookSecret = stripeWebhookSecret.trim();
        }
      }
    }

    await club.save();

    return res.status(200).json({ club: serializeClub(club) });
  } catch (err) {
    console.error("Update club error:", err);
    return res.status(500).json({ error: "Failed to update club" });
  }
}
export default async function handler(req, res) {
  if (req.method === "GET") {
    return _GET(req, res);
  } else if (req.method === "PUT") {
    return _PUT(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
