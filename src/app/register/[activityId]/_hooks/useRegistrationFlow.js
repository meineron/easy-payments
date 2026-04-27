import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { initParent1, initParent2, initPlayer } from "../_utils/orderInit";
import { buildPreviewSchedule, buildSteps } from "../_utils/installments";

/**
 * All state, derived data, and handlers for the registration flow.
 *
 * The page renders the returned shape; this hook owns the logic so the page
 * can stay close to a thin shell. The shape is intentionally flat — the
 * page destructures it directly into the step components below.
 */
export default function useRegistrationFlow({ activityId, token, activity, order: initialOrder }) {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.register.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const tp = (id, values) => intl.formatMessage({ id: `payments.payment.${id}` }, values);

  const [liveOrder, setLiveOrder] = useState(initialOrder);

  const orderPaid =
    liveOrder &&
    (liveOrder.status === "paid" || liveOrder.status === "partial") &&
    (liveOrder.paidCents || 0) > 0;
  const orderPaidNoRegistration = orderPaid && !liveOrder.registrationCompletedAt;
  const orderFullyRegisteredAndPaid = orderPaid && !!liveOrder.registrationCompletedAt;

  const hasCompletedRegistration = !!initialOrder?.registrationCompletedAt;
  const waiversLocked = !!(liveOrder?.waiversLockedAt || initialOrder?.waiversLockedAt);

  const hasWaivers = (activity?.waivers || []).length > 0;
  const waiversComplete = hasWaivers
    ? (hasCompletedRegistration || waiversLocked) && (initialOrder?.waiverConsents || []).length > 0
    : true;

  const autoResumeToInvoice =
    initialOrder &&
    !orderPaid &&
    initialOrder.status === "pending" &&
    (hasCompletedRegistration || waiversLocked) &&
    !!initialOrder.playerFirstName &&
    !!initialOrder.parent1FirstName &&
    waiversComplete;

  const [step, setStep] = useState(() => {
    if (orderFullyRegisteredAndPaid) return 1;
    if (autoResumeToInvoice) return hasWaivers ? 4 : 3;
    return 1;
  });
  const [completedSteps, setCompletedSteps] = useState(() => {
    if (autoResumeToInvoice) return hasWaivers ? [1, 2, 3] : [1, 2];
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
  const [subscriptionPriceCents, setSubscriptionPriceCents] = useState(
    () => initialOrder?.subscriptionPriceCents || 0
  );

  const [orderItems, setOrderItems] = useState(() => initialOrder?.items || null);
  const [dueDateOverrideCents, setDueDateOverrideCents] = useState(
    () => initialOrder?.dueDateAmountCents || 0
  );
  const [, setRefreshingOrder] = useState(false);

  const [formData, setFormData] = useState(() => initialOrder?.formData || {});

  const savedWaiverIds = useMemo(() => {
    const ids = new Set();
    if (!hasCompletedRegistration && !waiversLocked) return ids;
    (initialOrder?.waiverConsents || []).forEach((c) => {
      if (c.agreedAt) ids.add(c.waiverId);
    });
    return ids;
  }, [initialOrder, hasCompletedRegistration, waiversLocked]);

  const [verifyStage, setVerifyStage] = useState("waivers");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifyInfo, setVerifyInfo] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);

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
    return (section.fields || [])
      .filter((f) => !f.isDefault && !f.hidden)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [activity]);

  function getSubsForTeam(tid) {
    return subscriptions.filter((s) =>
      (s.includedTeamIds || []).some((id) => String(id) === String(tid))
    );
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

  useEffect(() => {
    if (step !== waiverStepNum && verifyStage !== "waivers") {
      setVerifyStage("waivers");
      setVerifyCode("");
      setVerifyError("");
      setVerifyInfo("");
    }
  }, [step, waiverStepNum, verifyStage]);
  const invoiceStepNum = hasWaivers ? 4 : 3;

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
    } catch {
      /* keep the current state on transient failure */
    } finally {
      setRefreshingOrder(false);
    }
  }

  async function persistStep3AndAdvance() {
    setSavingDraft(true);
    try {
      const data = await saveRegistrationData();
      if (!data.order) {
        alert(data.error || tc("failedToSave"));
        return;
      }
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
      setVerifyStage("otp");
      await requestVerificationCode();
      return;
    }

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
      // Flip to "processing" — RegisterPageInner watches this and scrolls
      // the panel into view, so the user gets immediate feedback while we
      // persist the consents and advance.
      setVerifyStage("processing");
      await finalizeWaiversAndAdvance();
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
        body: JSON.stringify({
          orderId: saveData.order._id,
          token: token || undefined,
          chosenInstallments,
        }),
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
    const override = dueDateOverrideCents || 0;
    const dueDateAmount =
      override > 0 ? Math.min(override, total) : currentSub.dueDateAmountCents;
    return buildPreviewSchedule(
      total,
      dueDateAmount,
      chosenInstallments,
      currentSub.firstInstallmentDate,
      { payInFull: tp("payInFull"), dueNow: tp("dueNow") },
      currentSub
    );
  }, [total, currentSub, chosenInstallments, tp, dueDateOverrideCents]);

  return {
    t,
    tc,
    tp,

    liveOrder,
    orderPaidNoRegistration,
    orderFullyRegisteredAndPaid,
    waiversLocked,
    hasWaivers,

    step,
    completedSteps,
    STEPS,
    waiverStepNum,
    invoiceStepNum,
    goToStep,

    paying,
    savingDraft,

    parent1,
    setParent1,
    parent2,
    setParent2,
    player,
    setPlayer,

    teamId,
    onTeamChange,
    subscriptionId,
    onSubChange,
    subscriptionTitle,
    subscriptionPriceCents,
    teams,
    availableSubs,
    initialOrder,

    formData,
    setFormData,
    playerCustomFields,

    waivers,
    waiverConsents,
    setWaiverConsents,
    savedWaiverIds,
    waiverName,

    verifyStage,
    setVerifyStage,
    verifyCode,
    setVerifyCode,
    verifyError,
    setVerifyError,
    verifyInfo,
    setVerifyInfo,
    sendingCode,
    verifying,

    chosenInstallments,
    setChosenInstallments,
    agreedToTerms,
    setAgreedToTerms,

    couponCode,
    setCouponCode,
    couponResult,
    couponLoading,
    applyCoupon,

    currentSub,
    total,
    maxInstallments,
    schedule,
    feeCents,
    displayItems: getDisplayItems(),

    completeStep1,
    completeStep2,
    completeWaivers,
    submitVerificationCode,
    resendVerificationCode,
    editEmailFromOtp,
    saveAndPay,
  };
}
