import { useSession } from "next-auth/react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useIntl } from "react-intl";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart,
} from "recharts";

const METHOD_COLORS = { card: "#60a5fa", bank_transfer: "#a78bfa", cash: "#86efac", check: "#fcd34d" };
const COLLECTION_COLORS = { collected: "#86efac", outstanding: "#fcd34d", unpaid: "#fca5a5", refunded: "#d8b4fe" };
const STATUS_COLORS = { pending: "bg-red-100 text-red-700", partial: "bg-yellow-100 text-yellow-700", paid: "bg-green-100 text-green-700", cancelled: "bg-gray-100 text-gray-500", succeeded: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700" };

function cents(v) { return ((v || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function dateRange(preset) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (preset) {
    case "today": return { from: startOfDay(now), to: now };
    case "7d": return { from: new Date(now.getTime() - 7 * 86400000), to: now };
    case "30d": return { from: new Date(now.getTime() - 30 * 86400000), to: now };
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "prev": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: first, to: last };
    }
    default: return null;
  }
}

function sliceDaily(dailyData, range) {
  if (!range) return dailyData;
  const from = range.from.toISOString().slice(0, 10);
  const to = range.to.toISOString().slice(0, 10);
  return dailyData.filter((d) => d.date >= from && d.date <= to);
}

function StripeBanner({ t }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between">
      <p className="text-sm text-yellow-800">{t("stripeBanner")}</p>
      <button onClick={() => setDismissed(true)} className="text-yellow-600 hover:text-yellow-800 text-lg leading-none">&times;</button>
    </div>
  );
}

