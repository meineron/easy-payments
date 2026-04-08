"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import InvoiceSlideOver from "@/components/InvoiceSlideOver";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }
function displayToCents(v) { return Math.round(parseFloat(v || 0) * 100); }

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-blue-600";
  return (
    <div className={`fixed top-4 end-4 z-[100] ${bg} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3 animate-[slideIn_0.2s_ease-out]`}>
      {type === "success" && <span>&#10003;</span>}
      {type === "error" && <span>&#10007;</span>}
      {message}
      <button onClick={onClose} className="ms-2 opacity-70 hover:opacity-100">×</button>
    </div>
  );
}

function PriceInput({ value, onChange, className = "", placeholder = "0.00" }) {
  const [text, setText] = useState(() => { const n = (value || 0) / 100; return n === 0 ? "" : String(n); });
  const [focused, setFocused] = useState(false);
  const lastCents = useRef(value);

  useEffect(() => {
    if (!focused && value !== lastCents.current) {
      lastCents.current = value;
      const n = (value || 0) / 100;
      setText(n === 0 ? "" : String(n));
    }
  }, [value, focused]);

  function handleChange(e) {
    const v = e.target.value;
    if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
      setText(v);
      const cents = Math.round(parseFloat(v || 0) * 100);
      lastCents.current = cents;
      onChange(cents);
    }
  }

  function handleBlur() {
    setFocused(false);
    if (text === "") { onChange(0); return; }
    const n = parseFloat(text);
    if (isNaN(n)) { setText(""); onChange(0); return; }
    const cents = Math.round(n * 100);
    lastCents.current = cents;
    onChange(cents);
  }

  return <input type="text" inputMode="decimal" value={text} onChange={handleChange}
    onFocus={() => setFocused(true)} onBlur={handleBlur}
    placeholder={placeholder} className={className} />;
}
function fmtDate(d) { if (!d) return "—"; return new Date(d).toLocaleDateString(); }
function fmtDateTime(d) { if (!d) return "—"; return new Date(d).toLocaleString(); }

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700",
  partial: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  refunded: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-600",
  expected: "bg-orange-100 text-orange-700",
};

