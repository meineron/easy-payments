import { connectMain } from "@/lib/mongodb";
import { generateRegistrationPDF } from "@/lib/pdf";
import { sendRegistrationConfirmationEmail } from "@/lib/email";
import Club from "@/models/Club";
import { getClubContextById } from "@/lib/club-context";

/**
 * Generates the registration PDF and sends it to parent1 and parent2.
 * Fails silently (logs errors).
 *
 * Accepts an optional `ctx` (tenant context). If omitted, derives it from
 * `order.clubId` so legacy callers keep working.
 */
export async function sendRegistrationPDFEmail(order, ctx = null) {
  try {
    if (!ctx && order?.clubId) {
      ctx = await getClubContextById(order.clubId);
    }
    const Activity = ctx?.models?.Activity;
    await connectMain();
    const [activity, club] = await Promise.all([
      Activity
        ? Activity.findById(order.activityId, "title clubId waivers season").lean()
        : (await import("@/models/Activity")).default.findById(order.activityId, "title clubId waivers season").lean(),
      Club.findById(order.clubId, "name logoUrl language").lean(),
    ]);

    if (!activity || !club) {
      console.error("sendRegistrationPDFEmail: activity or club not found");
      return;
    }

    const orderObj = typeof order.toObject === "function" ? order.toObject() : order;
    const teamName = orderObj.teamId?.name || "";
    const playerName = `${orderObj.playerFirstName} ${orderObj.playerLastName}`;
    const locale = club.language || "en";

    const pdfBuffer = await generateRegistrationPDF({
      order: { ...orderObj, teamName },
      activity,
      clubName: club.name,
      clubLogoUrl: club.logoUrl,
      waivers: activity.waivers || [],
      locale,
    });

    const recipients = [];
    if (orderObj.parent1Email) recipients.push(orderObj.parent1Email);
    if (orderObj.parent2Email && orderObj.parent2Email !== orderObj.parent1Email) recipients.push(orderObj.parent2Email);
    if (recipients.length === 0 && orderObj.playerEmail) recipients.push(orderObj.playerEmail);

    for (const email of recipients) {
      try {
        await sendRegistrationConfirmationEmail(email, {
          playerName,
          clubName: club.name,
          activityTitle: activity.title,
          order: orderObj,
          pdfBuffer,
          logoUrl: club.logoUrl,
          locale,
        });
      } catch (e) {
        console.error(`Failed to send registration PDF to ${email}:`, e.message);
      }
    }
  } catch (error) {
    console.error("sendRegistrationPDFEmail error:", error);
  }
}
