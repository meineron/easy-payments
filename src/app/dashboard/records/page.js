"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

const STATUS_COLORS = {
  pending: "bg-red-100 text-red-700",
  partial: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  succeeded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function cents(v) {
  return ((v || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status, t }) {
  const key = status === "pending" ? "statusPending" : status === "partial" ? "statusPartial" : status === "paid" || status === "succeeded" ? "statusPaid" : status === "failed" ? "statusFailed" : "statusCancelled";
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{t(key)}</span>;
}

export default function RecordsPage() {
  const t = useTranslations("dashboardAnalytics");
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tab, setTab] = useState(searchParams.get("tab") || "registrations");
  const [season] = useState(searchParams.get("season") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const limit = 20;

  const paymentMethods = searchParams.get("paymentMethods") || "";
  const activityIds = searchParams.get("activityIds") || "";
  const teamIds = searchParams.get("teamIds") || "";

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      tab,
      season,
      page: String(page),
      limit: String(limit),
    });
    if (paymentMethods) params.set("paymentMethods", paymentMethods);
    if (activityIds) params.set("activityIds", activityIds);
    if (teamIds) params.set("teamIds", teamIds);
    if (statusFilter && tab === "registrations") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    try {
      const res = await fetch(`/api/dashboard/records?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    }
    setLoading(false);
  }, [tab, season, page, paymentMethods, activityIds, teamIds, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function changeTab(newTab) {
    setTab(newTab);
    setPage(1);
    setStatusFilter("");
    setSearch("");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition">
            {t("backToDashboard")}
          </Link>
          <h2 className="text-xl font-bold text-gray-900">{t("records")}</h2>
          {season && <span className="text-sm text-gray-400">{t("season")}: {season}</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {["registrations", "transactions", "late_due"].map((tb) => (
              <button
                key={tb}
                onClick={() => changeTab(tb)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${tab === tb ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {tb === "registrations" ? t("latestRegistrations") : tb === "transactions" ? t("latestTransactions") : t("lateDue")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {tab === "registrations" && (
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
              >
                <option value="">{t("allStatuses")}</option>
                <option value="pending">{t("statusPending")}</option>
                <option value="partial">{t("statusPartial")}</option>
                <option value="paid">{t("statusPaid")}</option>
              </select>
            )}

            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t("searchPlaceholder")}
              className="border border-gray-300 rounded-lg px-3 py-1 text-xs w-48"
            />

            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">{t("from")}:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
              <span className="text-xs text-gray-400">{t("to")}:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-16 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-gray-400">{t("noResults")}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("player")}</th>
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("parent")}</th>
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("cost")}</th>
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("paid")}</th>
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("status")}</th>
                    <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                      {tab === "late_due" ? t("dueDate") : t("date")}
                    </th>
                    {tab === "transactions" && (
                      <th className="text-start px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t("links")}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row._id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-gray-900">
                          {(row.playerFirstName || row.playerLastName)
                            ? `${row.playerFirstName} ${row.playerLastName}`
                            : row.customerEmail || "—"}
                        </div>
                        <div className="text-xs text-gray-400">
                          {[row.teamName, row.activityTitle].filter(Boolean).join(" / ")}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm text-gray-700">
                          {row.parent1FirstName} {row.parent1LastName}
                        </div>
                        <div className="text-xs text-gray-400" dir="ltr">{row.parent1Phone ? `${row.parent1PhonePrefix || "+1"} ${row.parent1Phone}` : row.parent1Email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {cents(tab === "transactions" ? row.amount : (tab === "late_due" ? row.overdueAmount : row.totalCostCents))}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {cents(tab === "transactions" ? row.amount : row.paidCents)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          status={tab === "late_due" ? row.overdueStatus : row.status}
                          t={t}
                        />
                        {tab === "late_due" && row.daysOverdue > 0 && (
                          <span className="text-xs text-red-500 ms-1">{row.daysOverdue}d</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-500">
                        {tab === "late_due" && row.overdueDate
                          ? new Date(row.overdueDate).toLocaleDateString()
                          : row.createdAt
                            ? new Date(row.createdAt).toLocaleDateString()
                            : "—"}
                      </td>
                      {tab === "transactions" && (
                        <td className="px-4 py-2.5 text-sm">
                          <div className="flex gap-2">
                            {row.activityId && (
                              <Link href={`/dashboard/activities/${row.activityId}`} className="text-blue-600 hover:underline text-xs">
                                {t("viewOrder")}
                              </Link>
                            )}
                            {row.invoiceUrl && (
                              <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                {t("receipt")}
                              </a>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {t("showing", { from: (page - 1) * limit + 1, to: Math.min(page * limit, total), total })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition"
                >
                  {t("prev")}
                </button>
                <span className="text-xs text-gray-600">
                  {t("page")} {page} {t("of")} {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50 transition"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