/* ============== PARTICIPANTS TAB ============== */
function TabParticipants({ activityId, activity, tc, td }) {
  const [orders, setOrders] = useState([]);
  const [expectedPlayers, setExpectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(null);

  const [search, setSearch] = useState("");
  const [filterTeams, setFilterTeams] = useState(new Set());
  const [filterTeamType, setFilterTeamType] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [detailed, setDetailed] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const headerActionsRef = useRef(null);

  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLogs, setEditLogs] = useState([]);
  const [editTab, setEditTab] = useState("invoice");

  const teamFilterRef = useRef(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = () => setActionsOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [actionsOpen]);

  useEffect(() => {
    if (!headerActionsOpen) return;
    function handleClick(e) {
      if (headerActionsRef.current && !headerActionsRef.current.contains(e.target)) {
        setHeaderActionsOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [headerActionsOpen]);

  useEffect(() => {
    if (!teamFilterOpen) return;
    const close = (e) => { if (teamFilterRef.current && !teamFilterRef.current.contains(e.target)) setTeamFilterOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [teamFilterOpen]);

  const activityTeams = (activity?.teams || []).map((row) => ({
    teamId: row.teamId?._id || row.teamId, name: row.teamId?.name || "Unknown",
    teamType: row.teamId?.teamType || "", gender: row.teamId?.gender || "",
  }));
  const teamTypes = [...new Set(activityTeams.map((team) => team.teamType).filter(Boolean))].sort();
  const genders = [...new Set(activityTeams.map((team) => team.gender).filter(Boolean))].sort();
  const activitySubs = (activity?.subscriptions || []).map((s, i) => ({
    id: s._id || `sub_${i}`, title: s.title, priceCents: s.priceCents || 0,
    includedTeamIds: s.includedTeamIds || [], maxInstallments: s.maxInstallments || 1,
    dueDateAmountCents: s.dueDateAmountCents || 0, firstInstallmentDate: s.firstInstallmentDate,
    items: (s.items || []).map((it) => ({ name: it.name, priceCents: it.priceCents, quantity: it.quantity, isRequired: it.isRequired, isDiscount: it.isDiscount || false })),
  }));

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/activities/${activityId}/orders`);
      const data = await res.json();
      setOrders(data.orders || []);
      setExpectedPlayers(data.expectedPlayers || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [activityId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  function computeRowTotal(o) {
    let total = o.subscriptionPriceCents || 0;
    (o.items || []).forEach((item) => {
      const amt = (item.priceCents || 0) * (item.quantity || 1);
      if (item.isDiscount) total -= amt; else total += amt;
    });
    if (o.discountType === "amount") total -= o.discountValue || 0;
    else if (o.discountType === "percentage") total -= Math.round(total * (o.discountValue || 0) / 100);
    total -= o.couponDiscountCents || 0;
    return Math.max(0, total);
  }

  const effectiveFilterTeams = (() => {
    let teams = activityTeams;
    if (filterTeamType) teams = teams.filter((team) => team.teamType === filterTeamType);
    if (filterGender) teams = teams.filter((team) => team.gender === filterGender);
    const typeOrGenderActive = filterTeamType || filterGender;
    if (typeOrGenderActive && filterTeams.size > 0) {
      const narrowed = new Set(teams.map((team) => String(team.teamId)));
      return new Set([...filterTeams].filter((id) => narrowed.has(id)));
    }
    if (typeOrGenderActive) return new Set(teams.map((team) => String(team.teamId)));
    return filterTeams;
  })();

  const allRows = [...orders, ...expectedPlayers];
  const filteredRows = allRows.filter((r) => {
    if (effectiveFilterTeams.size > 0) { const tid = String(r.teamId?._id || r.teamId || ""); if (!effectiveFilterTeams.has(tid)) return false; }
    if (filterSub && (r.subscriptionId || "") !== filterSub) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [r.playerFirstName, r.playerLastName, r.parent1FirstName, r.parent1LastName, r.parent1Email, r.parent1Phone, r.parent2FirstName, r.parent2LastName, r.parent2Email, r.parent2Phone].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  let statExpected = 0, statCollected = 0, statFullyPaid = 0, statPartialPaid = 0;
  filteredRows.forEach((r) => {
    const total = r._isExpected ? (r.totalCostCents || 0) : computeRowTotal(r);
    statExpected += total;
    statCollected += r.paidCents || 0;
    if ((r.paidCents || 0) >= total && total > 0) statFullyPaid++;
    else if ((r.paidCents || 0) > 0) statPartialPaid++;
  });

  /* --- helpers to create order from expected player --- */
  async function ensureOrder(ep) {
    const teamId = ep.teamId?._id || ep.teamId || "";
    const sub = activitySubs.find((s) => (s.includedTeamIds || []).includes(teamId));
    const price = ep.subscriptionPriceCents || sub?.priceCents || 0;
    const items = (ep.items && ep.items.length > 0) ? ep.items : (sub?.items || []);
    const res = await fetch(`/api/activities/${activityId}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerFirstName: ep.playerFirstName, playerLastName: ep.playerLastName,
        playerDob: ep.playerDob, playerGender: ep.playerGender,
        playerPhone: ep.playerPhone || "", playerEmail: ep.playerEmail || "",
        parent1FirstName: ep.parent1FirstName || "", parent1LastName: ep.parent1LastName || "",
        parent1Phone: ep.parent1Phone || "", parent1Email: ep.parent1Email || "",
        parent2FirstName: ep.parent2FirstName || "", parent2LastName: ep.parent2LastName || "",
        parent2Phone: ep.parent2Phone || "", parent2Email: ep.parent2Email || "",
        teamId, playerId: ep.playerId || null,
        subscriptionId: ep.subscriptionId || sub?.id || "", subscriptionTitle: ep.subscriptionTitle || sub?.title || "",
        subscriptionPriceCents: price,
        items,
        discountType: ep.discountType || "none",
        discountValue: ep.discountValue || 0,
        couponCode: ep.couponCode || "",
        couponDiscountCents: ep.couponDiscountCents || 0,
        status: "pending",
      }),
    });
    const data = await res.json();
    if (data.order) {
      setOrders((prev) => [data.order, ...prev]);
      setExpectedPlayers((prev) => prev.filter((e) => e._id !== ep._id));
    }
    return data.order || null;
  }

  const [editTransactions, setEditTransactions] = useState([]);
  const [editPaymentRequests, setEditPaymentRequests] = useState([]);

  /* --- View Invoice slide-over --- */
  async function openInvoiceModal(order) {
    setEditTab("invoice");
    setEditOrder(order);
    setEditForm({
      teamId: order.teamId?._id || order.teamId || "",
      subscriptionId: order.subscriptionId || "",
      subscriptionTitle: order.subscriptionTitle || "",
      subscriptionPriceCents: order.subscriptionPriceCents || 0,
      items: JSON.parse(JSON.stringify(order.items || [])),
      discountType: order.discountType || "none",
      discountValue: order.discountValue || 0,
      couponCode: order.couponCode || "",
      couponDiscountCents: order.couponDiscountCents || 0,
    });
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}`);
      const data = await res.json();
      setEditLogs(data.logs || []);
      setEditTransactions(data.transactions || []);
      setEditPaymentRequests(data.paymentRequests || []);
    } catch {
      setEditLogs([]);
      setEditTransactions([]);
      setEditPaymentRequests([]);
    }
  }

  async function refreshInvoiceData() {
    if (!editOrder) return;
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${editOrder._id}`);
      const data = await res.json();
      if (data.order) {
        setEditOrder(data.order);
        setOrders((prev) => prev.map((o) => (o._id === data.order._id ? data.order : o)));
      }
      setEditLogs(data.logs || []);
      setEditTransactions(data.transactions || []);
      setEditPaymentRequests(data.paymentRequests || []);
    } catch { /* ignore */ }
  }

  async function openInvoiceForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (order) openInvoiceModal(order);
      else setToast({ message: tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  function updateEditForm(field, value) { setEditForm((p) => ({ ...p, [field]: value })); }
  function addEditItem() { setEditForm((p) => ({ ...p, items: [...p.items, { name: "", priceCents: 0, quantity: 1, isDiscount: false }] })); }
  function updateEditItem(idx, field, value) { setEditForm((p) => { const items = [...p.items]; items[idx] = { ...items[idx], [field]: value }; return { ...p, items }; }); }
  function removeEditItem(idx) { setEditForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) })); }

  function onSubChange(subId) {
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) { setEditForm((p) => ({ ...p, subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0 })); return; }
    setEditForm((p) => ({ ...p, subscriptionId: subId, subscriptionTitle: sub.title, subscriptionPriceCents: sub.priceCents || 0 }));
  }
  function onTeamChange(teamId) {
    setEditForm((p) => {
      const sub = activitySubs.find((s) => s.id === p.subscriptionId);
      return { ...p, teamId, subscriptionPriceCents: sub?.priceCents || p.subscriptionPriceCents };
    });
  }

  function editFormTotal() {
    if (!editForm) return 0;
    let total = editForm.subscriptionPriceCents || 0;
    (editForm.items || []).forEach((i) => { total += (i.priceCents || 0) * (i.quantity || 1); });
    if (editForm.discountType === "amount") total -= editForm.discountValue || 0;
    else if (editForm.discountType === "percentage") total -= Math.round(total * (editForm.discountValue || 0) / 100);
    total -= editForm.couponDiscountCents || 0;
    return Math.max(0, total);
  }

  async function saveEdit() {
    if (!editOrder) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${editOrder._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.order) {
        setOrders((prev) => prev.map((o) => (o._id === data.order._id ? data.order : o)));
        setEditOrder(data.order);
        setEditForm((prev) => ({ ...prev, _reason: "" }));
        setToast({ message: td("invoiceSaved"), type: "success" });
      } else setToast({ message: data.error || tc("failedToSave"), type: "error" });
    } catch { setToast({ message: tc("failedToSave"), type: "error" }); }
    finally { setSaving(false); }
  }

  /* --- Actions --- */
  async function copyRegistrationLink(orderId) {
    setActionBusy(orderId);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/send-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.registrationUrl) {
        await navigator.clipboard.writeText(data.registrationUrl);
        setToast({ message: td("regLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function copyRegistrationLinkForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: tc("somethingWentWrong"), type: "error" }); return; }
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}/send-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.registrationUrl) {
        await navigator.clipboard.writeText(data.registrationUrl);
        setToast({ message: td("regLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function sendPaymentLink(orderId) {
    setActionBusy(orderId);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/send-payment-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        await navigator.clipboard.writeText(data.paymentUrl);
        setOrders((prev) => prev.map((o) => o._id === orderId ? { ...o, paymentLinkSentAt: data.paymentLinkSentAt } : o));
        setToast({ message: td("paymentLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function sendPaymentLinkForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: tc("somethingWentWrong"), type: "error" }); return; }
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}/send-payment-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        await navigator.clipboard.writeText(data.paymentUrl);
        setOrders((prev) => prev.map((o) => o._id === order._id ? { ...o, paymentLinkSentAt: data.paymentLinkSentAt } : o));
        setToast({ message: td("paymentLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function payFromAdmin(orderId) {
    setActionBusy(orderId);
    try {
      const order = orders.find((o) => o._id === orderId);
      const res = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, adminReturn: true }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function payFromAdminForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: tc("somethingWentWrong"), type: "error" }); return; }
      const res = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order._id, adminReturn: true }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function createOrder(formData) {
    setSaving(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.order) {
        setOrders((prev) => [data.order, ...prev]);
        if (formData.playerId) {
          const teamId = data.order.teamId?._id || data.order.teamId || "";
          setExpectedPlayers((prev) => prev.filter((ep) => !(String(ep.playerId) === String(formData.playerId) && String(ep.teamId?._id || ep.teamId) === String(teamId))));
        }
        setShowCreate(false);
        setToast({ message: td("registrationCreated"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setSaving(false); }
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/register/${activityId}`;
    navigator.clipboard.writeText(url).then(() => setToast({ message: td("publicLinkCopied"), type: "success" }));
  }

  function copyPublicRegistrationLink() {
    const url = `${window.location.origin}/register/${activityId}`;
    navigator.clipboard.writeText(url).then(() => setToast({ message: td("registrationLinkCopied"), type: "success" }));
  }

  function refreshList() {
    setLoading(true);
    setSelected(new Set());
    fetchOrders();
  }

  async function repairOrders() {
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/repair`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setToast({ message: td("repairedOrders", { count: data.repaired }), type: "success" });
        refreshList();
      } else {
        setToast({ message: data.error || td("repairFailed"), type: "error" });
      }
    } catch { setToast({ message: td("repairFailed"), type: "error" }); }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredRows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRows.map((r) => r._id)));
    }
  }

  function getSelectedOrderIds() {
    return [...selected].filter((id) => !String(id).startsWith("expected_"));
  }

  async function executeBulk(action, payload) {
    const orderIds = getSelectedOrderIds();
    if (orderIds.length === 0) {
      setToast({ message: td("selectRegisteredPlayers"), type: "error" });
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/bulk-action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, action, ...payload }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) => {
          const map = {};
          (data.updated || []).forEach((o) => { map[o._id] = o; });
          return prev.map((o) => map[o._id] || o);
        });
        setToast({ message: td("updatedInvoices", { count: data.count }), type: "success" });
        setSelected(new Set());
        setBulkModal(null);
      } else {
        setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
      }
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setBulkBusy(false); }
  }

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {td("participantCount", { count: filteredRows.length })}
          {expectedPlayers.length > 0 && <span className="text-sm font-normal text-gray-500 ms-2">({td("registeredCount", { count: orders.length })} · {td("expectedCount", { count: expectedPlayers.length })})</span>}
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative" ref={headerActionsRef}>
            <button onClick={() => setHeaderActionsOpen((v) => !v)}
              className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-200 flex items-center gap-1">
              {tc("actions")} <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {headerActionsOpen && (
              <div className="absolute end-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-30 py-1 min-w-[220px]">
                {activity?.registrationType === "public" && (
                  <button onClick={() => { copyPublicLink(); setHeaderActionsOpen(false); }}
                    className="w-full text-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    {td("copyPublicLink")}
                  </button>
                )}
                <button onClick={() => { setShowEmailModal(true); setHeaderActionsOpen(false); }}
                  className="w-full text-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  {td("sendPaymentLinks")}
                </button>
                {activity?.registrationType === "public" && (
                  <button onClick={() => { copyPublicRegistrationLink(); setHeaderActionsOpen(false); }}
                    className="w-full text-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    {td("sendRegistrationLinks")}
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={refreshList} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-200" title={tc("refresh")}>
            ↻ {tc("refresh")}
          </button>
          <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">{td("addRegistration")}</button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3 mb-4 items-start">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${tc("search")}...`}
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        {teamTypes.length > 0 && (
          <select value={filterTeamType} onChange={(e) => setFilterTeamType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">{td("allTypes")}</option>
            {teamTypes.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
          </select>
        )}
        {genders.length > 0 && (
          <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">{td("allGenders")}</option>
            {genders.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <div className="relative" ref={teamFilterRef}>
          <button onClick={() => setTeamFilterOpen((v) => !v)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 min-w-[140px] ${filterTeams.size > 0 ? "border-blue-400 bg-blue-50 text-blue-700" : "text-gray-700"}`}>
            <span>{filterTeams.size > 0 ? `${filterTeams.size} ${td("teams")}` : td("allTeams")}</span>
            <svg className="w-3.5 h-3.5 ms-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {teamFilterOpen && (
            <div className="absolute z-30 mt-1 bg-white border rounded-lg shadow-lg w-64 max-h-72 overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-3 py-2 flex items-center justify-between z-10">
                <button onClick={() => setFilterTeams(new Set())} className="text-xs text-gray-500 hover:text-gray-800">{td("clear")}</button>
                <button onClick={() => setTeamFilterOpen(false)} className="text-xs text-blue-600 font-medium">{td("done")}</button>
              </div>
              {activityTeams.map((team) => {
                const checked = filterTeams.has(String(team.teamId));
                return (
                  <label key={team.teamId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={checked} onChange={() => {
                      setFilterTeams((prev) => {
                        const next = new Set(prev);
                        if (next.has(String(team.teamId))) next.delete(String(team.teamId)); else next.add(String(team.teamId));
                        return next;
                      });
                    }} className="rounded" />
                    <span className="flex-1 truncate">{team.name}</span>
                    {team.teamType && <span className="text-[10px] text-gray-400 flex-shrink-0">{team.teamType}</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">{td("allSubscriptions")}</option>
          {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("totalExpected")}</p>
          <p className="text-lg font-bold text-gray-900">${centsToDisplay(statExpected)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("totalCollected")}</p>
          <p className="text-lg font-bold text-green-700">${centsToDisplay(statCollected)}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("fullyPaid")}</p>
          <p className="text-lg font-bold text-blue-700">{statFullyPaid}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("partiallyPaid")}</p>
          <p className="text-lg font-bold text-yellow-700">{statPartialPaid}</p>
        </div>
      </div>

      {/* BULK ACTIONS BAR */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">{td("selected", { count: selected.size })}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkModal("add_item")}
              className="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100">
              {td("addItem")}
            </button>
            <button onClick={() => setBulkModal("apply_discount")}
              className="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100">
              {td("applyDiscount")}
            </button>
            <button onClick={() => setBulkModal("remove_item")}
              className="bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-red-50">
              {td("removeItemBtn")}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700 ms-2">{td("clear")}</button>
          </div>
        </div>
      )}

      {/* DETAILED TOGGLE */}
      <div className="flex items-center mb-3">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="relative">
            <input type="checkbox" checked={detailed} onChange={() => setDetailed((v) => !v)} className="sr-only peer" />
            <span className="block w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-blue-600 transition-colors" />
            <span className="absolute start-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4 rtl:peer-checked:-translate-x-4" />
          </span>
          <span className="text-sm text-gray-600">{td("detailed")}</span>
        </label>
      </div>

      {/* TABLE */}
      {filteredRows.length === 0 ? (
        <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{allRows.length === 0 ? td("noParticipantsYet") : td("noResultsMatchFilters")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-gray-500 text-xs uppercase tracking-wider">
                <th className="pb-2 px-2 w-8"><input type="checkbox" checked={filteredRows.length > 0 && selected.size === filteredRows.length} onChange={toggleSelectAll} className="rounded" /></th>
                <th className="pb-2 px-2 font-medium">{td("player")}</th>
                <th className="pb-2 px-2 font-medium">{td("regDate")}</th>
                {detailed && <th className="pb-2 px-2 font-medium">{td("parent1")}</th>}
                {detailed && <th className="pb-2 px-2 font-medium">{td("parent2")}</th>}
                <th className="pb-2 px-2 font-medium text-right">{td("subCost")}</th>
                <th className="pb-2 px-2 font-medium text-right">{td("items")}</th>
                <th className="pb-2 px-2 font-medium text-right">{td("discounts")}</th>
                <th className="pb-2 px-2 font-medium text-right">{tc("total")}</th>
                <th className="pb-2 px-2 font-medium text-right">{td("paid")}</th>
                <th className="pb-2 px-2 font-medium text-right">{td("refund")}</th>
                <th className="pb-2 px-2 font-medium text-right">{td("due")}</th>
                <th className="pb-2 px-2 font-medium text-right">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((r) => {
                const isExpected = !!r._isExpected;
                const subCost = r.subscriptionPriceCents || 0;
                const itemsCost = (r.items || []).reduce((s, i) => s + (i.isDiscount ? 0 : (i.priceCents || 0) * (i.quantity || 1)), 0);
                const discountItems = (r.items || []).reduce((s, i) => s + (i.isDiscount ? Math.abs(i.priceCents || 0) * (i.quantity || 1) : 0), 0);
                let discountFixed = 0;
                if (r.discountType === "amount") discountFixed = r.discountValue || 0;
                else if (r.discountType === "percentage") discountFixed = Math.round((subCost + itemsCost) * (r.discountValue || 0) / 100);
                const discountCoupon = r.couponDiscountCents || 0;
                const totalDiscounts = discountItems + discountFixed + discountCoupon;
                const total = isExpected ? (r.totalCostCents || 0) : computeRowTotal(r);
                const paid = r.paidCents || 0;
                const refunded = r.refundedCents || 0;
                const due = Math.max(0, total - paid + refunded);
                const regDate = r.registrationCompletedAt || null;
                const rowId = r._id;
                return (
                  <tr key={rowId} className={isExpected ? "hover:bg-orange-50/50 bg-orange-50/30" : "hover:bg-gray-50"}>
                    <td className="py-2.5 px-2 w-8"><input type="checkbox" checked={selected.has(rowId)} onChange={() => toggleSelect(rowId)} className="rounded" /></td>
                    <td className="py-2.5 px-2">
                      <div className={`font-medium ${isExpected ? "text-gray-700" : "text-gray-900"}`}>{r.playerFirstName} {r.playerLastName}</div>
                      <div className="text-xs text-gray-400 truncate">{r.teamId?.name || "—"}{r.subscriptionTitle ? ` · ${r.subscriptionTitle}` : ""}</div>
                    </td>
                    <td className="py-2.5 px-2 text-gray-500 text-xs">{regDate ? fmtDate(regDate) : "—"}</td>
                    {detailed && (
                      <td className="py-2.5 px-2">
                        {r.parent1FirstName ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{r.parent1FirstName} {r.parent1LastName}</div>
                            {r.parent1Email && <div className="text-[10px] text-gray-400 truncate">{r.parent1Email}</div>}
                            {r.parent1Phone && <div className="text-[10px] text-gray-400">{r.parent1Phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    )}
                    {detailed && (
                      <td className="py-2.5 px-2">
                        {r.parent2FirstName ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{r.parent2FirstName} {r.parent2LastName}</div>
                            {r.parent2Email && <div className="text-[10px] text-gray-400 truncate">{r.parent2Email}</div>}
                            {r.parent2Phone && <div className="text-[10px] text-gray-400">{r.parent2Phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    )}
                    <td className="py-2.5 px-2 text-right text-xs">{subCost > 0 ? `$${centsToDisplay(subCost)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right text-xs">{itemsCost > 0 ? `$${centsToDisplay(itemsCost)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right text-xs">{totalDiscounts > 0 ? <span className="text-red-500">-${centsToDisplay(totalDiscounts)}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right font-medium">{total > 0 ? `$${centsToDisplay(total)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-green-700">{paid > 0 ? `$${centsToDisplay(paid)}` : <span className="text-gray-400">$0.00</span>}</span>
                      {(r.chosenInstallments || 0) > 1 && (
                        <div className="text-[10px] text-gray-400">{(r.installmentSchedule || []).filter((i) => i.status === "paid").length}/{r.chosenInstallments} {td("installments")}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">{refunded > 0 ? <span className="text-purple-600">$${centsToDisplay(refunded)}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right font-medium">{due > 0 ? <span className="text-red-600">${centsToDisplay(due)}</span> : <span className="text-green-600">$0.00</span>}</td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="relative inline-block">
                        <button onClick={(e) => { e.stopPropagation(); setActionsOpen(actionsOpen === rowId ? null : rowId); }}
                          disabled={actionBusy === rowId}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50">
                          {actionBusy === rowId ? "..." : `${tc("actions")} ▾`}
                        </button>
                        {actionsOpen === rowId && (
                          <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
                            {isExpected ? (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceForExpected(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("viewInvoice")}</button>
                                {r.parent1Email && (
                                  <button onClick={() => { setActionsOpen(null); sendPaymentLinkForExpected(r); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("copyPaymentLink")}</button>
                                )}
                                <button onClick={() => { setActionsOpen(null); copyRegistrationLinkForExpected(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("copyRegistrationLink")}</button>
                                <button onClick={() => { setActionsOpen(null); payFromAdminForExpected(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("payFromAdmin")}</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceModal(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("viewInvoice")}</button>
                                {r.parent1Email && r.status !== "paid" && (
                                  <button onClick={() => { setActionsOpen(null); sendPaymentLink(r._id); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                                    {td("copyPaymentLink")}
                                  </button>
                                )}
                                <button onClick={() => { setActionsOpen(null); copyRegistrationLink(r._id); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                                  {td("copyRegistrationLink")}
                                </button>
                                {r.status !== "paid" && (
                                  <button onClick={() => { setActionsOpen(null); payFromAdmin(r._id); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("payFromAdmin")}</button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BULK ACTION MODALS */}
      {bulkModal && (
        <BulkActionModal
          type={bulkModal}
          busy={bulkBusy}
          selectedCount={selected.size}
          orderCount={getSelectedOrderIds().length}
          allOrders={orders}
          onExecute={executeBulk}
          onClose={() => setBulkModal(null)}
          tc={tc}
          td={td}
        />
      )}

      {/* SEND PAYMENT EMAILS MODAL */}
      {showEmailModal && (
        <SendPaymentEmailsModal
          activityId={activityId}
          activity={activity}
          orders={orders}
          expectedPlayers={expectedPlayers}
          onClose={() => setShowEmailModal(false)}
          onDone={(msg) => { setShowEmailModal(false); setToast({ message: msg, type: "success" }); refreshList(); }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
          tc={tc}
          td={td}
        />
      )}

      {/* VIEW INVOICE SLIDE-OVER */}
      {editOrder && editForm && (
        <InvoiceSlideOver
          order={editOrder}
          editForm={editForm}
          activityId={activityId}
          activityTeams={activityTeams}
          activitySubs={activitySubs}
          transactions={editTransactions}
          paymentRequests={editPaymentRequests}
          logs={editLogs}
          onUpdateForm={updateEditForm}
          onSave={saveEdit}
          onClose={() => { setEditOrder(null); setEditForm(null); }}
          saving={saving}
          onRefresh={refreshInvoiceData}
        />
      )}

      {/* CREATE ORDER MODAL */}
      {showCreate && <CreateOrderModal activityTeams={activityTeams} activitySubs={activitySubs} saving={saving} onCreate={createOrder} onClose={() => setShowCreate(false)}
        prefill={typeof showCreate === "object" ? showCreate : null} tc={tc} td={td} />}
    </div>
  );
}

function CreateOrderModal({ activityTeams, activitySubs, saving, onCreate, onClose, prefill, tc, td }) {
  const [tab, setTab] = useState("registration");
  const [form, setForm] = useState(() => {
    const defaults = {
      playerFirstName: "", playerLastName: "", playerDob: "", playerGender: "",
      playerPhone: "", playerEmail: "",
      parent1FirstName: "", parent1LastName: "", parent1Phone: "", parent1Email: "",
      parent2FirstName: "", parent2LastName: "", parent2Phone: "", parent2Email: "",
      teamId: "", subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0,
      items: [], paidCents: 0, status: "pending", playerId: null,
    };
    return prefill ? { ...defaults, ...prefill } : defaults;
  });

  function update(field, value) { setForm((p) => ({ ...p, [field]: value })); }
  function onTeamChange(teamId) {
    setForm((p) => {
      const sub = activitySubs.find((s) => s.id === p.subscriptionId);
      return { ...p, teamId, subscriptionPriceCents: sub?.priceCents || p.subscriptionPriceCents };
    });
  }
  function onSubChange(subId) {
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) { setForm((p) => ({ ...p, subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0 })); return; }
    setForm((p) => ({ ...p, subscriptionId: subId, subscriptionTitle: sub.title, subscriptionPriceCents: sub.priceCents || 0 }));
  }

  const TABS = [
    { key: "registration", label: td("registration") },
    { key: "parents", label: td("parents") },
    { key: "invoice", label: td("invoice") },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{td("addRegistrationTitle")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="border-b flex">
          {TABS.map((tabItem) => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === tabItem.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
              {tabItem.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === "registration" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")} *</label>
                  <input value={form.playerFirstName} onChange={(e) => update("playerFirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")} *</label>
                  <input value={form.playerLastName} onChange={(e) => update("playerLastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("dateOfBirth")}</label>
                  <input type="date" value={form.playerDob} onChange={(e) => update("playerDob", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("gender")}</label>
                  <select value={form.playerGender} onChange={(e) => update("playerGender", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                  <input value={form.playerPhone} onChange={(e) => update("playerPhone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label>
                  <input value={form.playerEmail} onChange={(e) => update("playerEmail", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("team")}</label>
                <select value={form.teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("noTeam")}</option>
                  {activityTeams.map((team) => <option key={team.teamId} value={team.teamId}>{team.name}</option>)}
                </select></div>
            </div>
          )}
          {tab === "parents" && (
            <div className="space-y-5">
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent1Title")}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent1FirstName} onChange={(e) => update("parent1FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent1LastName} onChange={(e) => update("parent1LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label><input value={form.parent1Phone} onChange={(e) => update("parent1Phone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent1Email} onChange={(e) => update("parent1Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <hr />
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent2Title")} <span className="font-normal text-gray-400">{td("parent2Optional")}</span></h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent2FirstName} onChange={(e) => update("parent2FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent2LastName} onChange={(e) => update("parent2LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label><input value={form.parent2Phone} onChange={(e) => update("parent2Phone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent2Email} onChange={(e) => update("parent2Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
            </div>
          )}
          {tab === "invoice" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("subscription")}</label>
                  <select value={form.subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">{td("noSubscription")}</option>
                    {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("subscriptionPrice")}</label>
                  <PriceInput value={form.subscriptionPriceCents} onChange={(cents) => update("subscriptionPriceCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={() => onCreate(form)} disabled={saving || !form.playerFirstName.trim() || !form.playerLastName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tc("creating") : tc("create")}</button>
        </div>
      </div>
    </div>
  );
}

/* ============== BULK ACTION MODAL ============== */
function BulkActionModal({ type, busy, selectedCount, orderCount, allOrders, onExecute, onClose, tc, td }) {
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState(0);
  const [itemQty, setItemQty] = useState(1);
  const [itemIsDiscount, setItemIsDiscount] = useState(type === "apply_discount");
  const [discType, setDiscType] = useState("amount");
  const [discValue, setDiscValue] = useState(0);
  const [removeItemName, setRemoveItemName] = useState("");

  const allItemNames = [...new Set(allOrders.flatMap((o) => (o.items || []).map((i) => i.name)).filter(Boolean))];

  function handleSubmit() {
    if (type === "add_item") {
      if (!itemName.trim()) return;
      onExecute("add_item", { item: { name: itemName.trim(), priceCents: itemPrice, quantity: itemQty, isDiscount: itemIsDiscount } });
    } else if (type === "apply_discount") {
      if (discValue <= 0) return;
      onExecute("apply_discount", { discount: { type: discType, value: discValue } });
    } else if (type === "remove_item") {
      if (!removeItemName) return;
      onExecute("remove_item", { item: { name: removeItemName } });
    }
  }

  const title = type === "add_item" ? td("addItemToSelected") : type === "apply_discount" ? td("applyDiscountToSelected") : td("removeItemFromSelected");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            {td("bulkApplyNote", { count: orderCount })}
            {selectedCount > orderCount ? ` (${td("expectedSkipped", { count: selectedCount - orderCount })})` : ""}
          </p>

          {type === "add_item" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{td("itemName")}</label>
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Jersey Fee, Late Fee..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{td("priceDollar")}</label>
                  <PriceInput value={itemPrice} onChange={setItemPrice} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{td("quantity")}</label>
                  <input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(Number(e.target.value) || 1)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={itemIsDiscount} onChange={(e) => setItemIsDiscount(e.target.checked)} className="rounded" />
                {td("discountItemLabel")}
              </label>
            </>
          )}

          {type === "apply_discount" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{td("discountType")}</label>
                <select value={discType} onChange={(e) => setDiscType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="amount">{td("discountTypeFixed")}</option>
                  <option value="percentage">{td("discountTypePercent")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{discType === "percentage" ? td("discountPercent") : td("discountDollar")}</label>
                {discType === "percentage" ? (
                  <input type="text" inputMode="numeric" value={discValue || ""} onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) setDiscValue(Number(v || 0)); }}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 10" />
                ) : (
                  <PriceInput value={discValue} onChange={setDiscValue} className="w-full border rounded-lg px-3 py-2 text-sm" />
                )}
              </div>
            </>
          )}

          {type === "remove_item" && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{td("itemToRemove")}</label>
              {allItemNames.length > 0 ? (
                <select value={removeItemName} onChange={(e) => setRemoveItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("selectAnItem")}</option>
                  {allItemNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-400">{td("noItemsFoundInSelected")}</p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSubmit} disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${type === "remove_item" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {busy ? td("applying") : td("applyToInvoices", { count: orderCount })}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== SEND PAYMENT EMAILS MODAL ============== */
function SendPaymentEmailsModal({ activityId, activity, orders, expectedPlayers, onClose, onDone, onError, tc, td }) {
  const activityTeams = (activity?.teams || []).map((row) => ({
    teamId: row.teamId?._id || row.teamId, name: row.teamId?.name || "Unknown",
  }));
  const [selectedTeams, setSelectedTeams] = useState(() => new Set(activityTeams.map((row) => row.teamId)));
  const [subject, setSubject] = useState(`Payment link for ${activity?.title || "Activity"}`);
  const [bodyHtml, setBodyHtml] = useState("<p>Dear parent,</p><p>Please complete your payment using the link below.</p>");
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);
  const imgInputRef = useRef(null);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function insertLink() {
    const url = prompt("Enter URL:");
    if (url) execCmd("createLink", url);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      bodyRef.current?.focus();
      document.execCommand("insertImage", false, reader.result);
      const imgs = bodyRef.current?.querySelectorAll("img");
      if (imgs) imgs.forEach((img) => { img.style.maxWidth = "100%"; img.style.width = "100%"; img.style.height = "auto"; img.style.display = "block"; img.style.borderRadius = "8px"; img.style.margin = "8px 0"; });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function toggleTeam(tid) {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid); else next.add(tid);
      return next;
    });
  }

  function toggleAll() {
    if (selectedTeams.size === activityTeams.length) {
      setSelectedTeams(new Set());
    } else {
      setSelectedTeams(new Set(activityTeams.map((row) => row.teamId)));
    }
  }

  const eligibleCount = [...orders, ...expectedPlayers].filter((r) => {
    const tid = String(r.teamId?._id || r.teamId || "");
    if (!selectedTeams.has(tid)) return false;
    if (r.status === "paid") return false;
    if (!r.parent1Email && !r._isExpected) return false;
    return true;
  }).length;

  const orderOnlyCount = orders.filter((r) => {
    const tid = String(r.teamId?._id || r.teamId || "");
    return selectedTeams.has(tid) && r.status !== "paid" && r.parent1Email;
  }).length;

  async function handleSend() {
    const html = bodyRef.current?.innerHTML || bodyHtml;
    if (!subject.trim()) { onError(td("subjectRequired")); return; }
    if (!html.trim() || html.trim() === "<br>") { onError(td("messageBodyRequired")); return; }
    if (selectedTeams.size === 0) { onError(td("selectAtLeastOneTeam")); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/send-bulk-payment-emails`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [...selectedTeams], subject: subject.trim(), bodyHtml: html }),
      });
      const data = await res.json();
      if (data.success) {
        let msg = td("sentPaymentLinks", { count: data.sentCount });
        if (data.errorCount > 0) msg += ` (${td("failedCount", { count: data.errorCount })})`;
        onDone(msg);
      } else {
        onError(data.error || td("failedToSendEmails"));
      }
    } catch { onError(td("failedToSendEmails")); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{td("sendPaymentLinksTitle")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-5">

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">{td("teams")}</label>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
                {selectedTeams.size === activityTeams.length ? td("deselectAll") : td("selectAll")}
              </button>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {activityTeams.map((team) => (
                <label key={team.teamId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={selectedTeams.has(team.teamId)} onChange={() => toggleTeam(team.teamId)} className="rounded" />
                  {team.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{td("teamsSelected", { count: selectedTeams.size })}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailSubject")}</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Payment link for..." />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{td("emailMessage")}</label>
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-gray-200" title={td("bold")}>{td("bold")}</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-gray-200" title={td("italic")}>{td("italic")}</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-gray-200" title={td("underline")}>{td("underline")}</button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={td("bulletList")}>{td("bulletList")}</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={td("numberedList")}>{td("numberedList")}</button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600" title={td("link")}>{td("link")}</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title={td("image")}>{td("image")}</button>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <select onChange={(e) => { if (e.target.value) { execCmd("fontSize", "7"); const sel = window.getSelection(); if (sel.rangeCount) { const span = sel.anchorNode?.parentElement; if (span && span.style) span.style.fontSize = e.target.value; } } e.target.value = ""; }}
                  className="text-xs border-0 bg-transparent py-1 pr-1 text-gray-600 cursor-pointer hover:bg-gray-200 rounded" defaultValue="">
                  <option value="" disabled>{td("size")}</option>
                  <option value="12px">{td("small")}</option>
                  <option value="16px">{td("normal")}</option>
                  <option value="20px">{td("large")}</option>
                  <option value="24px">{td("xl")}</option>
                </select>
              </div>
              <div ref={bodyRef} contentEditable suppressContentEditableWarning
                onBlur={() => { if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML); }}
                className="px-3 py-2 text-sm min-h-[150px] focus:outline-none prose prose-sm max-w-none"
                style={{ overflowY: "auto", maxHeight: "300px" }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{td("emailMessageHint")}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              {td("unpaidParentsWillReceive", { count: orderOnlyCount })}
              {eligibleCount > orderOnlyCount && (
                <span className="text-gray-400"> ({td("expectedPlayersSkipped", { count: eligibleCount - orderOnlyCount })})</span>
              )}
            </p>
            {orderOnlyCount === 0 && <p className="text-xs text-orange-600 mt-1">{td("noEligibleParents")}</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSend} disabled={sending || orderOnlyCount === 0}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {sending ? td("sending") : td("sendToParents", { count: orderOnlyCount })}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== TEAMS TAB ============== */
function TabActivityTeams({ activityId, activity, tc, td }) {
  const [orders, setOrders] = useState([]);
  const [expectedPlayers, setExpectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activities/${activityId}/orders`).then((r) => r.json()).then((d) => {
      setOrders(d.orders || []);
      setExpectedPlayers(d.expectedPlayers || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [activityId]);

  const activityTeams = (activity?.teams || []).map((row) => ({
    teamId: row.teamId?._id || row.teamId, name: row.teamId?.name || "Unknown",
    season: row.teamId?.season || "", gender: row.teamId?.gender || "",
  }));

  function teamStats(teamId) {
    const teamOrders = orders.filter((o) => {
      const oid = o.teamId?._id || o.teamId;
      return oid === teamId;
    });
    const teamExpected = expectedPlayers.filter((ep) => {
      const eid = ep.teamId?._id || ep.teamId;
      return String(eid) === String(teamId);
    });
    const members = teamOrders.length + teamExpected.length;
    const registered = teamOrders.length;
    let expectedRevenue = 0, collected = 0, fullyPaid = 0, partialPaid = 0;
    teamOrders.forEach((o) => {
      const total = o.totalCostCents || 0;
      expectedRevenue += total;
      collected += o.paidCents || 0;
      if (o.paidCents >= total && total > 0) fullyPaid++;
      else if (o.paidCents > 0) partialPaid++;
    });
    teamExpected.forEach((ep) => { expectedRevenue += ep.totalCostCents || 0; });
    return { members, registered, expectedCount: teamExpected.length, expectedRevenue, collected, fullyPaid, partialPaid };
  }

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">{td("teamsCount", { count: activityTeams.length })}</h3>
      {activityTeams.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{td("noTeamsInActivity")}</p> : (
        <div className="space-y-3">
          {activityTeams.map((team) => {
            const s = teamStats(team.teamId);
            return (
              <div key={team.teamId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{team.name}</span>
                    {team.gender && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.gender}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.season}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{td("playerCount", { count: s.members })}</span>
                    {s.expectedCount > 0 && <span className="text-xs text-orange-600">({s.registered} {td("registered")} · {s.expectedCount} {td("expected")})</span>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("expectedRevenue")}</p>
                    <p className="text-lg font-bold text-gray-900">${centsToDisplay(s.expectedRevenue)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("collected")}</p>
                    <p className="text-lg font-bold text-green-700">${centsToDisplay(s.collected)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("fullyPaid")}</p>
                    <p className="text-lg font-bold text-blue-700">{s.fullyPaid}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("partiallyPaid")}</p>
                    <p className="text-lg font-bold text-yellow-700">{s.partialPaid}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============== LOGS TAB ============== */
function TabLogs({ activityId, tc, td }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activities/${activityId}/logs`).then((r) => r.json()).then((d) => setLogs(d.logs || [])).catch(() => {}).finally(() => setLoading(false));
  }, [activityId]);

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">{td("activityLogs", { count: logs.length })}</h3>
      {logs.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{td("noChangesRecordedYet")}</p> : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log._id} className="border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-gray-900">{log.description}</span>
                <span className="text-xs text-gray-400">{fmtDateTime(log.createdAt)}</span>
              </div>
              <div className="text-xs text-gray-500">
                by <span className="font-medium">{log.userName}</span> · Field: <span className="font-mono">{log.field}</span>
                {log.previousValue && log.previousValue !== "undefined" && <> · Prev: <span className="text-red-600">{log.previousValue.slice(0, 60)}</span></>}
                {log.newValue && log.newValue !== "undefined" && log.newValue !== "created" && <> · New: <span className="text-green-600">{log.newValue.slice(0, 60)}</span></>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============== MAIN PAGE ============== */
export default function ActivityPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("activities");
  const tc = useTranslations("common");
  const td = useTranslations("activityDetail");

  const OVERVIEW_TABS = [
    { key: "participants", label: td("participants") },
    { key: "teams", label: td("teams") },
    { key: "logs", label: td("logs") },
  ];
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const currentTab = searchParams.get("tab") || "participants";

  useEffect(() => {
    fetch(`/api/activities/${activityId}`)
      .then((r) => r.json())
      .then((d) => { if (d.activity) setActivity(d.activity); else router.push("/dashboard/activities"); })
      .catch(() => router.push("/dashboard/activities"))
      .finally(() => setLoading(false));
  }, [activityId, router]);

  function switchTab(tab) { router.push(`/dashboard/activities/${activityId}?tab=${tab}`, { scroll: false }); }

  if (loading) return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/activities")} className="text-gray-400 hover:text-gray-600 text-sm">← {t("title")}</button>
          <h2 className="text-xl font-bold text-gray-900">{activity?.title || "Activity"}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activity?.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
            {activity?.status === "published" ? t("published") : activity?.status === "draft" || !activity?.status ? t("draft") : activity.status}
          </span>
          {activity?.season && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600" title={t("season")}>{activity.season}</span>}
        </div>
        <Link href={`/dashboard/activities/${activityId}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          {td("editActivity")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-0">
          {OVERVIEW_TABS.map((tab) => (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${currentTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border p-6">
        {currentTab === "participants" && <TabParticipants activityId={activityId} activity={activity} tc={tc} td={td} />}
        {currentTab === "teams" && <TabActivityTeams activityId={activityId} activity={activity} tc={tc} td={td} />}
        {currentTab === "logs" && <TabLogs activityId={activityId} tc={tc} td={td} />}
      </div>
    </div>
  );
}
