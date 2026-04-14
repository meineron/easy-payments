import dbConnect from "@/lib/mongodb";
import { generateRegistrationPDF } from "@/lib/pdf";
import { sendRegistrationConfirmationEmail } from "@/lib/email";
import Activity from "@/models/Activity";
import Club from "@/models/Club";

/**
 * Generates the registration PDF and sends it to parent1 and parent2.
 * Fails silently (logs errors).
 */
export async function sendRegistrationPDFEmail(order) {
  try {
    await dbConnect();
    const [activity, club] = await Promise.all([
      Activity.findById(order.activityId, "title clubId waivers season").lean(),
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
