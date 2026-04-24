"use client";

import { useState, useEffect, useMemo, useRef, use } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import IntlProvider from "@/components/IntlProvider";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { getMessages, getDirection } from "@/lib/i18n";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import { dobToInputValue } from "@/lib/dob";

function centsToDisplay(c) {
  return ((c || 0) / 100).toFixed(2);
}

function computeFee(totalCents, chosen, opts) {
  const threshold = opts?.installmentFeeThreshold || 0;
  const percent = opts?.installmentFeePercent || 0;
  if (threshold <= 0 || percent <= 0 || chosen <= threshold) return 0;
  return Math.round(totalCents * percent / 100);
}

function buildPreviewSchedule(totalCostCents, dueDateAmountCents, chosen, firstInstallmentDate, labels, opts) {
  const feeCents = computeFee(totalCostCents, chosen, opts);
  const feeMode = opts?.installmentFeeMode || "split";

  if (chosen <= 1) {
    return { schedule: [{ number: 1, date: new Date(), amountCents: totalCostCents, label: labels.payInFull }], feeCents: 0 };
  }

  let dueNow = dueDateAmountCents || totalCostCents;
  let remaining;
  if (feeCents > 0 && feeMode === "due_date") {
    dueNow = (dueDateAmountCents || totalCostCents) + feeCents;
    remaining = Math.max(0, totalCostCents - (dueDateAmountCents || totalCostCents));
  } else {
    const effectiveTotal = totalCostCents + feeCents;
    remaining = Math.max(0, effectiveTotal - dueNow);
  }

  const numRemaining = Math.max(0, chosen - 1);
  const schedule = [{ number: 1, date: new Date(), amountCents: dueNow, label: labels.dueNow }];
  if (numRemaining > 0 && remaining > 0) {
    const perInstallment = Math.round(remaining / numRemaining);
    const now = new Date();
    let firstDate = firstInstallmentDate ? new Date(firstInstallmentDate) : null;
    if (!firstDate || now > firstDate) {
      firstDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    for (let i = 0; i < numRemaining; i++) {
      const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      const amt = i === numRemaining - 1 ? remaining - perInstallment * (numRemaining - 1) : perInstallment;
      schedule.push({ number: i + 2, date: d, amountCents: amt });
    }
  }
  return { schedule, feeCents };
}

function buildSteps(hasWaivers, t) {
  const steps = [
    { num: 1, label: t("parentDetails") },
    { num: 2, label: t("playerDetails") },
  ];
  if (hasWaivers) steps.push({ num: 3, label: t("waivers") });
  steps.push({ num: hasWaivers ? 4 : 3, label: t("invoicePayment") });
  return steps;
}

function StepIndicator({ current, completed, steps }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 px-2 w-full">
      {steps.map((s, idx) => {
        const isDone = completed.includes(s.num);
        const isActive = s.num === current;
        const isLast = idx === steps.length - 1;
        return (
          <div key={s.num} className={`flex items-center ${isLast ? "" : "flex-1 min-w-0"}`}>
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all shrink-0 ${
                  isDone
                    ? "bg-green-600 text-white"
                    : isActive
                      ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-100"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-1.5 font-medium whitespace-nowrap ${isActive ? "text-blue-600" : isDone ? "text-green-600" : "text-gray-400"}`}
              >
                {s.label}
              </span>
            </div>
            {!isLast && (
              <div className={`flex-1 min-w-[12px] h-0.5 ms-1 me-1 sm:ms-2 sm:me-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingView() {
  const tc = useTranslations("common");
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" aria-hidden />
        <p className="text-gray-500">{tc("loading")}</p>
      </div>
    </div>
  );
}

function ErrorView({ message }) {
  const t = useTranslations("register");
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-red-600 text-2xl font-bold">!</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t("cannotAccess")}</h2>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

function initParent1(order) {
  if (!order) return { firstName: "", lastName: "", phonePrefix: "+1", phone: "", email: "" };
  return {
    firstName: order.parent1FirstName || "",
    lastName: order.parent1LastName || "",
    phonePrefix: order.parent1PhonePrefix || "+1",
    phone: order.parent1Phone || "",
    email: order.parent1Email || "",
  };
}

function initParent2(order) {
  if (!order) return { firstName: "", lastName: "", phonePrefix: "+1", phone: "", email: "" };
  return {
    firstName: order.parent2FirstName || "",
    lastName: order.parent2LastName || "",
    phonePrefix: order.parent2PhonePrefix || "+1",
    phone: order.parent2Phone || "",
    email: order.parent2Email || "",
  };
}

function initPlayer(order) {
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

function ContactForm({ activityId, activity, order, t, tc }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      await fetch("/api/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId,
          orderId: order._id,
          clubId: activity.clubId,
          playerName: `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim(),
          parentName: `${order.parent1FirstName || ""} ${order.parent1LastName || ""}`.trim(),
          parentEmail: order.parent1Email || "",
          parentPhone: order.parent1Phone || "",
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSent(true);
    } catch {
      alert(tc("somethingWentWrong"));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">{t("requestSent")}</h3>
        <p className="text-sm text-gray-500">{t("requestSentDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">{t("sendRequest")}</h3>
      <p className="text-sm text-gray-500">{t("sendRequestDesc")}</p>
      <div>
        <label className="block text-xs text-gray-500 mb-1 text-start">{t("requestSubject")} *</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("requestSubjectPlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1 text-start">{t("requestMessage")} *</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("requestMessagePlaceholder")}
          rows={4}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={sending || !subject.trim() || !message.trim()}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {sending ? tc("saving") : t("submitRequest")}
        </button>
      </div>
    </div>
  );
}

function RegisterPageInner({ activityId, token, activity, order: initialOrder, mode }) {
  const t = useTranslations("register");
  const tc = useTranslations("common");
  const tp = useTranslations("payment");

  // Keep a mutable copy of the order so admin edits made after the parent loaded
  // the page can be pulled in (on entering the Invoice step, or before payment).
  const [liveOrder, setLiveOrder] = useState(initialOrder);

  const orderPaid = liveOrder && (liveOrder.status === "paid" || liveOrder.status === "partial") && (liveOrder.paidCents || 0) > 0;
  const orderPaidNoRegistration = orderPaid && !liveOrder.registrationCompletedAt;
  const orderFullyRegisteredAndPaid = orderPaid && !!liveOrder.registrationCompletedAt;

  // Only treat the draft as "in progress" if the parent actually finished the
  // registration previously (registrationCompletedAt is set). Without that, the
  // order may just be a shell created by the admin (name prefilled, no real
  // registration done) and the parent should start from step 1, re-sign
  // waivers, etc. — not be dropped straight onto the Invoice screen.
  const hasCompletedRegistration = !!initialOrder?.registrationCompletedAt;

  // Separate signal: the parent has finalized steps 1–3 (contact, player,
  // signed waivers — and passed OTP if required) but payment is still
  // outstanding. Once stamped, steps 1–3 are locked and revisits jump
  // straight to the Invoice step. See Order.waiversLockedAt.
  //
  // We read from `liveOrder` (kept in sync after every `/save`) rather than
  // the stale `initialOrder`, so the lock also takes effect in the same
  // session immediately after the parent finalizes step 3.
  const waiversLocked = !!(liveOrder?.waiversLockedAt || initialOrder?.waiversLockedAt);

  const hasWaivers = (activity?.waivers || []).length > 0;
  const waiversComplete = hasWaivers
    ? (hasCompletedRegistration || waiversLocked) && (initialOrder?.waiverConsents || []).length > 0
    : true;

  const autoResumeToInvoice = initialOrder && !orderPaid && initialOrder.status === "pending" &&
    (hasCompletedRegistration || waiversLocked) &&
    !!initialOrder.playerFirstName && !!initialOrder.parent1FirstName && waiversComplete;

  const [step, setStep] = useState(() => {
    if (orderFullyRegisteredAndPaid) return 1;
    if (autoResumeToInvoice) {
      return hasWaivers ? 4 : 3;
    }
    return 1;
  });
  const [completedSteps, setCompletedSteps] = useState(() => {
    if (autoResumeToInvoice) {
      return hasWaivers ? [1, 2, 3] : [1, 2];
    }
    return [];
  });
  const [paying, setPaying] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState(() => initialOrder?._id || null);

  const [parent1, setParent1] = useState(() => initParent1(initialOrder));
  const [parent2, setParent2] = useState(() => initParent2(initialOrder));
  const [player, setPlayer] = useState(() => initPlayer(initialOrder));
  const [teamId, setTeamId] = useState(() => initialOrder?.teamId?._id || initialOrder?.teamId || "");
  const [subscriptionId, setSubscriptionId] = useState(() => initialOrder?.subscriptionId || "");
  const [subscriptionTitle, setSubscriptionTitle] = useState(() => initialOrder?.subscriptionTitle || "");
  const [subscriptionPriceCents, setSubscriptionPriceCents] = useState(() => initialOrder?.subscriptionPriceCents || 0);

  // The invoice line items displayed at step 4. When the parent is editing an
  // existing order (token / orderId flow), these are sourced from `order.items`
  // — which is what the admin sees and edits in the dashboard. If the parent
  // changes team/subscription, we fall back to the subscription template.
  const [orderItems, setOrderItems] = useState(() => initialOrder?.items || null);
  // Per-order due-date override; mirrors admin's dashboard override.
  const [dueDateOverrideCents, setDueDateOverrideCents] = useState(() => initialOrder?.dueDateAmountCents || 0);
  const [refreshingOrder, setRefreshingOrder] = useState(false);

  const [formData, setFormData] = useState(() => initialOrder?.formData || {});

  // Lock the waiver checkboxes whenever the parent has either completed the
  // registration outright (`registrationCompletedAt`) or finalized steps 1–3
  // via the waivers persist step (`waiversLockedAt`). In both cases the
  // consents are already committed and must not be mutated from the client.
  const savedWaiverIds = useMemo(() => {
    const ids = new Set();
    if (!hasCompletedRegistration && !waiversLocked) return ids;
    (initialOrder?.waiverConsents || []).forEach((c) => {
      if (c.agreedAt) ids.add(c.waiverId);
    });
    return ids;
  }, [initialOrder, hasCompletedRegistration, waiversLocked]);

  // Stages: "waivers" (list) → "otp" (enter code) → "processing" (finalizing
  // after successful verification, until the step actually advances).
  const [verifyStage, setVerifyStage] = useState("waivers");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyInfo, setVerifyInfo] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const otpPanelRef = useRef(null);

  const [waiverConsents, setWaiverConsents] = useState(() => {
    const init = {};
    if (!hasCompletedRegistration && !waiversLocked) return init;
    (initialOrder?.waiverConsents || []).forEach((c) => {
      if (c.agreedAt) init[c.waiverId] = true;
    });
    return init;
  });

  const [chosenInstallments, setChosenInstallments] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const teams = activity?.teams || [];
  const subscriptions = activity?.subscriptions || [];

  const playerCustomFields = useMemo(() => {
    const section = (activity?.formSections || []).find((s) => s.key === "player_details");
    if (!section) return [];
    return (section.fields || []).filter((f) => !f.isDefault && !f.hidden).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [activity]);

  function getSubsForTeam(tid) {
    return subscriptions.filter((s) => (s.includedTeamIds || []).some((id) => String(id) === String(tid)));
  }

  function onTeamChange(tid) {
    setTeamId(tid);
    const available = getSubsForTeam(tid);
    if (available.length === 1) {
      const s = available[0];
      setSubscriptionId(s._id);
      setSubscriptionTitle(s.title);
      setSubscriptionPriceCents(s.priceCents || 0);
    } else {
      setSubscriptionId("");
      setSubscriptionTitle("");
      setSubscriptionPriceCents(0);
    }
    // Parent picked a different team → the saved order's line items and the
    // override no longer apply. Fall back to the subscription template.
    setOrderItems(null);
    setDueDateOverrideCents(0);
    setCouponResult(null);
  }

  function onSubChange(sid) {
    const s = subscriptions.find((x) => x._id === sid);
    if (!s) {
      setSubscriptionId("");
      setSubscriptionTitle("");
      setSubscriptionPriceCents(0);
      setOrderItems(null);
      setDueDateOverrideCents(0);
      return;
    }
    setSubscriptionId(s._id);
    setSubscriptionTitle(s.title);
    setSubscriptionPriceCents(s.priceCents || 0);
    setOrderItems(null);
    setDueDateOverrideCents(0);
    setCouponResult(null);
  }

  // Resolve the invoice line items for display and for total calculation.
  // If the admin has curated the order (orderItems set), use those verbatim —
  // they're the source of truth. Otherwise, use the subscription template's
  // required + discount items (same shape as what the server will snapshot).
  function getDisplayItems() {
    if (Array.isArray(orderItems)) {
      return orderItems.map((i) => ({
        name: i.name,
        priceCents: i.priceCents || 0,
        quantity: i.quantity || 1,
        isDiscount: !!i.isDiscount,
      }));
    }
    const sub = subscriptions.find((s) => s._id === subscriptionId);
    return (sub?.items || [])
      .filter((i) => (i.isRequired && !i.isDiscount) || i.isDiscount)
      .map((i) => ({
        name: i.name,
        priceCents: i.priceCents || 0,
        quantity: i.quantity || 1,
        isDiscount: !!i.isDiscount,
      }));
  }

  function computeTotal() {
    let total = subscriptionPriceCents;
    getDisplayItems().forEach((i) => {
      const amt = (i.priceCents || 0) * (i.quantity || 1);
      if (i.isDiscount) total -= amt;
      else total += amt;
    });
    if (couponResult?.discountCents) total -= couponResult.discountCents;
    return Math.max(0, total);
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await fetch(`/api/register/${activityId}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, totalBeforeCoupon: subscriptionPriceCents }),
      });
      const d = await res.json();
      if (d.valid) setCouponResult(d);
      else {
        setCouponResult(null);
        alert(d.error || t("invalidCoupon"));
      }
    } catch {
      alert(t("failedToApplyCoupon"));
    } finally {
      setCouponLoading(false);
    }
  }

  function goToStep(target) {
    setStep(target);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function completeStep1() {
    if (!parent1.firstName || !parent1.lastName || !parent1.phone || !parent1.email) return;
    setCompletedSteps((prev) => (prev.includes(1) ? prev : [...prev, 1]));
    goToStep(2);
  }

  const waivers = activity?.waivers || [];
  const STEPS = buildSteps(hasWaivers, t);
  const waiverStepNum = hasWaivers ? 3 : null;

  // If the user navigates away from the waivers step (either forward after a
  // successful verification, or back via the stepper), reset the verify stage
  // so re-entering step 3 shows the waivers list rather than a stale OTP /
  // processing card.
  useEffect(() => {
    if (step !== waiverStepNum && verifyStage !== "waivers") {
      setVerifyStage("waivers");
      setVerifyCode("");
      setVerifyError("");
      setVerifyInfo("");
    }
  }, [step, waiverStepNum, verifyStage]);
  const invoiceStepNum = hasWaivers ? 4 : 3;

  // If the parent lands directly on the invoice step (auto-resume of an
  // existing order), pull the latest admin-side invoice state on mount so any
  // dashboard edits made after the link was opened are visible.
  useEffect(() => {
    if (step === invoiceStepNum && (token || savedOrderId)) {
      refreshOrderFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, invoiceStepNum]);

  function buildSavePayload() {
    const sub = subscriptions.find((s) => s._id === subscriptionId);
    const reqItems = (sub?.items || [])
      .filter((i) => i.isRequired || i.isDiscount)
      .map((i) => ({
        name: i.name,
        priceCents: i.priceCents,
        quantity: i.quantity || 1,
        isDiscount: i.isDiscount || false,
        isManual: false,
      }));

    const waiverConsentData = waivers.map((w) => ({
      waiverId: String(w._id),
      title: w.title,
      agreedAt: waiverConsents[w._id] ? new Date().toISOString() : null,
      agreedByName: `${parent1.firstName} ${parent1.lastName}`.trim(),
      agreedByEmail: parent1.email,
    }));

    return {
      token: token || undefined,
      orderId: savedOrderId || undefined,
      playerFirstName: player.firstName,
      playerLastName: player.lastName,
      playerDob: player.dob || null,
      playerGender: player.gender,
      playerPhonePrefix: player.phonePrefix || "+1",
      playerPhone: player.phone,
      playerEmail: player.email,
      parent1FirstName: parent1.firstName,
      parent1LastName: parent1.lastName,
      parent1PhonePrefix: parent1.phonePrefix || "+1",
      parent1Phone: parent1.phone,
      parent1Email: parent1.email,
      parent2FirstName: parent2.firstName,
      parent2LastName: parent2.lastName,
      parent2PhonePrefix: parent2.phonePrefix || "+1",
      parent2Phone: parent2.phone,
      parent2Email: parent2.email,
      teamId: teamId || null,
      subscriptionId,
      subscriptionTitle,
      subscriptionPriceCents,
      items: reqItems,
      formData,
      waiverConsents: waiverConsentData,
      couponCode: couponResult?.couponCode || "",
      couponDiscountCents: couponResult?.discountCents || 0,
    };
  }

  async function saveRegistrationData() {
    const res = await fetch(`/api/register/${activityId}/save`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSavePayload()),
    });
    const data = await res.json();
    if (data.order?._id) setSavedOrderId(data.order._id);
    if (data.order) applyLiveOrder(data.order);
    return data;
  }

  // Copy the authoritative admin-side invoice state (items, subscription price,
  // due-date override) from a fresh order document into local state so the
  // summary at step 4 reflects the DB rather than the stale initial snapshot.
  function applyLiveOrder(order) {
    if (!order) return;
    setLiveOrder(order);
    if (order.subscriptionId !== undefined) setSubscriptionId(order.subscriptionId || "");
    if (order.subscriptionTitle !== undefined) setSubscriptionTitle(order.subscriptionTitle || "");
    if (typeof order.subscriptionPriceCents === "number") setSubscriptionPriceCents(order.subscriptionPriceCents);
    if (Array.isArray(order.items)) setOrderItems(order.items);
    if (typeof order.dueDateAmountCents === "number") setDueDateOverrideCents(order.dueDateAmountCents);
  }

  async function refreshOrderFromServer() {
    if (!token && !savedOrderId) return;
    setRefreshingOrder(true);
    try {
      const url = `/api/register/${activityId}${token ? `?token=${token}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (data.order) applyLiveOrder(data.order);
    } catch { /* keep the current state on transient failure */ }
    finally { setRefreshingOrder(false); }
  }

  async function persistStep3AndAdvance() {
    setSavingDraft(true);
    try {
      const data = await saveRegistrationData();
      if (!data.order) {
        alert(data.error || tc("failedToSave"));
        return;
      }
      // Pull the freshest admin-side invoice state before showing the total.
      await refreshOrderFromServer();
      goToStep(invoiceStepNum);
    } catch {
      alert(tc("somethingWentWrong"));
    } finally {
      setSavingDraft(false);
    }
  }

  async function completeStep2() {
    if (!player.firstName || !player.lastName || !player.gender || !player.dob) return;
    const missingRequired = playerCustomFields.some((f) => f.required && !formData[f.key]);
    if (missingRequired) return;
    setCompletedSteps((prev) => (prev.includes(2) ? prev : [...prev, 2]));

    if (hasWaivers) {
      goToStep(3);
      return;
    }
    await persistStep3AndAdvance();
  }

  function buildNewConsents() {
    return waivers
      .filter((w) => waiverConsents[w._id] && !savedWaiverIds.has(String(w._id)))
      .map((w) => ({
        waiverId: String(w._id),
        title: w.title,
        agreedAt: new Date().toISOString(),
        agreedByName: `${parent1.firstName} ${parent1.lastName}`.trim(),
        agreedByEmail: parent1.email,
      }));
  }

  async function finalizeWaiversAndAdvance() {
    setCompletedSteps((prev) => (prev.includes(waiverStepNum) ? prev : [...prev, waiverStepNum]));
    await persistStep3AndAdvance();
  }

  // Fire-and-forget: ask the server to email the dedicated waiver confirmation
  // right now. Used only on the ON (email-confirmation) path — the OFF path
  // defers this email until payment succeeds (or registration completes for
  // free activities), handled server-side in the Stripe webhook + save route.
  //
  // We always POST even when `newConsents` is empty (e.g. the parent already
  // signed earlier and is re-verifying): the server endpoint force-resends
  // on the ON path so the parent reliably gets a fresh confirmation email
  // after each successful OTP verification.
  function triggerWaiverConfirmationEmail(newConsents) {
    fetch(`/api/register/${activityId}/waiver-confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token || undefined,
        orderId: savedOrderId || initialOrder?._id || undefined,
        waiverConsents: newConsents || [],
      }),
    }).catch(() => {});
  }

  async function requestVerificationCode() {
    setVerifyError("");
    setVerifyInfo("");
    setSendingCode(true);
    try {
      const res = await fetch(`/api/register/${activityId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parent1.email, token: token || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || tc("somethingWentWrong"));
        return false;
      }
      return true;
    } catch {
      setVerifyError(tc("somethingWentWrong"));
      return false;
    } finally {
      setSendingCode(false);
    }
  }

  async function completeWaivers() {
    if (sendingCode || savingDraft) return;
    const allRequired = waivers.filter((w) => w.isRequired);
    const allAgreed = allRequired.every((w) => waiverConsents[w._id]);
    if (!allAgreed) return;

    const newConsents = buildNewConsents();

    if (activity?.waiverEmailConfirmation && newConsents.length > 0 && parent1.email) {
      setVerifyCode("");
      setVerifyError("");
      setVerifyInfo("");
      // Flip to the OTP view immediately so the user sees the code request
      // progress inline instead of sitting on an unresponsive Continue button.
      setVerifyStage("otp");
      await requestVerificationCode();
      return;
    }

    // OFF path — just persist + advance; the waiver PDF email is deferred
    // until after payment succeeds (or registration completes for free
    // activities), handled server-side.
    await finalizeWaiversAndAdvance();
  }

  async function submitVerificationCode() {
    if (!verifyCode || verifyCode.trim().length < 4) {
      setVerifyError(t("verifyCodeInvalid"));
      return;
    }
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch(`/api/register/${activityId}/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parent1.email, code: verifyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setVerifyError(data.error || t("verifyCodeInvalid"));
        return;
      }
      const newConsents = buildNewConsents();
      setVerifyCode("");
      // Flip to the "processing" stage so the OTP card turns into a visible
      // "Finalizing..." spinner. This gives the user immediate feedback while
      // we persist the consents and move to the next step. Scroll the panel
      // into view in case the keyboard / small viewport hid it.
      setVerifyStage("processing");
      requestAnimationFrame(() => {
        if (otpPanelRef.current) {
          otpPanelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      await finalizeWaiversAndAdvance();
      // ON path: persist-and-advance has already saved the consents; now
      // explicitly trigger the dedicated waiver-PDF email. The helper on the
      // server is idempotent via `waiverConfirmationSentAt`.
      triggerWaiverConfirmationEmail(newConsents);
    } catch {
      setVerifyError(tc("somethingWentWrong"));
      setVerifyStage("otp");
    } finally {
      setVerifying(false);
    }
  }

  async function resendVerificationCode() {
    setVerifyInfo("");
    const ok = await requestVerificationCode();
    if (ok) setVerifyInfo(t("verifyCodeResent"));
  }

  function editEmailFromOtp() {
    setVerifyStage("waivers");
    setVerifyCode("");
    setVerifyError("");
    setVerifyInfo("");
    goToStep(1);
  }

  async function saveAndPay() {
    setPaying(true);
    try {
      const saveData = await saveRegistrationData();
      if (!saveData.order) {
        alert(saveData.error || tc("failedToSave"));
        setPaying(false);
        return;
      }

      const total = computeTotal();

      if (!activity?.hasPayment || total === 0) {
        window.location.href = `/register/${activityId}/success`;
        return;
      }

      const checkoutRes = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: saveData.order._id, token: token || undefined, chosenInstallments }),
      });
      const checkoutData = await checkoutRes.json();
      if (checkoutData.url) {
        window.location.href = checkoutData.url;
      } else {
        alert(checkoutData.error || tp("failedToCreateCheckout"));
        setPaying(false);
      }
    } catch {
      alert(tc("somethingWentWrong"));
      setPaying(false);
    }
  }

  const currentSub = subscriptions.find((s) => s._id === subscriptionId);
  const total = computeTotal();
  const maxInstallments = currentSub?.maxInstallments || 1;
  const availableSubs = teamId ? getSubsForTeam(teamId) : subscriptions;
  const waiverName = `${parent1.firstName} ${parent1.lastName}`.trim();

  const { schedule, feeCents } = useMemo(() => {
    if (!currentSub || total <= 0) return { schedule: [], feeCents: 0 };
    // Prefer a per-order override if the admin set one on the invoice.
    const override = dueDateOverrideCents || 0;
    const dueDateAmount = override > 0
      ? Math.min(override, total)
      : currentSub.dueDateAmountCents;
    return buildPreviewSchedule(
      total,
      dueDateAmount,
      chosenInstallments,
      currentSub.firstInstallmentDate,
      { payInFull: tp("payInFull"), dueNow: tp("dueNow") },
      currentSub,
    );
  }, [total, currentSub, chosenInstallments, tp, dueDateOverrideCents]);

  if (orderFullyRegisteredAndPaid) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            {activity?.clubLogoUrl && (
              <img src={activity.clubLogoUrl} alt={activity?.clubName || ""} className="h-14 w-auto mx-auto mb-3 object-contain" />
            )}
            <h1 className="text-2xl font-bold text-gray-900">{activity?.title || t("registration")}</h1>
            <p className="text-sm text-gray-500 mt-1">{activity?.clubName}{activity?.season ? ` · ${activity.season}` : ""}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">{t("alreadyRegistered")}</h2>
              <p className="text-sm text-gray-500">{t("alreadyRegisteredDesc")}</p>
              <div className="mt-3 inline-block bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-medium">
                {tp("alreadyPaid")} — ${centsToDisplay(liveOrder.paidCents)}
              </div>
            </div>
            <hr className="my-6" />
            <ContactForm activityId={activityId} activity={activity} order={liveOrder} t={t} tc={tc} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          {activity?.clubLogoUrl && (
            <img
              src={activity.clubLogoUrl}
              alt={activity?.clubName || ""}
              className="h-14 w-auto mx-auto mb-3 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{activity?.title || t("registration")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activity?.clubName}
            {activity?.season ? ` · ${activity.season}` : ""}
          </p>
        </div>

        <StepIndicator current={step} completed={completedSteps} steps={STEPS} />

        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">{t("parentGuardian")}</h3>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1">{t("parent1Required")}</h4>
                <p className="text-xs text-gray-400 mb-3">{t("parent1FillsHint")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstNameRequired")}</label>
                    <input
                      value={parent1.firstName}
                      onChange={(e) => setParent1({ ...parent1, firstName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastNameRequired")}</label>
                    <input
                      value={parent1.lastName}
                      onChange={(e) => setParent1({ ...parent1, lastName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("phoneRequired")}</label>
                    <PhonePrefixInput prefix={parent1.phonePrefix} phone={parent1.phone} onPrefixChange={(v) => setParent1({ ...parent1, phonePrefix: v })} onPhoneChange={(v) => setParent1({ ...parent1, phone: v })} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("emailRequired")}</label>
                    <input
                      type="email"
                      value={parent1.email}
                      onChange={(e) => setParent1({ ...parent1, email: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              <hr />
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  {t("parent2Optional")} <span className="text-gray-400">({tc("optional")})</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstName")}</label>
                    <input
                      value={parent2.firstName}
                      onChange={(e) => setParent2({ ...parent2, firstName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastName")}</label>
                    <input
                      value={parent2.lastName}
                      onChange={(e) => setParent2({ ...parent2, lastName: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("phone")}</label>
                    <PhonePrefixInput prefix={parent2.phonePrefix} phone={parent2.phone} onPrefixChange={(v) => setParent2({ ...parent2, phonePrefix: v })} onPhoneChange={(v) => setParent2({ ...parent2, phone: v })} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 text-start">{t("email")}</label>
                    <input
                      type="email"
                      value={parent2.email}
                      onChange={(e) => setParent2({ ...parent2, email: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={completeStep1}
                  disabled={!parent1.firstName || !parent1.lastName || !parent1.phone || !parent1.email}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {tc("continue")}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">{t("playerDetails")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("firstNameRequired")}</label>
                  <input
                    value={player.firstName}
                    onChange={(e) => setPlayer({ ...player, firstName: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("lastNameRequired")}</label>
                  <input
                    value={player.lastName}
                    onChange={(e) => setPlayer({ ...player, lastName: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("dobRequired")}</label>
                  <input
                    type="date"
                    value={player.dob}
                    onChange={(e) => setPlayer({ ...player, dob: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("genderRequired")}</label>
                  <select
                    value={player.gender}
                    onChange={(e) => setPlayer({ ...player, gender: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">{t("select")}</option>
                    <option value="Male">{t("male")}</option>
                    <option value="Female">{t("female")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("phone")}</label>
                  <PhonePrefixInput prefix={player.phonePrefix} phone={player.phone} onPrefixChange={(v) => setPlayer({ ...player, phonePrefix: v })} onPhoneChange={(v) => setPlayer({ ...player, phone: v })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("email")}</label>
                  <input
                    type="email"
                    value={player.email}
                    onChange={(e) => setPlayer({ ...player, email: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {playerCustomFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-500 mb-1 text-start">
                    {field.label}{field.required ? " *" : ""}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={formData[field.key] || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
                      placeholder={field.description || ""}
                    />
                  ) : field.type === "dropdown_single" ? (
                    <select
                      value={formData[field.key] || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">{t("select")}</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === "multichoice_checkbox" ? (
                    <div className="space-y-1.5">
                      {(field.options || []).map((opt) => {
                        const vals = formData[field.key] || [];
                        const checked = Array.isArray(vals) ? vals.includes(opt) : false;
                        return (
                          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={checked} onChange={(e) => {
                              setFormData((prev) => {
                                const cur = Array.isArray(prev[field.key]) ? [...prev[field.key]] : [];
                                if (e.target.checked) cur.push(opt); else { const idx = cur.indexOf(opt); if (idx !== -1) cur.splice(idx, 1); }
                                return { ...prev, [field.key]: cur };
                              });
                            }} className="rounded border-gray-300" />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                      value={formData[field.key] || ""}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder={field.description || ""}
                    />
                  )}
                </div>
              ))}

              {teams.length > 0 && !initialOrder?.teamId && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("teamRequired")}</label>
                  <select value={teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">{t("selectTeam")}</option>
                    {teams.map((tm, idx) => {
                      const id = tm.teamId?._id || tm.teamId;
                      if (!id) return null;
                      return (
                        <option key={activityTeamSlotKey({ teamId: id }, idx)} value={String(id)}>
                          {tm.name} ({tm.season})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {activity?.hasPayment && availableSubs.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("subscriptionRequired")}</label>
                  <select value={subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">{t("selectSubscription")}</option>
                    {availableSubs.map((s) => {
                      return (
                        <option key={s._id} value={s._id}>
                          {s.title}
                          {s.priceCents ? ` — $${centsToDisplay(s.priceCents)}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => goToStep(1)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                  {tc("back")}
                </button>
                <button
                  onClick={completeStep2}
                  disabled={savingDraft || !player.firstName || !player.lastName || !player.gender || !player.dob || playerCustomFields.some((f) => f.required && !formData[f.key])}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {savingDraft ? tc("saving") : tc("continue")}
                </button>
              </div>
            </div>
          )}

          {hasWaivers && step === waiverStepNum && verifyStage === "processing" && (
            <div ref={otpPanelRef} className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <svg className="absolute -right-1.5 -bottom-1.5 h-6 w-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">{t("verifyingFinalizing")}</h3>
              <p className="text-sm text-gray-500 max-w-sm">{t("verifyingFinalizingDesc")}</p>
            </div>
          )}

          {hasWaivers && step === waiverStepNum && verifyStage === "otp" && (
            <div ref={otpPanelRef} className="space-y-5">
              <h3 className="font-semibold text-gray-900">{t("verifyWaiverEmailTitle")}</h3>
              <p className="text-sm text-gray-500">
                {t("verifyWaiverEmailDescPrefix")} <strong className="text-gray-900">{parent1.email}</strong>. {t("verifyWaiverEmailDescSuffix")}
              </p>
              <button
                type="button"
                onClick={editEmailFromOtp}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
              >
                {t("verifyWrongEmail")}
              </button>

              <div>
                <label className="block text-xs text-gray-500 mb-1 text-start">{t("verificationCode")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={verifyCode}
                  disabled={sendingCode}
                  onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, "")); setVerifyError(""); }}
                  className="w-full border rounded-lg px-3 py-2 text-lg tracking-[0.5em] font-semibold text-center disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="000000"
                />
                {sendingCode && !verifyError && (
                  <p className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    {t("sending")}
                  </p>
                )}
                {verifyError && (
                  <p className="mt-2 text-xs text-red-600">{verifyError}</p>
                )}
                {!verifyError && !sendingCode && verifyInfo && (
                  <p className="mt-2 text-xs text-green-600">{verifyInfo}</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => { setVerifyStage("waivers"); setVerifyError(""); setVerifyInfo(""); }}
                    className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                  >
                    {t("backToWaivers")}
                  </button>
                  <button
                    type="button"
                    onClick={resendVerificationCode}
                    disabled={sendingCode}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                  >
                    {sendingCode ? t("sending") : t("resendCode")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={submitVerificationCode}
                  disabled={verifying || !verifyCode}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {verifying ? t("verifying") : t("verifyAndContinue")}
                </button>
              </div>
            </div>
          )}

          {hasWaivers && step === waiverStepNum && verifyStage === "waivers" && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">{t("waiversTitle")}</h3>
              <p className="text-sm text-gray-500">{t("waiversDesc")}</p>

              <div className="space-y-4">
                {waivers.map((w) => {
                  const agreed = !!waiverConsents[w._id];
                  const locked = savedWaiverIds.has(String(w._id));
                  const savedConsent = locked ? (initialOrder?.waiverConsents || []).find((c) => c.waiverId === String(w._id)) : null;
                  return (
                    <div key={w._id} className={`border rounded-lg overflow-hidden ${locked ? "bg-gray-50" : ""}`}>
                      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{w.title}</span>
                        <div className="flex items-center gap-2">
                          {locked && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">{t("waiverSigned")}</span>
                          )}
                          {w.isRequired && !locked && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{tc("required")}</span>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-3 max-h-64 overflow-y-auto border-b">
                        <div className="prose prose-sm text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: w.contentHtml }} />
                      </div>
                      <label className={`flex items-start gap-3 px-4 py-3 ${locked ? "cursor-default" : "cursor-pointer hover:bg-gray-50"} transition`}>
                        <input
                          type="checkbox"
                          checked={agreed}
                          disabled={locked}
                          onChange={locked ? undefined : (e) => setWaiverConsents((prev) => ({ ...prev, [w._id]: e.target.checked }))}
                          className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                        />
                        <span className={`text-sm text-start ${locked ? "text-gray-500" : "text-gray-700"}`}>
                          {t("waiverPrefix")}
                          <strong>{waiverName}</strong>
                          {t("waiverMiddle")}
                          <strong>{w.title}</strong>
                          {t("waiverSuffix")}
                          {locked && savedConsent?.agreedAt && (
                            <span className="block text-xs text-green-600 mt-1">
                              {t("waiverSignedAt", { date: new Date(savedConsent.agreedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), name: savedConsent.agreedByName || "" })}
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => goToStep(2)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                  {tc("back")}
                </button>
                <button
                  onClick={completeWaivers}
                  disabled={savingDraft || sendingCode || waivers.filter((w) => w.isRequired).some((w) => !waiverConsents[w._id])}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition inline-flex items-center justify-center gap-2"
                >
                  {(savingDraft || sendingCode) && (
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {sendingCode ? t("sending") : (savingDraft ? tc("saving") : tc("continue"))}
                </button>
              </div>
            </div>
          )}

          {step === invoiceStepNum && orderPaidNoRegistration && (
            <div className="space-y-0">
              <div className="bg-green-50 -mx-6 -mt-6 px-6 py-4 mb-5 border-b border-green-100 rounded-t-xl text-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-green-800">{t("paymentAlreadyMade")}</p>
                <p className="text-xs text-green-600 mt-1">{tp("alreadyPaid")} — ${centsToDisplay(liveOrder.paidCents)}</p>
              </div>

              <p className="text-sm text-gray-500 mb-4">{t("paymentAlreadyMadeDesc")}</p>

              <ContactForm activityId={activityId} activity={activity} order={liveOrder} t={t} tc={tc} />

              {!waiversLocked && (
                <div className="flex justify-start pt-4">
                  <button onClick={() => goToStep(hasWaivers ? waiverStepNum : 2)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                    {tc("back")}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === invoiceStepNum && !orderPaidNoRegistration && (
            <div className="space-y-0">
              {/* Player & Parent Info Header */}
              <div className="bg-blue-50 -mx-6 -mt-6 px-6 py-4 mb-5 border-b border-blue-100 rounded-t-xl">
                <p className="text-sm text-blue-700 font-medium">{tp("paymentFor")}</p>
                <p className="text-lg font-semibold text-blue-900">
                  {player.firstName} {player.lastName}
                </p>
                {teamId && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    {teams.find((tm) => String(tm.teamId) === String(teamId))?.name || ""}
                  </p>
                )}
                <div className="mt-2 text-xs text-blue-600">
                  {parent1.firstName} {parent1.lastName}
                  {parent1.phone ? ` · ${parent1.phonePrefix || "+1"} ${parent1.phone}` : ""}
                  {parent1.email ? ` · ${parent1.email}` : ""}
                </div>
              </div>

              {/* Invoice Breakdown */}
              <div className="space-y-3 mb-5">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{tp("invoice")}</h3>

                {subscriptionTitle && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{subscriptionTitle}</span>
                    <span className="font-medium">${centsToDisplay(subscriptionPriceCents)}</span>
                  </div>
                )}
                {getDisplayItems()
                  .filter((i) => !i.isDiscount)
                  .map((item, idx) => (
                    <div key={`chg-${idx}`} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {item.name}{(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ""}
                      </span>
                      <span className="font-medium">${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}</span>
                    </div>
                  ))}
                {getDisplayItems()
                  .filter((i) => i.isDiscount)
                  .map((item, idx) => (
                    <div key={`dsc-${idx}`} className="flex justify-between text-sm text-green-700">
                      <span>
                        {item.name}{(item.quantity || 1) > 1 ? ` × ${item.quantity}` : ""}
                      </span>
                      <span>-${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}</span>
                    </div>
                  ))}
                {couponResult && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>{t("couponLabel")}: {couponResult.couponName}</span>
                    <span>-${centsToDisplay(couponResult.discountCents)}</span>
                  </div>
                )}
                <hr className="border-gray-200" />
                <div className="flex justify-between text-base font-bold">
                  <span>{tc("total")}</span>
                  <span>${centsToDisplay(total)}</span>
                </div>
              </div>

              {/* Coupon Input */}
              {activity?.hasPayment && total > 0 && (
                <div className="mb-5">
                  <label className="block text-xs text-gray-500 mb-1 text-start">{t("couponCode")}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder={t("couponPlaceholder")}
                      className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                    >
                      {couponLoading ? "…" : t("apply")}
                    </button>
                  </div>
                </div>
              )}

              {/* Installment Picker */}
              {activity?.hasPayment && total > 0 && maxInstallments > 1 && (
                <div className="mb-5 border-t border-gray-100 pt-5">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{tp("paymentPlan")}</h3>
                  <select
                    value={chosenInstallments}
                    onChange={(e) => setChosenInstallments(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => {
                      const optFee = computeFee(total, n, currentSub);
                      const feeTag = optFee > 0 ? ` (+${currentSub.installmentFeePercent}% ${tp("fee")})` : "";
                      return (
                        <option key={n} value={n}>
                          {n === 1
                            ? `${tp("payFullOption")} — $${centsToDisplay(total)}`
                            : `${tp("paymentsOption", { count: n })} — $${centsToDisplay(currentSub?.dueDateAmountCents || total)} ${tp("nowPlus")} ${n - 1} ${tp("installments")}${feeTag}`}
                        </option>
                      );
                    })}
                  </select>

                  {currentSub?.installmentFeeThreshold > 0 && currentSub?.installmentFeePercent > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      {tp("installmentFeeHint", {
                        threshold: currentSub.installmentFeeThreshold,
                        percent: currentSub.installmentFeePercent,
                      })}
                    </p>
                  )}

                  {chosenInstallments > 1 && currentSub?.firstInstallmentDate && (
                    <p className="text-xs text-gray-500 mt-2">
                      {tp("installmentNote", { date: new Date(currentSub.firstInstallmentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) })}
                    </p>
                  )}

                  {schedule.length > 0 && (
                    <div className="mt-4 border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-start">
                            <th className="px-3 py-2 font-medium text-gray-600">#</th>
                            <th className="px-3 py-2 font-medium text-gray-600">{tc("date")}</th>
                            <th className="px-3 py-2 font-medium text-gray-600 text-end">{tc("amount")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {schedule.map((s, idx) => (
                            <tr key={idx} className={idx === 0 ? "bg-blue-50" : ""}>
                              <td className="px-3 py-2 text-gray-700">{s.number}</td>
                              <td className="px-3 py-2 text-gray-700">
                                {s.label || new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </td>
                              <td className="px-3 py-2 text-end font-medium">${centsToDisplay(s.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {feeCents > 0 && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
                      {tp("installmentFeeNotice", {
                        percent: currentSub.installmentFeePercent,
                        fee: `$${centsToDisplay(feeCents)}`,
                        total: `$${centsToDisplay(total + feeCents)}`,
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Recurring Payment Agreement */}
              {activity?.hasPayment && total > 0 && chosenInstallments > 1 && (
                <div className="mb-5 border-t border-gray-100 pt-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex gap-2 items-start">
                      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold mb-1">{tp("recurringAgreement")}</p>
                        <p>{tp("recurringDesc", {
                          club: activity?.clubName || tp("clubFallback"),
                          amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
                          count: chosenInstallments - 1,
                          installmentAmount: `$${centsToDisplay(schedule[1]?.amountCents || 0)}`,
                          total: `$${centsToDisplay(total + feeCents)}`,
                        })}</p>
                        {feeCents > 0 && (
                          <p className="mt-1 font-medium">{tp("recurringFeeNote", {
                            percent: currentSub.installmentFeePercent,
                            fee: `$${centsToDisplay(feeCents)}`,
                          })}</p>
                        )}
                        {currentSub?.firstInstallmentDate && (
                          <p className="mt-1">{tp("installmentsStart", { date: new Date(currentSub.firstInstallmentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) })}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                    <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">
                      {feeCents > 0
                        ? tp("agreeRecurringWithFee", { percent: currentSub.installmentFeePercent, fee: `$${centsToDisplay(feeCents)}` })
                        : tp("agreeRecurring")}
                    </span>
                  </label>
                </div>
              )}

              {/* Card Payment Notice + Pay Button */}
              <div className="border-t border-gray-100 pt-5">
                {activity?.hasPayment && total > 0 && (
                  <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span>{tp("cardPayment")}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  {waiversLocked ? (
                    <span />
                  ) : (
                    <button onClick={() => goToStep(hasWaivers ? waiverStepNum : 2)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                      {tc("back")}
                    </button>
                  )}
                  <button
                    onClick={saveAndPay}
                    disabled={paying || (chosenInstallments > 1 && !agreedToTerms)}
                    className="py-3 px-8 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    {paying
                      ? tp("redirecting")
                      : total > 0 && activity?.hasPayment
                        ? (chosenInstallments > 1
                          ? tp("payNow", { amount: `$${centsToDisplay(schedule[0]?.amountCents || total)}` })
                          : tp("payNow", { amount: `$${centsToDisplay(total)}` }))
                        : t("completeRegistration")}
                  </button>
                </div>

                {activity?.hasPayment && total > 0 && chosenInstallments > 1 && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    {tp("firstPayment", {
                      amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
                      count: chosenInstallments - 1,
                    })}
                  </p>
                )}

                {activity?.hasPayment && total > 0 && (
                  <p className="text-xs text-gray-400 text-center mt-3">{tp("securePayment")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.activityId;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [locale, setLocale] = useState("en");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [order, setOrder] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    const url = `/api/register/${activityId}${token ? `?token=${token}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        const lang = d.activity?.clubLanguage || "en";
        setLocale(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = getDirection(lang);
        setActivity(d.activity);
        setMode(d.mode);
        if (d.order) {
          setOrder(d.order);
        }
      })
      .catch(() => setError(getMessages("en").register.failedToLoad))
      .finally(() => setLoading(false));
  }, [activityId, token]);

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <RegisterPageInner activityId={activityId} token={token} activity={activity} order={order} mode={mode} />
      )}
    </IntlProvider>
  );
}