function FilterBar({ t, stats, filters, setFilters }) {
  const { season, paymentMethods, activityIds, teamIds } = filters;

  const availableTeams = useMemo(() => {
    if (!activityIds.length || !stats) return stats?.teams || [];
    const selectedActTeamIds = new Set();
    for (const act of stats.activities || []) {
      if (activityIds.includes(String(act._id))) {
        for (const t of stats.teams || []) selectedActTeamIds.add(String(t._id));
      }
    }
    return (stats.teams || []).filter((t) => selectedActTeamIds.has(String(t._id)));
  }, [activityIds, stats]);

  function toggleMethod(m) {
    setFilters((f) => {
      const methods = f.paymentMethods.includes(m)
        ? f.paymentMethods.filter((x) => x !== m)
        : [...f.paymentMethods, m];
      return { ...f, paymentMethods: methods };
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">{t("season")}</label>
          <select
            value={season}
            onChange={(e) => setFilters((f) => ({ ...f, season: e.target.value, activityIds: [], teamIds: [] }))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            {(stats?.availableSeasons || []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase">{t("paymentMethods")}</span>
          {["card", "bank_transfer", "cash", "check"].map((m) => (
            <label key={m} className="flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={paymentMethods.includes(m)}
                onChange={() => toggleMethod(m)}
                className="rounded"
              />
              {t(m === "bank_transfer" ? "bankTransfer" : m)}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">{t("activities")}</label>
          <select
            value={activityIds.length === 0 ? "" : activityIds.join(",")}
            onChange={(e) => {
              const val = e.target.value;
              setFilters((f) => ({ ...f, activityIds: val ? val.split(",") : [], teamIds: [] }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm max-w-[200px]"
          >
            <option value="">{t("allActivities")}</option>
            {(stats?.activities || []).map((a) => (
              <option key={a._id} value={a._id}>{a.title}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">{t("teamsFilter")}</label>
          <select
            value={teamIds.length === 0 ? "" : teamIds.join(",")}
            onChange={(e) => {
              const val = e.target.value;
              setFilters((f) => ({ ...f, teamIds: val ? val.split(",") : [] }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm max-w-[200px]"
          >
            <option value="">{t("allTeams")}</option>
            {availableTeams.map((tm) => (
              <option key={tm._id} value={tm._id}>{tm.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, seasonValue, periodValue, isCurrency, presets, activePreset, setPreset, t }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex-1 min-w-[200px]">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">
        {isCurrency ? cents(seasonValue) : seasonValue.toLocaleString()}
      </p>
      <p className="text-xs text-gray-400 mb-3">{t("seasonTotal")}</p>
      <div className="flex gap-1 mb-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-2 py-0.5 text-xs rounded-full transition ${activePreset === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {t(p === "today" ? "today" : p === "7d" ? "last7d" : p === "30d" ? "last30d" : p === "month" ? "thisMonth" : "prevMonth")}
          </button>
        ))}
      </div>
      <p className="text-lg font-semibold text-blue-600">
        {isCurrency ? cents(periodValue) : periodValue.toLocaleString()}
      </p>
      <p className="text-xs text-gray-400">{t("periodValue")}</p>
    </div>
  );
}

function PaymentMethodsPie({ data, t }) {
  const chartData = data.filter((d) => d.totalCents > 0).map((d) => ({
    name: t(d.method === "bank_transfer" ? "bankTransfer" : d.method),
    value: d.totalCents,
    method: d.method,
  }));

  if (chartData.length === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">{t("noData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name }) => name}>
          {chartData.map((entry) => (
            <Cell key={entry.method} fill={METHOD_COLORS[entry.method] || "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => cents(v)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function CollectionStatusPie({ data, t }) {
  const chartData = [
    { name: t("collectedSlice"), value: data.collected, key: "collected" },
    { name: t("outstandingSlice"), value: data.outstanding, key: "outstanding" },
    { name: t("unpaidSlice"), value: data.unpaid, key: "unpaid" },
    { name: t("refundedSlice"), value: data.refunded, key: "refunded" },
  ].filter((d) => d.value > 0);

  if (chartData.length === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">{t("noData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name }) => name}>
          {chartData.map((entry) => (
            <Cell key={entry.key} fill={COLLECTION_COLORS[entry.key]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => cents(v)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartDateRange({ value, onChange, t }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {["30d", "7d", "month", "prev", "full"].map((p) => (
        <button
          key={p}
          onClick={() => onChange({ preset: p })}
          className={`px-2.5 py-1 text-xs rounded-full transition ${value.preset === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          {p === "30d" ? t("last30Days") : p === "7d" ? t("last7Days") : p === "month" ? t("thisMonthFull") : p === "prev" ? t("prevMonthFull") : t("fullSeason")}
        </button>
      ))}
    </div>
  );
}

function RevenueChart({ dailyData, chartRange, setChartRange, t }) {
  const range = chartRange.preset === "full" ? null : dateRange(chartRange.preset === "30d" ? "30d" : chartRange.preset === "7d" ? "7d" : chartRange.preset === "month" ? "month" : "prev");
  const sliced = sliceDaily(dailyData, range);

  const data = sliced.map((d) => ({
    date: d.date.slice(5),
    card: d.byMethod?.card || 0,
    bank_transfer: d.byMethod?.bank_transfer || 0,
    cash: d.byMethod?.cash || 0,
    check: d.byMethod?.check || 0,
    collected: d.collected || 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{t("revenueStream")}</h3>
      </div>
      <ChartDateRange value={chartRange} onChange={setChartRange} t={t} />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 100).toLocaleString()} />
          <Tooltip formatter={(v) => cents(v)} />
          <Legend />
          <Bar dataKey="card" stackId="revenue" fill={METHOD_COLORS.card} name={t("card")} />
          <Bar dataKey="bank_transfer" stackId="revenue" fill={METHOD_COLORS.bank_transfer} name={t("bankTransfer")} />
          <Bar dataKey="cash" stackId="revenue" fill={METHOD_COLORS.cash} name={t("cash")} />
          <Bar dataKey="check" stackId="revenue" fill={METHOD_COLORS.check} name={t("check")} />
          <Line type="monotone" dataKey="collected" stroke="#16a34a" strokeWidth={2} dot={false} name={t("collected")} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RegistrationsChart({ dailyData, chartRange, setChartRange, t }) {
  const range = chartRange.preset === "full" ? null : dateRange(chartRange.preset === "30d" ? "30d" : chartRange.preset === "7d" ? "7d" : chartRange.preset === "month" ? "month" : "prev");
  const sliced = sliceDaily(dailyData, range);

  const data = sliced.map((d) => ({
    date: d.date.slice(5),
    registrations: d.registrations || 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{t("registrationsStream")}</h3>
      </div>
      <ChartDateRange value={chartRange} onChange={setChartRange} t={t} />
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="registrations" fill="#60a5fa" name={t("registered")} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TeamsTable({ data, t }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{t("teamsTable")}</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-start px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">{t("teamName")}</th>
            <th className="text-start px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">{t("subscriptionPlayers")}</th>
            <th className="text-start px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">{t("totalPaid")}</th>
            <th className="text-start px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase">{t("totalNotPaid")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((team) => (
            <tr key={team.teamId || "none"} className="hover:bg-gray-50 transition">
              <td className="px-5 py-2.5 text-sm font-medium text-gray-900">
                {team.teamId ? (
                  <Link href={`/dashboard/teams/${team.teamId}`} className="text-blue-600 hover:underline">{team.teamName}</Link>
                ) : team.teamName}
              </td>
              <td className="px-5 py-2.5 text-sm text-gray-700">{team.subscriptionPlayers}</td>
              <td className="px-5 py-2.5 text-sm text-green-700 font-medium">{cents(team.totalPaid)}</td>
              <td className="px-5 py-2.5 text-sm text-red-600 font-medium">{cents(team.totalNotPaid)}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">{t("noData")}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status, t }) {
  const key = status === "pending" ? "statusPending" : status === "partial" ? "statusPartial" : status === "paid" || status === "succeeded" ? "statusPaid" : status === "failed" ? "statusFailed" : "statusCancelled";
  const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{t(key)}</span>;
}

function RecordsTable({ stats, filters, t }) {
  const [tab, setTab] = useState("registrations");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      tab,
      season: filters.season,
      limit: "20",
    });
    if (filters.paymentMethods.length > 0 && filters.paymentMethods.length < 4) {
      params.set("paymentMethods", filters.paymentMethods.join(","));
    }
    if (filters.activityIds.length > 0) params.set("activityIds", filters.activityIds.join(","));
    if (filters.teamIds.length > 0) params.set("teamIds", filters.teamIds.join(","));
    if (statusFilter && tab === "registrations") params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/dashboard/records?${params}`);
      const data = await res.json();
      setRows(data.rows || []);
    } catch { setRows([]); }
    setLoading(false);
  }, [tab, filters, statusFilter]);

  useEffect(() => { if (filters.season) fetchRecords(); }, [fetchRecords, filters.season]);

  const viewAllParams = new URLSearchParams({ tab, season: filters.season });
  if (filters.paymentMethods.length > 0 && filters.paymentMethods.length < 4) viewAllParams.set("paymentMethods", filters.paymentMethods.join(","));
  if (filters.activityIds.length > 0) viewAllParams.set("activityIds", filters.activityIds.join(","));
  if (filters.teamIds.length > 0) viewAllParams.set("teamIds", filters.teamIds.join(","));

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex gap-1">
          {["registrations", "transactions", "late_due"].map((tb) => (
            <button
              key={tb}
              onClick={() => { setTab(tb); setStatusFilter(""); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${tab === tb ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {tb === "registrations" ? t("latestRegistrations") : tb === "transactions" ? t("latestTransactions") : t("lateDue")}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {tab === "registrations" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
            >
              <option value="">{t("allStatuses")}</option>
              <option value="pending">{t("statusPending")}</option>
              <option value="partial">{t("statusPartial")}</option>
              <option value="paid">{t("statusPaid")}</option>
            </select>
          )}
          <Link href={`/dashboard/records?${viewAllParams}`} className="text-xs text-blue-600 hover:underline font-medium">
            {t("viewAll")} &rarr;
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-12 text-center text-sm text-gray-400">{t("loading")}</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-gray-400">{t("noResults")}</div>
      ) : (
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
                    {cents(tab === "transactions" ? row.amount : row.totalCostCents)}
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
      )}
    </div>
  );
}

export default function ClubDashboard() {
  const intl = useIntl();
  const { data: session } = useSession();
  const t = (id, values) => intl.formatMessage({ id: `payments.dashboardAnalytics.${id}` }, values);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    season: "",
    paymentMethods: ["card", "bank_transfer", "cash", "check"],
    activityIds: [],
    teamIds: [],
  });

  const [revenuePreset, setRevenuePreset] = useState("30d");
  const [collectedPreset, setCollectedPreset] = useState("30d");
  const [registeredPreset, setRegisteredPreset] = useState("30d");
  const [revenueChartRange, setRevenueChartRange] = useState({ preset: "30d" });
  const [regChartRange, setRegChartRange] = useState({ preset: "30d" });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.season) params.set("season", filters.season);
    if (filters.paymentMethods.length > 0 && filters.paymentMethods.length < 4) {
      params.set("paymentMethods", filters.paymentMethods.join(","));
    }
    if (filters.activityIds.length > 0) params.set("activityIds", filters.activityIds.join(","));
    if (filters.teamIds.length > 0) params.set("teamIds", filters.teamIds.join(","));

    try {
      const res = await fetch(`/api/dashboard/stats?${params}`);
      const data = await res.json();
      setStats(data);
      if (!filters.season && data.season) {
        setFilters((f) => ({ ...f, season: data.season }));
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
    setLoading(false);
  }, [filters.season, filters.paymentMethods, filters.activityIds, filters.teamIds]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const periodPresets = ["today", "7d", "30d", "month", "prev"];

  const periodRevenue = useMemo(() => {
    if (!stats?.dailyData) return 0;
    const range = dateRange(revenuePreset);
    return sliceDaily(stats.dailyData, range).reduce((s, d) => s + d.revenue, 0);
  }, [stats?.dailyData, revenuePreset]);

  const periodCollected = useMemo(() => {
    if (!stats?.dailyData) return 0;
    const range = dateRange(collectedPreset);
    return sliceDaily(stats.dailyData, range).reduce((s, d) => s + d.collected, 0);
  }, [stats?.dailyData, collectedPreset]);

  const periodRegistered = useMemo(() => {
    if (!stats?.dailyData) return 0;
    const range = dateRange(registeredPreset);
    return sliceDaily(stats.dailyData, range).reduce((s, d) => s + d.registrations, 0);
  }, [stats?.dailyData, registeredPreset]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const showStripeBanner = session?.user && !session.user.onboardingComplete && !session.user.hasDirectStripeAccess;

  return (
    <div>
      {showStripeBanner && <StripeBanner t={t} />}

      <FilterBar t={t} stats={stats} filters={filters} setFilters={setFilters} />

      <div className="flex gap-4 mb-6 flex-wrap">
        <KpiCard
          title={t("revenue")}
          seasonValue={stats?.totalRevenue || 0}
          periodValue={periodRevenue}
          isCurrency
          presets={periodPresets}
          activePreset={revenuePreset}
          setPreset={setRevenuePreset}
          t={t}
        />
        <KpiCard
          title={t("collected")}
          seasonValue={stats?.totalCollected || 0}
          periodValue={periodCollected}
          isCurrency
          presets={periodPresets}
          activePreset={collectedPreset}
          setPreset={setCollectedPreset}
          t={t}
        />
        <KpiCard
          title={t("registered")}
          seasonValue={stats?.totalRegistered || 0}
          periodValue={periodRegistered}
          isCurrency={false}
          presets={periodPresets}
          activePreset={registeredPreset}
          setPreset={setRegisteredPreset}
          t={t}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("paymentMethods")}</h3>
          <PaymentMethodsPie data={stats?.byPaymentMethod || []} t={t} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("collectionStatus")}</h3>
          <CollectionStatusPie data={stats?.collectionStatus || { collected: 0, outstanding: 0, unpaid: 0, refunded: 0 }} t={t} />
        </div>
      </div>

      <RevenueChart
        dailyData={stats?.dailyData || []}
        chartRange={revenueChartRange}
        setChartRange={setRevenueChartRange}
        t={t}
      />

      <RegistrationsChart
        dailyData={stats?.dailyData || []}
        chartRange={regChartRange}
        setChartRange={setRegChartRange}
        t={t}
      />

      <TeamsTable data={stats?.teamsTable || []} t={t} />

      <RecordsTable stats={stats} filters={filters} t={t} />
    </div>
  );
}
