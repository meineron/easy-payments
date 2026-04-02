"use client";

import { useState, useEffect, use } from "react";
import { useSearchParams } from "next/navigation";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

const STEPS = [
  { num: 1, label: "Parent Details" },
  { num: 2, label: "Player Details" },
  { num: 3, label: "Invoice & Payment" },
];

function StepIndicator({ current, completed }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, idx) => {
        const isDone = completed.includes(s.num);
        const isActive = s.num === current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                isDone ? "bg-green-600 text-white" : isActive ? "bg-blue-600 text-white shadow-lg ring-4 ring-blue-100" : "bg-gray-200 text-gray-500"
              }`}>
                {isDone ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.num}
              </div>
              <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${isActive ? "text-blue-600" : isDone ? "text-green-600" : "text-gray-400"}`}>
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-16 sm:w-24 h-0.5 mx-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RegisterPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.activityId;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [order, setOrder] = useState(null);
  const [mode, setMode] = useState(null);

  const [verified, setVerified] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");

  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);

  const [parent1, setParent1] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [parent2, setParent2] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [player, setPlayer] = useState({ firstName: "", lastName: "", dob: "", gender: "", phone: "", email: "" });
  const [teamId, setTeamId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [subscriptionTitle, setSubscriptionTitle] = useState("");
  const [subscriptionPriceCents, setSubscriptionPriceCents] = useState(0);

  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    const url = `/api/register/${activityId}${token ? `?token=${token}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setActivity(d.activity);
        setMode(d.mode);
        if (d.order) {
          setOrder(d.order);
          setParent1({ firstName: d.order.parent1FirstName || "", lastName: d.order.parent1LastName || "", phone: d.order.parent1Phone || "", email: d.order.parent1Email || "" });
          setParent2({ firstName: d.order.parent2FirstName || "", lastName: d.order.parent2LastName || "", phone: d.order.parent2Phone || "", email: d.order.parent2Email || "" });
          setPlayer({ firstName: d.order.playerFirstName || "", lastName: d.order.playerLastName || "", dob: d.order.playerDob ? new Date(d.order.playerDob).toISOString().slice(0, 10) : "", gender: d.order.playerGender || "", phone: d.order.playerPhone || "", email: d.order.playerEmail || "" });
          setTeamId(d.order.teamId?._id || d.order.teamId || "");
          setSubscriptionId(d.order.subscriptionId || "");
          setSubscriptionTitle(d.order.subscriptionTitle || "");
          setSubscriptionPriceCents(d.order.subscriptionPriceCents || 0);
          setOtpEmail(d.order.parent1Email || "");
        }
        if (d.mode === "public") { setVerified(true); }
      })
      .catch(() => setError("Failed to load registration"))
      .finally(() => setLoading(false));
  }, [activityId, token]);

  async function sendOtp() {
    if (!otpEmail) { setOtpError("Enter your email"); return; }
    setOtpLoading(true); setOtpError("");
    try {
      const res = await fetch(`/api/register/${activityId}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, token: token || undefined }),
      });
      const d = await res.json();
      if (d.success) setOtpSent(true);
      else setOtpError(d.error || "Failed to send code");
    } catch { setOtpError("Failed to send code"); }
    finally { setOtpLoading(false); }
  }

  async function verifyOtp() {
    if (!otpCode) { setOtpError("Enter the code"); return; }
    setOtpLoading(true); setOtpError("");
    try {
      const res = await fetch(`/api/register/${activityId}/verify-code`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: otpEmail, code: otpCode }),
      });
      const d = await res.json();
      if (d.verified) { setVerified(true); setParent1((p) => ({ ...p, email: otpEmail })); }
      else setOtpError(d.error || "Invalid code");
    } catch { setOtpError("Failed to verify"); }
    finally { setOtpLoading(false); }
  }

  const teams = activity?.teams || [];
  const subscriptions = activity?.subscriptions || [];

  function getSubsForTeam(tid) {
    return subscriptions.filter((s) => (s.teamPricing || []).some((tp) => String(tp.teamId) === String(tid)));
  }

  function onTeamChange(tid) {
    setTeamId(tid);
    const available = getSubsForTeam(tid);
    if (available.length === 1) {
      const s = available[0];
      const tp = (s.teamPricing || []).find((tp) => String(tp.teamId) === String(tid));
      setSubscriptionId(s._id); setSubscriptionTitle(s.title); setSubscriptionPriceCents(tp?.priceCents || 0);
    } else {
      setSubscriptionId(""); setSubscriptionTitle(""); setSubscriptionPriceCents(0);
    }
    setCouponResult(null);
  }

  function onSubChange(sid) {
    const s = subscriptions.find((x) => x._id === sid);
    if (!s) { setSubscriptionId(""); setSubscriptionTitle(""); setSubscriptionPriceCents(0); return; }
    const tp = (s.teamPricing || []).find((tp) => String(tp.teamId) === String(teamId));
    setSubscriptionId(s._id); setSubscriptionTitle(s.title); setSubscriptionPriceCents(tp?.priceCents || 0);
    setCouponResult(null);
  }

  function computeTotal() {
    let total = subscriptionPriceCents;
    const sub = subscriptions.find((s) => s._id === subscriptionId);
    (sub?.items || []).filter((i) => i.isRequired).forEach((i) => { total += (i.priceCents || 0) * (i.quantity || 1); });
    if (couponResult?.discountCents) total -= couponResult.discountCents;
    return Math.max(0, total);
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await fetch(`/api/register/${activityId}/apply-coupon`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode, totalBeforeCoupon: subscriptionPriceCents }),
      });
      const d = await res.json();
      if (d.valid) setCouponResult(d);
      else { setCouponResult(null); alert(d.error || "Invalid coupon"); }
    } catch { alert("Failed to apply coupon"); }
    finally { setCouponLoading(false); }
  }

  function goToStep(target) {
    setStep(target);
  }

  function completeStep1() {
    if (!parent1.firstName || !parent1.lastName || !parent1.phone || !parent1.email) return;
    setCompletedSteps((prev) => prev.includes(1) ? prev : [...prev, 1]);
    goToStep(2);
  }

  function completeStep2() {
    if (!player.firstName || !player.lastName || !player.gender || !player.dob) return;
    setCompletedSteps((prev) => prev.includes(2) ? prev : [...prev, 2]);
    goToStep(3);
  }

  async function saveAndPay() {
    setPaying(true);
    try {
      const sub = subscriptions.find((s) => s._id === subscriptionId);
      const reqItems = (sub?.items || []).filter((i) => i.isRequired).map((i) => ({
        name: i.name, priceCents: i.priceCents, quantity: i.quantity || 1, isDiscount: false,
      }));

      const payload = {
        token: token || undefined,
        playerFirstName: player.firstName, playerLastName: player.lastName,
        playerDob: player.dob || null, playerGender: player.gender,
        playerPhone: player.phone, playerEmail: player.email,
        parent1FirstName: parent1.firstName, parent1LastName: parent1.lastName,
        parent1Phone: parent1.phone, parent1Email: parent1.email,
        parent2FirstName: parent2.firstName, parent2LastName: parent2.lastName,
        parent2Phone: parent2.phone, parent2Email: parent2.email,
        teamId: teamId || null,
        subscriptionId, subscriptionTitle, subscriptionPriceCents,
        items: reqItems,
        couponCode: couponResult?.couponCode || "",
        couponDiscountCents: couponResult?.discountCents || 0,
      };

      const saveRes = await fetch(`/api/register/${activityId}/save`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const saveData = await saveRes.json();
      if (!saveData.order) { alert(saveData.error || "Failed to save"); setPaying(false); return; }

      const orderId = saveData.order._id;
      const total = computeTotal();

      if (!activity?.hasPayment || total === 0) {
        window.location.href = `/register/${activityId}/success`;
        return;
      }

      const checkoutRes = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, token: token || undefined }),
      });
      const checkoutData = await checkoutRes.json();
      if (checkoutData.url) {
        window.location.href = checkoutData.url;
      } else {
        alert(checkoutData.error || "Failed to create payment");
        setPaying(false);
      }
    } catch {
      alert("Something went wrong");
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Cannot Access Registration</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!verified && mode === "token") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{activity?.title || "Registration"}</h2>
          <p className="text-sm text-gray-500 mb-6">{activity?.clubName}</p>
          <p className="text-sm text-gray-600 mb-4">Verify your email to continue with registration.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" value={otpEmail} onChange={(e) => setOtpEmail(e.target.value)} disabled={otpSent}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" placeholder="your@email.com" />
            </div>
            {!otpSent ? (
              <button onClick={sendOtp} disabled={otpLoading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {otpLoading ? "Sending..." : "Send Verification Code"}
              </button>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Verification Code</label>
                  <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm text-center tracking-widest text-lg" placeholder="000000" />
                </div>
                <button onClick={verifyOtp} disabled={otpLoading} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {otpLoading ? "Verifying..." : "Verify & Continue"}
                </button>
                <button onClick={() => { setOtpSent(false); setOtpCode(""); }} className="w-full text-sm text-gray-500 hover:text-gray-700">
                  Resend code
                </button>
              </>
            )}
            {otpError && <p className="text-sm text-red-600 text-center">{otpError}</p>}
          </div>
        </div>
      </div>
    );
  }

  const currentSub = subscriptions.find((s) => s._id === subscriptionId);
  const total = computeTotal();
  const availableSubs = teamId ? getSubsForTeam(teamId) : subscriptions;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{activity?.title || "Registration"}</h1>
          <p className="text-sm text-gray-500 mt-1">{activity?.clubName}{activity?.season ? ` · ${activity.season}` : ""}</p>
        </div>

        <StepIndicator current={step} completed={completedSteps} />

        <div className="bg-white rounded-xl shadow-sm border p-6">

          {step === 1 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Parent / Guardian Details</h3>
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Parent 1 (required)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-gray-500 mb-1">First Name *</label>
                    <input value={parent1.firstName} onChange={(e) => setParent1({ ...parent1, firstName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Last Name *</label>
                    <input value={parent1.lastName} onChange={(e) => setParent1({ ...parent1, lastName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs text-gray-500 mb-1">Phone *</label>
                    <input value={parent1.phone} onChange={(e) => setParent1({ ...parent1, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Email *</label>
                    <input type="email" value={parent1.email} onChange={(e) => setParent1({ ...parent1, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <hr />
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Parent 2 <span className="text-gray-400">(optional)</span></h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-gray-500 mb-1">First Name</label>
                    <input value={parent2.firstName} onChange={(e) => setParent2({ ...parent2, firstName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Last Name</label>
                    <input value={parent2.lastName} onChange={(e) => setParent2({ ...parent2, lastName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs text-gray-500 mb-1">Phone</label>
                    <input value={parent2.phone} onChange={(e) => setParent2({ ...parent2, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input type="email" value={parent2.email} onChange={(e) => setParent2({ ...parent2, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={completeStep1} disabled={!parent1.firstName || !parent1.lastName || !parent1.phone || !parent1.email}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Player Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-gray-500 mb-1">First Name *</label>
                  <input value={player.firstName} onChange={(e) => setPlayer({ ...player, firstName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Last Name *</label>
                  <input value={player.lastName} onChange={(e) => setPlayer({ ...player, lastName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-gray-500 mb-1">Date of Birth *</label>
                  <input type="date" value={player.dob} onChange={(e) => setPlayer({ ...player, dob: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Gender *</label>
                  <select value={player.gender} onChange={(e) => setPlayer({ ...player, gender: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input value={player.phone} onChange={(e) => setPlayer({ ...player, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input type="email" value={player.email} onChange={(e) => setPlayer({ ...player, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>

              {teams.length > 0 && !order?.teamId && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Team *</label>
                  <select value={teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select a team</option>
                    {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name} ({t.season})</option>)}
                  </select>
                </div>
              )}

              {activity?.hasPayment && availableSubs.length > 1 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Subscription *</label>
                  <select value={subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select a subscription</option>
                    {availableSubs.map((s) => {
                      const tp = (s.teamPricing || []).find((tp) => String(tp.teamId) === String(teamId));
                      return <option key={s._id} value={s._id}>{s.title}{tp ? ` — $${centsToDisplay(tp.priceCents)}` : ""}</option>;
                    })}
                  </select>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => goToStep(1)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                  ← Back
                </button>
                <button onClick={completeStep2} disabled={!player.firstName || !player.lastName || !player.gender || !player.dob}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Invoice & Payment</h3>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Player</span>
                  <span className="font-medium">{player.firstName} {player.lastName}</span>
                </div>
                {teamId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Team</span>
                    <span className="font-medium">{teams.find((t) => String(t.teamId) === String(teamId))?.name || ""}</span>
                  </div>
                )}
                {subscriptionTitle && (
                  <>
                    <hr />
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">{subscriptionTitle}</span>
                      <span className="font-medium">${centsToDisplay(subscriptionPriceCents)}</span>
                    </div>
                  </>
                )}
                {currentSub?.items?.filter((i) => i.isRequired).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.name} × {item.quantity || 1}</span>
                    <span className="font-medium">${centsToDisplay((item.priceCents || 0) * (item.quantity || 1))}</span>
                  </div>
                ))}
                {couponResult && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Coupon: {couponResult.couponName}</span>
                    <span>-${centsToDisplay(couponResult.discountCents)}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>${centsToDisplay(total)}</span>
                </div>
              </div>

              {activity?.hasPayment && total > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Coupon Code</label>
                  <div className="flex gap-2">
                    <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Enter coupon code"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                    <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}
                      className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                      {couponLoading ? "..." : "Apply"}
                    </button>
                  </div>
                </div>
              )}

              {activity?.hasPayment && total > 0 && currentSub?.paymentTypes && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Payment method: Card</p>
                  {currentSub.paymentMessages?.card && (
                    <p className="text-xs text-gray-400 italic">{currentSub.paymentMessages.card}</p>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => goToStep(2)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                  ← Back
                </button>
                <button onClick={saveAndPay} disabled={paying}
                  className="bg-blue-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                  {paying ? "Processing..." : total > 0 && activity?.hasPayment ? `Pay $${centsToDisplay(total)}` : "Complete Registration"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
