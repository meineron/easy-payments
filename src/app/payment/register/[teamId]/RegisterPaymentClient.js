import { useState, useEffect } from "react";

const PHONE_PREFIXES = ["+1", "+44", "+972", "+61", "+49", "+33", "+34", "+39", "+81", "+86"];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export default function RegisterPaymentClient({ team, clubName, hasDiscount }) {
  const teamId = team._id;

  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  const [parent, setParent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phonePrefix: "+1",
    phone: "",
  });

  const [emailVerified, setEmailVerified] = useState(false);
  const [parentId, setParentId] = useState(null);
  const [verifyState, setVerifyState] = useState("idle");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");

  const [player, setPlayer] = useState({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobYear, setDobYear] = useState("");

  const [numPayments, setNumPayments] = useState(1);

  const totalCents = team.costCents;
  const discountCents = hasDiscount ? (team.loyaltyDiscountCents || 0) : 0;
  const afterDiscountCents = totalCents - discountCents;

  let firstPaymentCents = afterDiscountCents;
  let installmentCents = 0;
  let lastInstallmentCents = 0;

  if (numPayments > 1) {
    firstPaymentCents = Math.round(afterDiscountCents * 0.10);
    const remainingCents = afterDiscountCents - firstPaymentCents;
    installmentCents = Math.floor(remainingCents / (numPayments - 1));
    lastInstallmentCents = remainingCents - installmentCents * (numPayments - 2);
  }

  const now = new Date();
  const activityDate = team.activityStartDate ? new Date(team.activityStartDate) : null;
  const installmentStartDate = activityDate && activityDate > now ? activityDate : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const installmentStartFormatted = installmentStartDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function canSendCode() {
    return parent.firstName && parent.lastName && parent.email && parent.phone;
  }

  function canAdvanceStep2() {
    return player.firstName && player.lastName && player.address && player.city && player.state && player.zip;
  }

  async function handleSendCode() {
    setVerifyError("");
    setVerifyState("sending");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parent.email, teamId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || "Failed to send code");
        setVerifyState("idle");
        return;
      }
      setVerifyState("code_sent");
    } catch {
      setVerifyError("Failed to send verification code");
      setVerifyState("idle");
    }
  }

  async function handleVerifyCode() {
    setVerifyError("");
    setVerifyState("verifying");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parent.email,
          code: verifyCode,
          firstName: parent.firstName,
          lastName: parent.lastName,
          phone: parent.phone,
          phonePrefix: parent.phonePrefix,
          teamId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || "Verification failed");
        setVerifyState("code_sent");
        return;
      }
      setEmailVerified(true);
      setParentId(data.parentId);
      setVerifyState("verified");
    } catch {
      setVerifyError("Verification failed");
      setVerifyState("code_sent");
    }
  }

  async function handlePay() {
    setPaying(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${teamId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numPayments,
          hasLoyaltyDiscount: hasDiscount,
          parentId,
          parentFirstName: parent.firstName,
          parentLastName: parent.lastName,
          parentEmail: parent.email,
          parentPhonePrefix: parent.phonePrefix,
          parentPhone: parent.phone,
          playerFirstName: player.firstName,
          playerLastName: player.lastName,
          playerAddress: player.address,
          playerCity: player.city,
          playerState: player.state,
          playerZip: player.zip,
          playerDob: (dobYear && dobMonth && dobDay) ? `${dobYear}-${dobMonth}-${dobDay}` : null,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to create payment session");
        setPaying(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{clubName}</h1>
          <p className="text-gray-500 mt-1">Registration for {team.name} &middot; Season {team.season}</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition ${
                step === s ? "bg-blue-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {step > s ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 mb-6 text-xs text-gray-500">
          <span className={step === 1 ? "text-blue-600 font-medium" : ""}>Parent</span>
          <span className={step === 2 ? "text-blue-600 font-medium" : ""}>Player</span>
          <span className={step === 3 ? "text-blue-600 font-medium" : ""}>Payment</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {step === 1 && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Parent Information</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={parent.firstName}
                      onChange={(e) => { setParent({ ...parent, firstName: e.target.value }); if (emailVerified) { setEmailVerified(false); setVerifyState("idle"); setVerifyCode(""); } }}
                      disabled={emailVerified}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={parent.lastName}
                      onChange={(e) => { setParent({ ...parent, lastName: e.target.value }); if (emailVerified) { setEmailVerified(false); setVerifyState("idle"); setVerifyCode(""); } }}
                      disabled={emailVerified}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={parent.email}
                    onChange={(e) => { setParent({ ...parent, email: e.target.value }); if (emailVerified) { setEmailVerified(false); setVerifyState("idle"); setVerifyCode(""); } }}
                    disabled={emailVerified}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="parent@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <div className="flex gap-2 phone-group">
                    <select
                      value={parent.phonePrefix}
                      onChange={(e) => setParent({ ...parent, phonePrefix: e.target.value })}
                      disabled={emailVerified}
                      className="w-24 px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-sm disabled:bg-gray-50"
                    >
                      {PHONE_PREFIXES.map((prefix) => (
                        <option key={prefix} value={prefix}>{prefix}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={parent.phone}
                      onChange={(e) => setParent({ ...parent, phone: e.target.value })}
                      disabled={emailVerified}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                {!emailVerified && verifyState === "idle" && (
                  <button
                    onClick={handleSendCode}
                    disabled={!canSendCode()}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Verify Email
                  </button>
                )}

                {verifyState === "sending" && (
                  <div className="text-center py-3 text-sm text-gray-500">Sending verification code...</div>
                )}

                {(verifyState === "code_sent" || verifyState === "verifying") && (
                  <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-blue-800">
                      A 6-digit code has been sent to <span className="font-semibold">{parent.email}</span>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        maxLength={6}
                        className="flex-1 px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 text-center text-lg tracking-widest font-mono"
                        placeholder="000000"
                        autoFocus
                      />
                      <button
                        onClick={handleVerifyCode}
                        disabled={verifyCode.length !== 6 || verifyState === "verifying"}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-40"
                      >
                        {verifyState === "verifying" ? "..." : "Confirm"}
                      </button>
                    </div>
                    <button
                      onClick={handleSendCode}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Resend code
                    </button>
                  </div>
                )}

                {emailVerified && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-800">Email verified</span>
                  </div>
                )}

                {verifyError && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
                    {verifyError}
                  </div>
                )}
              </div>

              {emailVerified && (
                <div className="mt-6">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition"
                  >
                    Next: Player Details
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Player Details</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={player.firstName}
                      onChange={(e) => setPlayer({ ...player, firstName: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={player.lastName}
                      onChange={(e) => setPlayer({ ...player, lastName: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    >
                      <option value="">Month</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={String(m).padStart(2, "0")}>
                          {new Date(2000, m - 1).toLocaleString("en-US", { month: "long" })}
                        </option>
                      ))}
                    </select>
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    >
                      <option value="">Day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                      ))}
                    </select>
                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    >
                      <option value="">Year</option>
                      {Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - 4 - i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={player.address}
                    onChange={(e) => setPlayer({ ...player, address: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={player.city}
                      onChange={(e) => setPlayer({ ...player, city: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <select
                      value={player.state}
                      onChange={(e) => setPlayer({ ...player, state: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                    >
                      <option value="">Select</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={player.zip}
                      onChange={(e) => setPlayer({ ...player, zip: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                      placeholder="ZIP"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canAdvanceStep2()}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Payment
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment Summary</h2>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 mb-4">
                  <p className="text-gray-600">Parent: <span className="font-medium text-gray-900">{parent.firstName} {parent.lastName}</span></p>
                  <p className="text-gray-600">Player: <span className="font-medium text-gray-900">{player.firstName} {player.lastName}</span></p>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Registration Fee</span>
                    <span className="font-medium text-gray-900">${(totalCents / 100).toFixed(2)}</span>
                  </div>
                  {hasDiscount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600">Loyalty Discount</span>
                      <span className="font-medium text-green-600">-${(discountCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="font-bold text-gray-900 text-lg">${(afterDiscountCents / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-3">Number of Payments</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNumPayments(n)}
                      className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition ${
                        numPayments === n
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {n === 1 ? "Pay in Full" : `${n} Payments`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Payment Schedule</h3>
                {numPayments === 1 ? (
                  <div className="flex justify-between items-center py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Due Today</p>
                      <p className="text-xs text-gray-500">Full payment</p>
                    </div>
                    <span className="font-semibold text-gray-900">${(afterDiscountCents / 100).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-2 bg-blue-50 rounded-lg px-3">
                      <div>
                        <p className="text-sm font-medium text-blue-900">Due Today (Deposit)</p>
                        <p className="text-xs text-blue-600">10% of total</p>
                      </div>
                      <span className="font-semibold text-blue-900">${(firstPaymentCents / 100).toFixed(2)}</span>
                    </div>
                    {Array.from({ length: numPayments - 1 }, (_, i) => {
                      const isLast = i === numPayments - 2;
                      const amount = isLast ? lastInstallmentCents : installmentCents;
                      const paymentDate = new Date(installmentStartDate);
                      paymentDate.setMonth(paymentDate.getMonth() + i);
                      return (
                        <div key={i} className="flex justify-between items-center py-2 px-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">Installment {i + 1} of {numPayments - 1}</p>
                            <p className="text-xs text-gray-500">
                              {paymentDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <span className="font-medium text-gray-900">${(amount / 100).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100 px-3">
                      <span className="text-sm font-medium text-gray-500">Total of all payments</span>
                      <span className="text-sm font-medium text-gray-700">${(afterDiscountCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200 mb-4">
                    {error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="py-3.5 px-6 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={paying}
                    className="flex-1 bg-blue-600 text-white py-3.5 rounded-xl text-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 shadow-lg"
                  >
                    {paying
                      ? "Redirecting to payment..."
                      : numPayments === 1
                      ? `Pay $${(afterDiscountCents / 100).toFixed(2)}`
                      : `Pay $${(firstPaymentCents / 100).toFixed(2)} Now`}
                  </button>
                </div>
                {numPayments > 1 && (
                  <p className="text-xs text-gray-400 text-center mt-3">
                    Then {numPayments - 1} monthly payment{numPayments > 2 ? "s" : ""} of ${(installmentCents / 100).toFixed(2)} starting {installmentStartFormatted}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">Secure payment powered by Stripe</p>
      </div>
    </div>
  );
}
