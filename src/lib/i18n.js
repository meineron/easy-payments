import en from "@/messages/en.json";
import he from "@/messages/he.json";

export const locales = ["en", "he"];
export const defaultLocale = "en";

const messages = { en, he };

export function getMessages(locale) {
  return messages[locale] || messages[defaultLocale];
}

export function getDirection(locale) {
  return locale === "he" ? "rtl" : "ltr";
}

export function getDateLocale(locale) {
  return locale === "he" ? "he-IL" : "en-US";
}
