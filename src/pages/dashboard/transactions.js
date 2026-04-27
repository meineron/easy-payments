import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { useRouter } from "next/router";
import DashboardLayout from "@/components/DashboardLayout";
export default function TransactionsPage() {
  const intl = useIntl();
  // next-intl migration: use intl.formatMessage({ id: "payments.transactions.key" })
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTransactions() {
      const res = await fetch("/api/transactions");
      const data = await res.json();
      setTransactions(data.transactions || []);
      setLoading(false);
    }
    fetchTransactions();
  }, []);

  function formatAmount(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h2>

      {loading ? (
        <p className="text-gray-500">{t("loadingTransactions")}</p>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t("noTransactions")}</p>
          <p className="text-sm text-gray-400 mt-1">
            {t("noTransactionsDesc")}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("date")}
                </th>
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("amount")}
                </th>
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("platformFee")}
                </th>
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("status")}
                </th>
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("email")}
                </th>
                <th className="text-start px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("invoice")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((tx) => (
                <tr key={tx._id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {formatDate(tx.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {formatAmount(tx.amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatAmount(tx.applicationFee)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tx.status === "succeeded"
                          ? "bg-green-100 text-green-700"
                          : tx.status === "pending"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {tx.customerEmail || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {tx.invoiceUrl ? (
                      <div className="flex gap-2">
                        <a
                          href={tx.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {t("invoice")}
                        </a>
                        {tx.invoicePdf && (
                          <a
                            href={tx.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {t("pdf")}
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

TransactionsPage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
