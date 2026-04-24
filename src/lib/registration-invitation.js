import en from "@/messages/en.json";
import he from "@/messages/he.json";

const messages = { en, he };

function getMessage(locale, key) {
  return messages[locale]?.activityDetail?.[key]
    ?? messages.en.activityDetail?.[key]
    ?? "";
}

export function getDefaultInvitationSubject(locale = "en") {
  return getMessage(locale, "registrationInvitationDefaultSubject");
}

export function getDefaultInvitationEmailHtml(locale = "en") {
  return getMessage(locale, "registrationInvitationDefaultBody");
}

export function getDefaultInvitationSms(locale = "en") {
  return getMessage(locale, "registrationInvitationDefaultSms");
}

const COVER_IMAGE_STYLE = "max-width:100%;width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceToken(text, token, value) {
  if (text == null) return text;
  const re = new RegExp(`\\{${escapeRegex(token)}\\}`, "g");
  return text.replace(re, value == null ? "" : String(value));
}

/**
 * Replace invitation template variables in a string (HTML or plain text).
 *
 * Handles `{player_name}`, `{activity_name}`, `{team_name}`, `{club_name}` as
 * straight text replacement, and `{cover_image}` contextually:
 *   - `<img src="{cover_image}">` → src swapped to the cover URL
 *   - bare `{cover_image}` → replaced with a styled <img> tag (or dropped if
 *     the activity has no cover image)
 *
 * The `{personal_registration_link}` token is NOT handled here — it is
 * replaced downstream by `replacePersonalLinkTokens` in `lib/email.js`.
 */
export function replaceInvitationVars(text, {
  playerName = "",
  activityTitle = "",
  teamName = "",
  clubName = "",
  coverImage = "",
} = {}) {
  if (text == null) return text;
  let out = String(text);

  if (coverImage) {
    const attrRe = /((?:href|src)\s*=\s*["'])(?:\{|%7B)cover_image(?:\}|%7D)(["'])/gi;
    out = out.replace(attrRe, `$1${coverImage}$2`);
    const bareImg = `<img src="${coverImage}" style="${COVER_IMAGE_STYLE}" alt="" />`;
    out = out.replace(/\{cover_image\}/g, bareImg);
  } else {
    const attrRe = /<img[^>]*\s+src=["'](?:\{|%7B)cover_image(?:\}|%7D)["'][^>]*>/gi;
    out = out.replace(attrRe, "");
    out = out.replace(/\{cover_image\}/g, "");
  }

  out = replaceToken(out, "player_name", playerName);
  out = replaceToken(out, "activity_name", activityTitle);
  out = replaceToken(out, "team_name", teamName);
  out = replaceToken(out, "club_name", clubName);

  return out;
}

export const INVITATION_VARIABLES = [
  "player_name",
  "activity_name",
  "team_name",
  "club_name",
  "cover_image",
];
