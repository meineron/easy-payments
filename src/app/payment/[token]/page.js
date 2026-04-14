"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import IntlProvider from "@/components/IntlProvider";
import { getMessages, getDirection, defaultLocale } from "@/lib/i18n";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

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

function LoadingView() {
  const tc = useTranslations("common");
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      </div>
    </div>
  );
}

function PaymentErrorView({ error }) {
  const t = useTranslations("payment");
  const isPaid = error === "Already paid";
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {isPaid ? (
          <>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("alreadyPaid")}</h2>
            <p className="text-sm text-gray-500">{t("alreadyPaidDesc")}</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-600 text-xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("linkNotFound")}</h2>
            <p className="text-sm text-gray-500">{t("linkInvalid")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentPageInner({ data, token }) {
  const t = useTranslations("payment");
  const tc = useTranslations("common");

  const [chosenInstallments, setChosenInstallments] = useState(
    () => (data.installmentOptions?.maxInstallments > 1 ? 1 : 1),
  );
  const [paying, setPaying] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [payerFirstName, setPayerFirstName] = useState("");
  const [payerLastName, setPayerLastName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");

  const { schedule, feeCents } = useMemo(() => {
    if (!data) return { schedule: [], feeCents: 0 };
    const { order, installmentOptions } = data;
    return buildPreviewSchedule(
      order.totalCostCents,
      installmentOptions.dueDateAmountCents,
      chosenInstallments,
      installmentOptions.firstInstallmentDate,
      { payInFull: t("payInFull"), dueNow: t("dueNow") },
      installmentOptions,
    );
  }, [data, chosenInstallments, t]);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/payment/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chosenInstallments,
          payerFirstName: payerFirstName.trim(),
          payerLastName: payerLastName.trim(),
          payerEmail: payerEmail.trim(),
        }),
      });
      const d = await res.json();
      if (d.url) {
        window.location.href = d.url;
      } else {
        alert(d.error || t("failedToCreateCheckout"));
        setPaying(false);
      }
    } catch {
      alert(tc("somethingWentWrong"));
      setPaying(false);
    }
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
            <p className="text-sm text-blue-700 font-medium">{t("paymentFor")}</p>
            <p className="text-lg font-semibold text-blue-900">{order.playerFirstName} {order.playerLastName}</p>
            {order.teamName && <p className="text-xs text-blue-600 mt-0.5">{order.teamName}</p>}
          </div>

          {/* Invoice Details */}
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{t("invoice")}</h3>

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
                <span>{t("discount")}{order.discountType === "percentage" ? ` (${order.discountValue}%)` : ""}</span>
                <span>-${centsToDisplay(fixedDiscount)}</span>
              </div>
            )}

            {order.couponDiscountCents > 0 && (
              <div className="flex justify-between text-sm text-green-700">
                <span>{order.couponCode ? `${t("coupon")}: ${order.couponCode}` : t("coupon")}</span>
                <span>-${centsToDisplay(order.couponDiscountCents)}</span>
              </div>
            )}

            {club.passStripeFeeToCustomer && (
              <div className="flex justify-between text-sm text-gray-500 italic">
                <span>{t("processingFee")}</span>
                <span>{t("processingFeeAppliedAtCheckout")}</span>
              </div>
            )}

            <hr className="border-gray-200" />

            <div className="flex justify-between text-base font-bold">
              <span>{tc("total")}</span>
              <span>${centsToDisplay(order.totalCostCents)}</span>
            </div>

            {order.paidCents > 0 && (
              <>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t("alreadyPaid")}</span>
                  <span>-${centsToDisplay(order.paidCents)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-blue-700">
                  <span>{t("amountDue")}</span>
                  <span>${centsToDisplay(amountDue)}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                  <p className="text-sm text-amber-800 font-medium">{t("partialPaidNotice")}</p>
                  <p className="text-xs text-amber-700 mt-1">{t("partialPaidContactOffice")}</p>
                </div>
              </>
            )}
          </div>

          {/* Installment Picker */}
          {maxInst > 1 && (
            <div className="px-6 py-5 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{t("paymentPlan")}</h3>
              <select
                value={chosenInstallments}
                onChange={(e) => setChosenInstallments(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: maxInst }, (_, i) => i + 1).map((n) => {
                  const optFee = computeFee(order.totalCostCents, n, installmentOptions);
                  const feeTag = optFee > 0 ? ` (+${installmentOptions.installmentFeePercent}% ${t("fee")})` : "";
                  return (
                    <option key={n} value={n}>
                      {n === 1
                        ? `${t("payFullOption")} — $${centsToDisplay(amountDue)}`
                        : `${t("paymentsOption", { count: n })} — $${centsToDisplay(installmentOptions.dueDateAmountCents || amountDue)} ${t("nowPlus")} ${n - 1} ${t("installments")}${feeTag}`}
                    </option>
                  );
                })}
              </select>

              {installmentOptions.installmentFeeThreshold > 0 && installmentOptions.installmentFeePercent > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {t("installmentFeeHint", {
                    threshold: installmentOptions.installmentFeeThreshold,
                    percent: installmentOptions.installmentFeePercent,
                  })}
                </p>
              )}

              {chosenInstallments > 1 && installmentOptions.firstInstallmentDate && (
                <p className="text-xs text-gray-500 mt-2">
                  {t("installmentNote", { date: new Date(installmentOptions.firstInstallmentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) })}
                </p>
              )}

              {/* Schedule Preview */}
              {schedule.length > 0 && (
                <div className="mt-4 border rounded-lg overflow-hidden">
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
                  {t("installmentFeeNotice", {
                    percent: installmentOptions.installmentFeePercent,
                    fee: `$${centsToDisplay(feeCents)}`,
                    total: `$${centsToDisplay(order.totalCostCents + feeCents)}`,
                  })}
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
                    <p className="font-semibold mb-1">{t("recurringAgreement")}</p>
                    <p>{t("recurringDesc", {
                      club: data?.club?.name || t("clubFallback"),
                      amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
                      count: chosenInstallments - 1,
                      installmentAmount: `$${centsToDisplay(schedule[1]?.amountCents || 0)}`,
                      total: `$${centsToDisplay(amountDue + feeCents)}`,
                    })}</p>
                    {feeCents > 0 && (
                      <p className="mt-1 font-medium">{t("recurringFeeNote", {
                        percent: installmentOptions.installmentFeePercent,
                        fee: `$${centsToDisplay(feeCents)}`,
                      })}</p>
                    )}
                    {installmentOptions.firstInstallmentDate && (
                      <p className="mt-1">{t("installmentsStart", { date: new Date(installmentOptions.firstInstallmentDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) })}</p>
                    )}
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">
                  {feeCents > 0
                    ? t("agreeRecurringWithFee", { percent: installmentOptions.installmentFeePercent, fee: `$${centsToDisplay(feeCents)}` })
                    : t("agreeRecurring")}
                </span>
              </label>
            </div>
          )}

          {/* Payer Details */}
          <div className="px-6 py-5 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{t("payerDetails")}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")} *</label>
                <input
                  type="text"
                  value={payerFirstName}
                  onChange={(e) => setPayerFirstName(e.target.value)}
                  placeholder={tc("firstName")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")} *</label>
                <input
                  type="text"
                  value={payerLastName}
                  onChange={(e) => setPayerLastName(e.target.value)}
                  placeholder={tc("lastName")}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")} *</label>
              <input
                type="email"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Pay Button */}
          <div className="px-6 py-5 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              <span>{t("cardPayment")}</span>
            </div>
            <button
              onClick={handlePay}
              disabled={paying || amountDue <= 0 || (chosenInstallments > 1 && !agreedToTerms) || !payerFirstName.trim() || !payerLastName.trim() || !payerEmail.trim()}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
            >
              {paying ? t("redirecting") : t("payNow", { amount: `$${centsToDisplay(schedule[0]?.amountCents || amountDue)}` })}
            </button>
            {chosenInstallments > 1 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                {t("firstPayment", {
                  amount: `$${centsToDisplay(schedule[0]?.amountCents || 0)}`,
                  count: chosenInstallments - 1,
                })}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">{t("securePayment")}</p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locale, setLocale] = useState(defaultLocale);

  useEffect(() => {
    fetch(`/api/payment/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); }
        else {
          setData(d);
          const lang = d.club?.language || "en";
          setLocale(lang);
          document.documentElement.lang = lang;
          document.documentElement.dir = getDirection(lang);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(getMessages(defaultLocale).payment.failedToLoad);
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <IntlProvider locale={defaultLocale} messages={getMessages(defaultLocale)}>
        <LoadingView />
      </IntlProvider>
    );
  }

  if (error) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        <PaymentErrorView error={error} />
      </IntlProvider>
    );
  }

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      <PaymentPageInner key={token} data={data} token={token} />
    </IntlProvider>
  );
}
