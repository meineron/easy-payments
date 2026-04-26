import { dobToInputValue } from "@/lib/dob";

/**
 * Initial form-state factories for the register page. Each takes the
 * server-provided `order` (or null for fresh registrations) and produces the
 * corresponding form slice with safe defaults.
 */

export function initParent1(order) {
  if (!order) return { firstName: "", lastName: "", phonePrefix: "+1", phone: "", email: "" };
  return {
    firstName: order.parent1FirstName || "",
    lastName: order.parent1LastName || "",
    phonePrefix: order.parent1PhonePrefix || "+1",
    phone: order.parent1Phone || "",
    email: order.parent1Email || "",
  };
}

export function initParent2(order) {
  if (!order) return { firstName: "", lastName: "", phonePrefix: "+1", phone: "", email: "" };
  return {
    firstName: order.parent2FirstName || "",
    lastName: order.parent2LastName || "",
    phonePrefix: order.parent2PhonePrefix || "+1",
    phone: order.parent2Phone || "",
    email: order.parent2Email || "",
  };
}

export function initPlayer(order) {
  if (!order) return { firstName: "", lastName: "", dob: "", gender: "", phonePrefix: "+1", phone: "", email: "" };
  return {
    firstName: order.playerFirstName || "",
    lastName: order.playerLastName || "",
    dob: dobToInputValue(order.playerDob),
    gender: order.playerGender || "",
    phonePrefix: order.playerPhonePrefix || "+1",
    phone: order.playerPhone || "",
    email: order.playerEmail || "",
  };
}
