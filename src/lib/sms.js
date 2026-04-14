import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const clients = {};

function getClient(region) {
  if (!clients[region]) {
    clients[region] = new SNSClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_SNS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SNS_SECRET_ACCESS_KEY,
      },
    });
  }
  return clients[region];
}

function regionForPhone(phone) {
  if (phone.startsWith("+1")) return process.env.AWS_SNS_REGION_US || "us-east-1";
  return process.env.AWS_SNS_REGION_DEFAULT || "eu-central-1";
}

/**
 * Accepts (prefix, phone) OR a single combined string and returns E.164.
 * Handles: "+18191234567", "18191234567", prefix="+1" phone="8191234567",
 * prefix="" phone="18191234567" (detects leading 1), phone with leading 0, etc.
 */
function toE164(phonePrefix, phone) {
  if (!phone && !phonePrefix) return null;
  let raw = `${phonePrefix || ""}${phone || ""}`.replace(/[\s\-().]/g, "");
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return `+1${digits}`;
}

const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

/**
 * Split a raw phone string into { prefix, phone }.
 * Useful for populating prefix+phone fields from flat stored values.
 */
function splitPhone(raw) {
  if (!raw) return { prefix: "+1", phone: "" };
  const s = String(raw).trim();
  const prefixMatch = s.match(/^(\+\d{1,4})\s*(.*)/);
  if (prefixMatch) {
    const pfx = prefixMatch[1];
    const rest = prefixMatch[2].replace(/\D/g, "");
    if (PHONE_PREFIXES.includes(pfx)) return { prefix: pfx, phone: rest };
    return { prefix: pfx, phone: rest };
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return { prefix: "+1", phone: digits.slice(1) };
  }
  return { prefix: "+1", phone: digits };
}

export async function sendSMS({ to, message }) {
  if (!to || !message) throw new Error("Phone number and message are required");

  const region = regionForPhone(to);
  console.log(`[SMS] Sending to: ${to}, region: ${region}, message length: ${message.length}`);
  const client = getClient(region);
  const command = new PublishCommand({
    PhoneNumber: to,
    Message: message,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
    },
  });

  const result = await client.send(command);
  console.log(`[SMS] Result for ${to}: MessageId=${result.MessageId}, StatusCode=${result.$metadata?.httpStatusCode}`);
  return result;
}

export async function sendBulkSMS({ phoneNumbers, message }) {
  const results = { sent: 0, failed: 0, errors: [] };

  for (const phone of phoneNumbers) {
    if (!phone) { results.failed++; continue; }
    try {
      await sendSMS({ to: phone, message });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ phone, error: err.message });
    }
  }

  return results;
}

export { toE164, splitPhone, PHONE_PREFIXES };
