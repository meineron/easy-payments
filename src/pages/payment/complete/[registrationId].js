import { useState, useEffect } from "react";
import { useRouter } from "next/router"; // migrated from next/navigation

export default function CompletePaymentPage() {
  return <CompletePaymentContent />;
}

function CompletePaymentContent() {
  const router = useRouter();
  const { registrationId } = router.query;

  const [reg, setReg] = useState(null);
  const [team, setTeam] = useState(null);
  const [clubName, setClubName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [verifyState, setVerifyState] = useState("idle");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  const [numPayments, setNumPayments] = useState(1);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!registrationId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/registrations/${registrationId}/public`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Registration not found");
          return;
        }
        setReg(data.registration);
        setTeam(data.team);
        setClubName(data.clubName);
        setNumPayments(data.registration.numPayments);
      } catch {
        if (!cancelled) setError("Failed to load registration");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [registrationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !reg || !team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load</h2>
          <p className="text-gray-500">{error || "This payment link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const totalCents = reg.subscriptionCostCents;
  const discountCents = reg.discountCents;
  const afterDiscountCents = reg.finalCostCents;

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

  async function handleSendCode() {
    if (!email.trim()) return;
    if (email.trim().toLowerCase() !== reg.parentEmail.toLowerCase()) {
      setVerifyError("This email does not match the registration. Please use the email you registered with.");
      return;
    }
    setVerifyError("");
    setVerifyState("sending");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, teamId: team._id }),
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
          email,
          code: verifyCode,
          teamId: team._id,
          verifyOnly: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || "Verification failed");
        setVerifyState("code_sent");
        return;
      }
      setEmailVerified(true);
      setVerifyState("verified");
      setStep(2);
    } catch {
      setVerifyError("Verification failed");
      setVerifyState("code_sent");
    }
  }

  async function handlePay() {
    setPaying(true);
    setError("");
    try {
      const res = await fetch(`/api/registrations/${registrationId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numPayments }),
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
          <p className="text-gray-500 mt-1">Complete Payment for {team.name} &middot; Season {team.season}</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map((s) => (
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
              {s < 2 && <div className={`w-16 h-0.5 ${step > s ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-12 mb-6 text-xs text-gray-500">
          <span className={step === 1 ? "text-blue-600 font-medium" : ""}>Verify Email</span>
          <span className={step === 2 ? "text-blue-600 font-medium" : ""}>Payment</span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Registration Info Banner */}
          <div className="bg-gray-50 px-4 sm:px-6 py-3 border-b border-gray-100">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
              <div>
                <span className="text-gray-500">Player: </span>
                <span className="font-medium text-gray-900">{reg.playerFirstName} {reg.playerLastName}</span>
              </div>
              <div>
                <span className="text-gray-500">Parent: </span>
                <span className="font-medium text-gray-900">{reg.parentFirstName} {reg.parentLastName}</span>
              </div>
            </div>
          </div>

          {/* Step 1: Email Verification */}
          {step === 1 && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Verify Your Email</h2>
              <p className="text-sm text-gray-500 mb-4">
                Enter the email you used during registration to verify your identity and proceed to payment.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={emailVerified}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="parent@email.com"
                  />
                </div>

                {!emailVerified && verifyState === "idle" && (
                  <button
                    onClick={handleSendCode}
                    disabled={!email.trim()}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send Verification Code
                  </button>
                )}

                {verifyState === "sending" && (
                  <div className="text-center py-3 text-sm text-gray-500">Sending verification code...</div>
                )}

                {(verifyState === "code_sent" || verifyState === "verifying") && (
                  <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-blue-800">
                      A 6-digit code has been sent to <span className="font-semibold">{email}</span>
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
                    <button onClick={handleSendCode} className="text-xs text-blue-600 hover:text-blue-800 underline">
                      Resend code
                    </button>
                  </div>
                )}

                {verifyError && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
                    {verifyError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Payment */}
          {step === 2 && (
            <>
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment Summary</h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Registration Fee</span>
                    <span className="font-medium text-gray-900">${(totalCents / 100).toFixed(2)}</span>
                  </div>
                  {discountCents > 0 && (
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
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl text-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 shadow-lg"
                >
                  {paying
                    ? "Redirecting to payment..."
                    : numPayments === 1
                    ? `Pay $${(afterDiscountCents / 100).toFixed(2)}`
                    : `Pay $${(firstPaymentCents / 100).toFixed(2)} Now`}
                </button>
                {numPayments > 1 && installmentStartFormatted && (
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
