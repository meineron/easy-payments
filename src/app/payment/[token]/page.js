"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

function buildPreviewSchedule(totalCostCents, dueDateAmountCents, chosen, firstInstallmentDate) {
  if (chosen <= 1) {
    return [{ number: 1, date: new Date(), amountCents: totalCostCents, label: "Due Now — Pay in Full" }];
  }
  const dueAmount = dueDateAmountCents || totalCostCents;
  const remaining = Math.max(0, totalCostCents - dueAmount);
  const numRemaining = Math.max(0, chosen - 1);

  const schedule = [{ number: 1, date: new Date(), amountCents: dueAmount, label: "Due Now" }];
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
  return schedule;
}

export default function PaymentPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chosenInstallments, setChosenInstallments] = useState(1);
  const [paying, setPaying] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    fetch(`/api/payment/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else {
          setData(d);
          setChosenInstallments(d.installmentOptions?.maxInstallments > 1 ? 1 : 1);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load payment details"); setLoading(false); });
  }, [token]);

  const schedule = useMemo(() => {
    if (!data) return [];
    const { order, installmentOptions } = data;
    return buildPreviewSchedule(
      order.totalCostCents,
      installmentOptions.dueDateAmountCents,
      chosenInstallments,
      installmentOptions.firstInstallmentDate,
    );
  }, [data, chosenInstallments]);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/payment/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosenInstallments }),
      });
      const d = await res.json();
      if (d.url) {
        window.location.href = d.url;
      } else {
        alert(d.error || "Failed to create checkout");
        setPaying(false);
      }
    } catch {
      alert("Something went wrong");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{error === "Already paid" ? "Already Paid" : "Link Not Found"}</h2>
          <p className="text-sm text-gray-500">{error === "Already paid" ? "This invoice has already been paid. Thank you!" : "This payment link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  const { order, activity, club, installmentOptions } = data;
  const maxInst = installmentOptions.maxInstallments || 1;

  const regularItemsTotal = (order.items || []).reduce((s, i) => s + (i.priceCents || 0) * (i.quantity || 1), 0);
  const discountItemsTotal = (order.discountItems || []).reduce((s, i) => s + (i.priceCents || 0) * (i.quantity || 1), 0);

  let fixedDiscount = 0;
  if (order.discountType === "amount") fixedDiscount = order.discountValue || 0;
  else if (order.discountType === "percentage") fixedDiscount = Math.round((order.subscriptionPriceCents + regularItemsTotal) * (order.discountValue || 0) / 100);

  const amountDue = order.totalCostCents - (order.paidCents || 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header with Club Logo */}
        <div className="text-center mb-6">
          {club.logoUrl && (
            <img src={club.logoUrl} alt={club.name} className="h-16 w-auto mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-xl font-bold text-gray-900">{club.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{activity.title}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Player Info */}
          <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
            <p className="text-sm text-blue-700 font-medium">Payment for</p>
            <p className="text-lg font-semibold text-blue-900">{order.playerFirstName} {order.playerLastName}</p>
            {order.teamName && <p className="text-xs text-blue-600 mt-0.5">{order.teamName}</p>}
          </div>

          {/* Invoice Details */}
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Invoice</h3>

            {order.subscriptionTitle && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{order.subscriptionTitle}</span>
                <span className="font-medium">${centsToDisplay(order.subscriptionPriceCents)}</span>
              </div>
            )}

            {(order.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</span>
                <span className="font-medium">${centsToDisplay(item.priceCents * (item.quantity || 1))}</span>
              </div>
            ))}

            {(order.discountItems || []).map((item, idx) => (
              <div key={`d${idx}`} className="flex justify-between text-sm text-green-700">
                <span>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</span>
                <span>-${centsToDisplay(item.priceCents * (item.quantity || 1))}</span>
              </div>
            ))}

            {fixedDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Discount{order.discountType === "percentage" ? ` (${order.discountValue}%)` : ""}</span>
                <span>-${centsToDisplay(fixedDiscount)}</span>
              </div>
            )}

            {order.couponDiscountCents > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>Coupon{order.couponCode ? `: ${order.couponCode}` : ""}</span>
                <span>-${centsToDisplay(order.couponDiscountCents)}</span>
              </div>
            )}

            <hr className="border-gray-200" />

            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>${centsToDisplay(order.totalCostCents)}</span>
            </div>

            {order.paidCents > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Already Paid</span>
                  <span>-${centsToDisplay(order.paidCents)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-blue-700">
                  <span>Amount Due</span>
                  <span>${centsToDisplay(amountDue)}</span>
                </div>
              </>
            )}
          </div>

          {/* Installment Picker */}
          {maxInst > 1 && (
            <div className="px-6 py-5 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Payment Plan</h3>
              <select
                value={chosenInstallments}
                onChange={(e) => setChosenInstallments(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: maxInst }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? `Pay in Full — $${centsToDisplay(amountDue)}` : `${n} Payments — $${centsToDisplay(installmentOptions.dueDateAmountCents || amountDue)} now + ${n - 1} installments`}
                  </option>
                ))}
              </select>

              {chosenInstallments > 1 && installmentOptions.firstInstallmentDate && (
                <p className="text-xs text-gray-500 mt-2">
                  * If paid after {new Date(installmentOptions.firstInstallmentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, installments start on the 1st of the next month.
                </p>
              )}

              {/* Schedule Preview */}
              {schedule.length > 0 && (
                <div className="mt-4 border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 font-medium text-gray-600">#</th>
                        <th className="px-3 py-2 font-medium text-gray-600">Date</th>
                        <th className="px-3 py-2 font-medium text-gray-600 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {schedule.map((s, idx) => (
                        <tr key={idx} className={idx === 0 ? "bg-blue-50" : ""}>
                          <td className="px-3 py-2 text-gray-700">{s.number}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {s.label || new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">${centsToDisplay(s.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Commitment Notice */}
          {chosenInstallments > 1 && (
            <div className="px-6 py-4 border-t border-gray-100">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-2 items-start">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Recurring Payment Agreement</p>
                    <p>By proceeding, you authorize <strong>{data?.club?.name || "the club"}</strong> to charge your card <strong>${centsToDisplay(schedule[0]?.amountCents || 0)}</strong> today and <strong>{chosenInstallments - 1} additional payment{chosenInstallments > 2 ? "s" : ""}</strong> of <strong>${centsToDisplay(schedule[1]?.amountCents || 0)}</strong> each, for a total of <strong>${centsToDisplay(amountDue)}</strong>.</p>
                    {installmentOptions.firstInstallmentDate && (
                      <p className="mt-1">Installments will be charged automatically starting <strong>{new Date(installmentOptions.firstInstallmentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.</p>
                    )}
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">I agree to the recurring payment schedule above and authorize automatic charges to my card.</span>
              </label>
            </div>
          )}

          {/* Pay Button */}
          <div className="px-6 py-5 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              <span>Card payment</span>
            </div>
            <button
              onClick={handlePay}
              disabled={paying || amountDue <= 0 || (chosenInstallments > 1 && !agreedToTerms)}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
            >
              {paying ? "Redirecting to payment..." : `Pay $${centsToDisplay(schedule[0]?.amountCents || amountDue)} Now`}
            </button>
            {chosenInstallments > 1 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                First payment of ${centsToDisplay(schedule[0]?.amountCents || 0)} charged now. Remaining {chosenInstallments - 1} payment{chosenInstallments > 2 ? "s" : ""} charged automatically.
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">Secure payment powered by Stripe</p>
      </div>
    </div>
  );
}
