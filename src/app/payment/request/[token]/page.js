import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router"; // migrated
import { useIntl } from "react-intl";
import IntlProvider from "@/components/IntlProvider";
import { getMessages, getDirection, defaultLocale } from "@/lib/i18n";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }

function buildPRSchedule(totalCents, chosen) {
  if (chosen <= 1) {
    return [{ number: 1, date: new Date(), amountCents: totalCents }];
  }
  const perInstallment = Math.round(totalCents / chosen);
  const schedule = [];
  const now = new Date();
  for (let i = 0; i < chosen; i++) {
    const d = i === 0 ? now : new Date(now.getFullYear(), now.getMonth() + i, now.getDate());
    const amt = i === chosen - 1 ? totalCents - perInstallment * (chosen - 1) : perInstallment;
    schedule.push({ number: i + 1, date: d, amountCents: amt });
  }
  return schedule;
}

function LoadingView() {
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-sm text-gray-500">{tc("loading")}</p>
      </div>
    </div>
  );
}

function ErrorView({ error }) {
  const t = (id, values) => intl.formatMessage({ id: `payments.paymentRequest.${id}` }, values);
  const isPaid = error === "Already paid";
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className={`w-12 h-12 rounded-full ${isPaid ? "bg-green-100" : "bg-red-100"} flex items-center justify-center mx-auto mb-4`}>
          <span className={`${isPaid ? "text-green-600" : "text-red-600"} text-xl`}>{isPaid ? "✓" : "!"}</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {isPaid ? t("alreadyPaid") : t("failedToLoad")}
        </h2>
        <p className="text-sm text-gray-500">
          {isPaid ? t("alreadyPaidDesc") : t("failedToLoad")}
        </p>
      </div>
    </div>
  );
}

function SuccessView() {
  const t = (id, values) => intl.formatMessage({ id: `payments.paymentRequest.${id}` }, values);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("alreadyPaid")}</h2>
        <p className="text-sm text-gray-500">{t("alreadyPaidDesc")}</p>
      </div>
    </div>
  );
}

function PaymentRequestInner({ data, token }) {
  const t = (id, values) => intl.formatMessage({ id: `payments.paymentRequest.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const tp = (id, values) => intl.formatMessage({ id: `payments.payment.${id}` }, values);
  const [paying, setPaying] = useState(false);
  const [chosenInstallments, setChosenInstallments] = useState(1);

  const { paymentRequest: pr, order, activity, club } = data;
  const allowed = pr.allowedInstallments || [1];
  const hasInstallmentOptions = allowed.length > 1 || (allowed.length === 1 && allowed[0] > 1);

  const schedule = useMemo(
    () => buildPRSchedule(pr.totalCents, chosenInstallments),
    [pr.totalCents, chosenInstallments],
  );

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/payment/request/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosenInstallments }),
      });
      const d = await res.json();
      if (d.url) {
        window.location.href = d.url;
      } else {
        alert(d.error || tp("failedToCreateCheckout"));
        setPaying(false);
      }
    } catch {
      alert(tc("somethingWentWrong"));
      setPaying(false);
    }
  }

  const dueNow = schedule[0]?.amountCents || pr.totalCents;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          {club.logoUrl && (
            <img src={club.logoUrl} alt={club.name} className="h-16 w-auto mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-xl font-bold text-gray-900">{club.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{activity.title}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
            <p className="text-sm text-blue-700 font-medium">{t("paymentRequestFor")}</p>
            <p className="text-lg font-semibold text-blue-900">
              {order.playerFirstName} {order.playerLastName}
            </p>
          </div>

          <div className="px-6 py-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              {t("itemsIncluded")}
            </h3>
            {(pr.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.name}</span>
                <span className="font-medium">${centsToDisplay(item.amountCents)}</span>
              </div>
            ))}

            <hr className="border-gray-200" />

            <div className="flex justify-between text-base font-bold">
              <span>{tc("total")}</span>
              <span>${centsToDisplay(pr.totalCents)}</span>
            </div>

            {pr.note && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mt-2">{pr.note}</p>
            )}
          </div>

          {hasInstallmentOptions && (
            <div className="px-6 py-5 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                {tp("paymentPlan")}
              </h3>
              <select
                value={chosenInstallments}
                onChange={(e) => setChosenInstallments(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {allowed.map((n) => (
                  <option key={n} value={n}>
                    {n === 1
                      ? `${t("payFullOption")} — $${centsToDisplay(pr.totalCents)}`
                      : `${t("xPayments", { count: n })} — $${centsToDisplay(Math.round(pr.totalCents / n))}/${tp("month")}`}
                  </option>
                ))}
              </select>

              {chosenInstallments > 1 && schedule.length > 0 && (
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
                            {idx === 0 ? t("dueNow") : new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2 text-end font-medium">${centsToDisplay(s.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-5 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              <span>{tp("cardPayment")}</span>
            </div>
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base"
            >
              {paying ? tp("redirecting") : t("payAmount", { amount: `$${centsToDisplay(dueNow)}` })}
            </button>
            {chosenInstallments > 1 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                {t("firstOfPayments", { amount: `$${centsToDisplay(dueNow)}`, count: chosenInstallments })}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">{tp("securePayment")}</p>
      </div>
    </div>
  );
}

export default function PaymentRequestPage() {
  const intl = useIntl();
  const router = useRouter();
  const { token } = router.query;
  const searchParams = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locale, setLocale] = useState(defaultLocale);
  const isSuccess = searchParams.get("success") === "1";

  useEffect(() => {
    fetch(`/api/payment/request/${token}`)
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
        setError("Failed to load");
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

  if (isSuccess || error === "Already paid") {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        <SuccessView />
      </IntlProvider>
    );
  }

  if (error) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        <ErrorView error={error} />
      </IntlProvider>
    );
  }

  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      <PaymentRequestInner key={token} data={data} token={token} />
    </IntlProvider>
  );
}
