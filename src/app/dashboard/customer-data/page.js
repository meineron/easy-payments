import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

export default function ClubCustomerDataPage() {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.customerData.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const [tab, setTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    fetchData();
  }, [tab]);

  async function fetchData() {
    setLoading(true);
    setError("");
    setExpandedRow(null);

    try {
      if (tab === "transactions") {
        const res = await fetch("/api/customer-stripe/transactions?limit=50");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const sorted = (data.transactions || []).sort((a, b) => b.created - a.created);
        setTransactions(sorted);
      } else if (tab === "products") {
        const res = await fetch("/api/customer-stripe/products?limit=50");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setProducts(data.products || []);
      } else {
        const res = await fetch("/api/customer-stripe/customers?limit=50");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setCustomers(data.customers || []);
      }
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }

  function formatDate(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  function formatAmount(amount, currency) {
    if (amount == null) return "—";
    return `$${(amount / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
  }

  function statusBadge(status) {
    const colors = {
      succeeded: "bg-green-100 text-green-700",
      active: "bg-green-100 text-green-700",
      pending: "bg-yellow-100 text-yellow-700",
      failed: "bg-red-100 text-red-700",
      canceled: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
    );
  }

  function cardBrandLabel(brand) {
    const brands = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" };
    return brands[brand] || brand || "—";
  }

  const tabs = [
    { id: "transactions", label: t("transactions") },
    { id: "products", label: t("products") },
    { id: "customers", label: t("customers") },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h2>

      <div className="flex gap-2 mb-6">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === tabItem.id
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {tabItem.label}
          </button>
        ))}
        <button
          onClick={fetchData}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {loading ? tc("loading") : tc("refresh")}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">{tc("loading")}</p>
      ) : tab === "transactions" ? (
        <TransactionsTable
          t={t}
          tc={tc}
          transactions={transactions}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          formatDateTime={formatDateTime}
          formatDate={formatDate}
          formatAmount={formatAmount}
          statusBadge={statusBadge}
          cardBrandLabel={cardBrandLabel}
        />
      ) : tab === "products" ? (
        <ProductsTable t={t} tc={tc} products={products} formatDate={formatDate} formatAmount={formatAmount} />
      ) : (
        <CustomersTable t={t} tc={tc} customers={customers} formatDate={formatDate} formatAmount={formatAmount} />
      )}
    </div>
  );
}

function TransactionsTable({ t, tc, transactions, expandedRow, setExpandedRow, formatDateTime, formatDate, formatAmount, statusBadge, cardBrandLabel }) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500">{t("noTransactions")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("date")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("amount")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("status")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("paymentMethod")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("customer")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("description")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("refund")}</th>
              <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("links")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                t={t}
                tx={tx}
                isExpanded={expandedRow === tx.id}
                onToggle={() => setExpandedRow(expandedRow === tx.id ? null : tx.id)}
                formatDateTime={formatDateTime}
                formatDate={formatDate}
                formatAmount={formatAmount}
                statusBadge={statusBadge}
                cardBrandLabel={cardBrandLabel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionRow({ t, tx, isExpanded, onToggle, formatDateTime, formatDate, formatAmount, statusBadge, cardBrandLabel }) {
  return (
    <>
      <tr className="hover:bg-gray-50 transition cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-4 text-sm text-gray-400">
          <span className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
        </td>
        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDate(tx.created)}</td>
        <td className="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{formatAmount(tx.amount, tx.currency)}</td>
        <td className="px-4 py-4">{statusBadge(tx.status)}</td>
        <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
          {tx.card ? (
            <span>
              {cardBrandLabel(tx.card.brand)} **** {tx.card.last4}
              <span className="text-gray-400 ml-1">
                {String(tx.card.expMonth).padStart(2, "0")}/{tx.card.expYear}
              </span>
            </span>
          ) : (
            <span className="text-gray-400">{tx.paymentMethodType || "—"}</span>
          )}
        </td>
        <td className="px-4 py-4 text-sm">
          <div className="text-gray-900">{tx.customerName || "—"}</div>
          <div className="text-gray-400 text-xs">{tx.customerEmail || ""}</div>
        </td>
        <td className="px-4 py-4 text-sm text-gray-600 max-w-[200px] truncate">{tx.description || "—"}</td>
        <td className="px-4 py-4 text-sm whitespace-nowrap">
          {tx.refunded ? (
            <div>
              <span className="text-red-600 font-medium">{formatAmount(tx.amountRefunded, tx.currency)}</span>
              <div className="text-gray-400 text-xs">{formatDate(tx.refundDate)}</div>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-4 text-sm whitespace-nowrap">
          <div className="flex gap-2">
            {tx.receiptUrl && (
              <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{t("receipt")}</a>
            )}
            {tx.invoiceUrl && (
              <a href={tx.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>{t("invoice")}</a>
            )}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50 px-6 py-4">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">{t("details")}</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-gray-500 min-w-[140px]">{t("chargeId")}</dt>
                    <dd className="text-gray-900 font-mono text-xs">{tx.id}</dd>
                  </div>
                  {tx.paymentIntentId && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 min-w-[140px]">{t("paymentIntentId")}</dt>
                      <dd className="text-gray-900 font-mono text-xs">{tx.paymentIntentId}</dd>
                    </div>
                  )}
                  {tx.paymentMethodId && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 min-w-[140px]">{t("paymentMethodId")}</dt>
                      <dd className="text-gray-900 font-mono text-xs">{tx.paymentMethodId}</dd>
                    </div>
                  )}
                  {tx.failureMessage && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 min-w-[140px]">{t("declineReason")}</dt>
                      <dd className="text-red-600">{tx.failureMessage} ({tx.failureCode})</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">{t("eventTimeline")}</h4>
                {tx.events && tx.events.length > 0 ? (
                  <div className="space-y-2">
                    {tx.events.map((evt, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-2 h-2 rounded-full mt-1.5 ${
                            evt.type.includes("succeeded") ? "bg-green-500" :
                            evt.type.includes("failed") ? "bg-red-500" :
                            evt.type.includes("refund") ? "bg-orange-500" :
                            "bg-blue-500"
                          }`} />
                          {i < tx.events.length - 1 && <div className="w-px h-4 bg-gray-200 mt-1" />}
                        </div>
                        <div>
                          <p className="text-xs font-mono text-gray-600">{evt.type}</p>
                          <p className="text-xs text-gray-400">{evt.detail}</p>
                          <p className="text-xs text-gray-300">{formatDateTime(evt.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">{t("noEvents")}</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProductsTable({ t, tc, products, formatDate, formatAmount }) {
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500">{t("noProducts")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("name")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("price")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("type")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("status")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("created")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {products.map((prod) => {
            const price = typeof prod.default_price === "object" ? prod.default_price : null;
            const isRecurring = !!price?.recurring;
            return (
              <tr key={prod.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{prod.name}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                  {price ? (
                    <>
                      {formatAmount(price.unit_amount, price.currency)}
                      {isRecurring && <span className="text-gray-400 font-normal"> / {price.recurring.interval}</span>}
                    </>
                  ) : "—"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{isRecurring ? t("recurring") : t("oneTime")}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    prod.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {prod.active ? t("active") : t("inactive")}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{formatDate(prod.created)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTable({ t, tc, customers, formatDate, formatAmount }) {
  if (customers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <p className="text-gray-500">{t("noCustomers")}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("email")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("name")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{tc("phone")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("created")}</th>
            <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("balance")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {customers.map((cust) => (
            <tr key={cust.id} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 text-sm text-gray-900">{cust.email || "—"}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{cust.name || "—"}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{cust.phone || "—"}</td>
              <td className="px-6 py-4 text-sm text-gray-500">{formatDate(cust.created)}</td>
              <td className="px-6 py-4 text-sm text-gray-500">
                {cust.balance ? formatAmount(cust.balance, cust.currency) : "$0.00"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
