"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function centsToDisplay(c) { return ((c || 0) / 100).toFixed(2); }
function displayToCents(v) { return Math.round(parseFloat(v || 0) * 100); }

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-blue-600";
  return (
    <div className={`fixed top-4 right-4 z-[100] ${bg} text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3 animate-[slideIn_0.2s_ease-out]`}>
      {type === "success" && <span>&#10003;</span>}
      {type === "error" && <span>&#10007;</span>}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">×</button>
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
function TabParticipants({ activityId, activity }) {
  const [orders, setOrders] = useState([]);
  const [expectedPlayers, setExpectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(null);

  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [detailed, setDetailed] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLogs, setEditLogs] = useState([]);
  const [editTab, setEditTab] = useState("invoice");

  useEffect(() => {
    if (!actionsOpen) return;
    const close = () => setActionsOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [actionsOpen]);

  const activityTeams = (activity?.teams || []).map((t) => ({
    teamId: t.teamId?._id || t.teamId, name: t.teamId?.name || "Unknown",
  }));
  const activitySubs = (activity?.subscriptions || []).map((s, i) => ({
    id: s._id || `sub_${i}`, title: s.title, teamPricing: s.teamPricing || [],
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
    (o.items || []).forEach((item) => { total += (item.priceCents || 0) * (item.quantity || 1); });
    if (o.discountType === "amount") total -= o.discountValue || 0;
    else if (o.discountType === "percentage") total -= Math.round(total * (o.discountValue || 0) / 100);
    total -= o.couponDiscountCents || 0;
    return Math.max(0, total);
  }

  const allRows = [...orders, ...expectedPlayers];
  const filteredRows = allRows.filter((r) => {
    if (filterTeam) { const tid = r.teamId?._id || r.teamId || ""; if (String(tid) !== filterTeam) return false; }
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
    const sub = activitySubs.find((s) => (s.teamPricing || []).some((tp) => tp.teamId === teamId));
    const price = sub ? (sub.teamPricing || []).find((tp) => tp.teamId === teamId)?.priceCents || 0 : 0;
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
        subscriptionPriceCents: price, items: [], status: "pending",
      }),
    });
    const data = await res.json();
    if (data.order) {
      setOrders((prev) => [data.order, ...prev]);
      setExpectedPlayers((prev) => prev.filter((e) => e._id !== ep._id));
    }
    return data.order || null;
  }

  /* --- Edit Invoice modal --- */
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
      paidCents: order.paidCents || 0,
      refundedCents: order.refundedCents || 0,
      status: order.status || "pending",
    });
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}`);
      const data = await res.json();
      setEditLogs(data.logs || []);
    } catch { setEditLogs([]); }
  }

  async function openInvoiceForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (order) openInvoiceModal(order);
      else setToast({ message: "Failed to create order", type: "error" });
    } catch { setToast({ message: "Failed", type: "error" }); }
    finally { setActionBusy(null); }
  }

  function updateEditForm(field, value) { setEditForm((p) => ({ ...p, [field]: value })); }
  function addEditItem() { setEditForm((p) => ({ ...p, items: [...p.items, { name: "", priceCents: 0, quantity: 1, isDiscount: false }] })); }
  function updateEditItem(idx, field, value) { setEditForm((p) => { const items = [...p.items]; items[idx] = { ...items[idx], [field]: value }; return { ...p, items }; }); }
  function removeEditItem(idx) { setEditForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) })); }

  function onSubChange(subId) {
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) { setEditForm((p) => ({ ...p, subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0 })); return; }
    const teamPrice = (sub.teamPricing || []).find((tp) => tp.teamId === editForm.teamId);
    setEditForm((p) => ({ ...p, subscriptionId: subId, subscriptionTitle: sub.title, subscriptionPriceCents: teamPrice?.priceCents || 0 }));
  }
  function onTeamChange(teamId) {
    setEditForm((p) => {
      const sub = activitySubs.find((s) => s.id === p.subscriptionId);
      const tp = sub ? (sub.teamPricing || []).find((tp) => tp.teamId === teamId)?.priceCents || 0 : p.subscriptionPriceCents;
      return { ...p, teamId, subscriptionPriceCents: tp };
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
        setEditOrder(null); setEditForm(null);
        setToast({ message: "Invoice saved", type: "success" });
      } else setToast({ message: data.error || "Failed to save", type: "error" });
    } catch { setToast({ message: "Failed to save", type: "error" }); }
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
        setToast({ message: "Registration link copied!", type: "success" });
      } else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed to get link", type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function copyRegistrationLinkForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: "Failed to create order", type: "error" }); return; }
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}/send-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.registrationUrl) {
        await navigator.clipboard.writeText(data.registrationUrl);
        setToast({ message: "Registration link copied!", type: "success" });
      } else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed", type: "error" }); }
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
        setToast({ message: "Payment link copied to clipboard", type: "success" });
      } else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed to get payment link", type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function sendPaymentLinkForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: "Failed to create order", type: "error" }); return; }
      const res = await fetch(`/api/activities/${activityId}/orders/${order._id}/send-payment-link`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        await navigator.clipboard.writeText(data.paymentUrl);
        setOrders((prev) => prev.map((o) => o._id === order._id ? { ...o, paymentLinkSentAt: data.paymentLinkSentAt } : o));
        setToast({ message: "Payment link copied to clipboard", type: "success" });
      } else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed", type: "error" }); }
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
      else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed to create checkout", type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function payFromAdminForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { setToast({ message: "Failed to create order", type: "error" }); return; }
      const res = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order._id, adminReturn: true }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else setToast({ message: data.error || "Failed", type: "error" });
    } catch { setToast({ message: "Failed", type: "error" }); }
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
        setToast({ message: "Registration created", type: "success" });
      } else setToast({ message: data.error || "Failed to create", type: "error" });
    } catch { setToast({ message: "Failed to create registration", type: "error" }); }
    finally { setSaving(false); }
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/register/${activityId}`;
    navigator.clipboard.writeText(url).then(() => setToast({ message: "Public link copied!", type: "success" }));
  }

  function refreshList() {
    setLoading(true);
    setSelected(new Set());
    fetchOrders();
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
      setToast({ message: "Select registered players (not expected) for bulk actions", type: "error" });
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
        setToast({ message: `Updated ${data.count} invoice${data.count !== 1 ? "s" : ""}`, type: "success" });
        setSelected(new Set());
        setBulkModal(null);
      } else {
        setToast({ message: data.error || "Failed", type: "error" });
      }
    } catch { setToast({ message: "Bulk action failed", type: "error" }); }
    finally { setBulkBusy(false); }
  }

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">Loading participants...</p>;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {filteredRows.length} Participant{filteredRows.length !== 1 ? "s" : ""}
          {expectedPlayers.length > 0 && <span className="text-sm font-normal text-gray-500 ml-2">({orders.length} registered · {expectedPlayers.length} expected)</span>}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={refreshList} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-200" title="Refresh">
            ↻ Refresh
          </button>
          <button onClick={() => setShowEmailModal(true)} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700">
            Send Payment Emails
          </button>
          <button onClick={() => setDetailed((v) => !v)}
            className={`px-3 py-1.5 rounded text-sm font-medium border transition ${detailed ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
            {detailed ? "Detailed ✓" : "Detailed"}
          </button>
          {activity?.registrationType === "public" && (
            <button onClick={copyPublicLink} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-200">Copy Public Link</button>
          )}
          <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">+ Add Registration</button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player, parent name, phone, email..."
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm" />
        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Teams</option>
          {activityTeams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
        </select>
        <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Subscriptions</option>
          {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Total Expected</p>
          <p className="text-lg font-bold text-gray-900">${centsToDisplay(statExpected)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Total Collected</p>
          <p className="text-lg font-bold text-green-700">${centsToDisplay(statCollected)}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Fully Paid</p>
          <p className="text-lg font-bold text-blue-700">{statFullyPaid}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">Partially Paid</p>
          <p className="text-lg font-bold text-yellow-700">{statPartialPaid}</p>
        </div>
      </div>

      {/* BULK ACTIONS BAR */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkModal("add_item")}
              className="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100">
              + Add Item
            </button>
            <button onClick={() => setBulkModal("apply_discount")}
              className="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100">
              Apply Discount
            </button>
            <button onClick={() => setBulkModal("remove_item")}
              className="bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-red-50">
              Remove Item
            </button>
            <button onClick={() => setSelected(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700 ml-2">Clear</button>
          </div>
        </div>
      )}

      {/* TABLE */}
      {filteredRows.length === 0 ? (
        <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{allRows.length === 0 ? "No participants yet." : "No results match your filters."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wider">
                <th className="pb-2 px-2 w-8"><input type="checkbox" checked={filteredRows.length > 0 && selected.size === filteredRows.length} onChange={toggleSelectAll} className="rounded" /></th>
                <th className="pb-2 px-2 font-medium">Player</th>
                <th className="pb-2 px-2 font-medium">Reg. Date</th>
                {detailed && <th className="pb-2 px-2 font-medium">Parent 1</th>}
                {detailed && <th className="pb-2 px-2 font-medium">Parent 2</th>}
                <th className="pb-2 px-2 font-medium text-right">Sub Cost</th>
                <th className="pb-2 px-2 font-medium text-right">Items</th>
                <th className="pb-2 px-2 font-medium text-right">Discounts</th>
                <th className="pb-2 px-2 font-medium text-right">Total</th>
                <th className="pb-2 px-2 font-medium text-right">Paid</th>
                <th className="pb-2 px-2 font-medium text-right">Refund</th>
                <th className="pb-2 px-2 font-medium text-right">Due</th>
                <th className="pb-2 px-2 font-medium text-right">Actions</th>
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
                    <td className="py-2.5 px-2 text-right text-green-700">{paid > 0 ? `$${centsToDisplay(paid)}` : <span className="text-gray-400">$0.00</span>}</td>
                    <td className="py-2.5 px-2 text-right text-xs">{refunded > 0 ? <span className="text-purple-600">$${centsToDisplay(refunded)}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right font-medium">{due > 0 ? <span className="text-red-600">${centsToDisplay(due)}</span> : <span className="text-green-600">$0.00</span>}</td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="relative inline-block">
                        <button onClick={(e) => { e.stopPropagation(); setActionsOpen(actionsOpen === rowId ? null : rowId); }}
                          disabled={actionBusy === rowId}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900 border rounded-lg px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50">
                          {actionBusy === rowId ? "..." : "Actions ▾"}
                        </button>
                        {actionsOpen === rowId && (
                          <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
                            {isExpected ? (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceForExpected(r); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Edit Invoice</button>
                                {r.parent1Email && (
                                  <button onClick={() => { setActionsOpen(null); sendPaymentLinkForExpected(r); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Copy Payment Link</button>
                                )}
                                <button onClick={() => { setActionsOpen(null); copyRegistrationLinkForExpected(r); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Copy Registration Link</button>
                                <button onClick={() => { setActionsOpen(null); payFromAdminForExpected(r); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Pay from Admin</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceModal(r); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Edit Invoice</button>
                                {r.parent1Email && r.status !== "paid" && (
                                  <button onClick={() => { setActionsOpen(null); sendPaymentLink(r._id); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                                    Copy Payment Link
                                  </button>
                                )}
                                <button onClick={() => { setActionsOpen(null); copyRegistrationLink(r._id); }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                                  Copy Registration Link
                                </button>
                                {r.status !== "paid" && (
                                  <button onClick={() => { setActionsOpen(null); payFromAdmin(r._id); }}
                                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Pay from Admin</button>
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
        />
      )}

      {/* EDIT INVOICE MODAL */}
      {editOrder && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setEditOrder(null); setEditForm(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Edit Invoice — {editOrder.playerFirstName} {editOrder.playerLastName}</h3>
              <button onClick={() => { setEditOrder(null); setEditForm(null); }} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="border-b flex">
              {[{ key: "invoice", label: "Invoice" }, { key: "logs", label: "Logs" }].map((t) => (
                <button key={t.key} onClick={() => setEditTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${editTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-6">

              {editTab === "invoice" && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Team & Subscription</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Team</label>
                        <select value={editForm.teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="">No team</option>
                          {activityTeams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Subscription</label>
                        <select value={editForm.subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="">No subscription</option>
                          {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select></div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Subscription Price ($)</label>
                      <PriceInput value={editForm.subscriptionPriceCents} onChange={(cents) => updateEditForm("subscriptionPriceCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <hr />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Items</h4>
                      <button onClick={addEditItem} className="text-xs text-blue-600 hover:text-blue-800">+ Add Item</button>
                    </div>
                    {editForm.items.length === 0 ? <p className="text-sm text-gray-400 text-center py-2">No items.</p> : (
                      <div className="space-y-2">
                        {editForm.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 border rounded-lg p-2">
                            <input value={item.name} onChange={(e) => updateEditItem(idx, "name", e.target.value)} placeholder="Name" className="flex-1 border rounded px-2 py-1 text-sm" />
                            <PriceInput value={item.priceCents} onChange={(cents) => updateEditItem(idx, "priceCents", cents)} className="w-24 border rounded px-2 py-1 text-sm" placeholder="Price" />
                            <input type="number" value={item.quantity} onChange={(e) => updateEditItem(idx, "quantity", Number(e.target.value))} min="1" className="w-14 border rounded px-2 py-1 text-sm" />
                            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                              <input type="checkbox" checked={item.isDiscount} onChange={(e) => updateEditItem(idx, "isDiscount", e.target.checked)} className="rounded" />Disc.
                            </label>
                            <button onClick={() => removeEditItem(idx)} className="text-red-500 text-sm">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <hr />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Discounts & Coupons</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Discount Type</label>
                        <select value={editForm.discountType} onChange={(e) => updateEditForm("discountType", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="none">None</option><option value="amount">Fixed Amount</option><option value="percentage">Percentage</option>
                        </select></div>
                      {editForm.discountType !== "none" && (
                        <div><label className="block text-xs font-medium text-gray-500 mb-1">{editForm.discountType === "percentage" ? "Discount (%)" : "Discount ($)"}</label>
                          {editForm.discountType === "percentage" ? (
                            <input type="text" inputMode="numeric" value={editForm.discountValue}
                              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) updateEditForm("discountValue", Number(v || 0)); }}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          ) : (
                            <PriceInput value={editForm.discountValue} onChange={(cents) => updateEditForm("discountValue", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                          )}</div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Coupon Code</label>
                        <input value={editForm.couponCode} onChange={(e) => updateEditForm("couponCode", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Coupon Discount ($)</label>
                        <PriceInput value={editForm.couponDiscountCents} onChange={(cents) => updateEditForm("couponDiscountCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                    </div>
                  </div>
                  <hr />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Paid ($)</label>
                        <PriceInput value={editForm.paidCents} onChange={(cents) => updateEditForm("paidCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Refunded ($)</label>
                        <PriceInput value={editForm.refundedCents} onChange={(cents) => updateEditForm("refundedCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                        <select value={editForm.status} onChange={(e) => updateEditForm("status", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                          <option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option>
                        </select></div>
                    </div>
                  </div>
                  <hr />
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Invoice Summary</h4>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Subscription</span><span>${centsToDisplay(editForm.subscriptionPriceCents)}</span></div>
                    {editForm.items.filter((i) => !i.isDiscount).map((i, idx) => (
                      <div key={idx} className="flex justify-between text-sm"><span className="text-gray-500">{i.name || "Item"} × {i.quantity || 1}</span><span>${centsToDisplay((i.priceCents || 0) * (i.quantity || 1))}</span></div>
                    ))}
                    {editForm.items.filter((i) => i.isDiscount).map((i, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-red-600"><span>{i.name || "Discount"}</span><span>-${centsToDisplay(Math.abs(i.priceCents || 0) * (i.quantity || 1))}</span></div>
                    ))}
                    {editForm.discountType !== "none" && editForm.discountValue > 0 && (
                      <div className="flex justify-between text-sm text-red-600"><span>Discount ({editForm.discountType})</span><span>-{editForm.discountType === "percentage" ? `${editForm.discountValue}%` : `$${centsToDisplay(editForm.discountValue)}`}</span></div>
                    )}
                    {editForm.couponDiscountCents > 0 && (
                      <div className="flex justify-between text-sm text-red-600"><span>Coupon{editForm.couponCode ? `: ${editForm.couponCode}` : ""}</span><span>-${centsToDisplay(editForm.couponDiscountCents)}</span></div>
                    )}
                    <div className="flex justify-between text-sm font-bold border-t mt-2 pt-2"><span>Total</span><span>${centsToDisplay(editFormTotal())}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-green-700">Paid</span><span className="text-green-700">${centsToDisplay(editForm.paidCents)}</span></div>
                    <div className="flex justify-between text-sm font-medium">
                      <span>Due</span>
                      {(() => { const d = Math.max(0, editFormTotal() - (editForm.paidCents || 0) + (editForm.refundedCents || 0)); return d > 0 ? <span className="text-red-600">${centsToDisplay(d)}</span> : <span className="text-green-600">$0.00</span>; })()}
                    </div>
                  </div>
                </div>
              )}

              {editTab === "logs" && (
                <div>
                  {editLogs.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No changes recorded yet.</p> : (
                    <div className="space-y-2">
                      {editLogs.map((log) => (
                        <div key={log._id} className="border rounded-lg p-3 text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900">{log.description}</span>
                            <span className="text-xs text-gray-400">{fmtDateTime(log.createdAt)}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            by {log.userName} · Field: <span className="font-mono">{log.field}</span>
                            {log.previousValue && <> · Prev: <span className="text-red-600">{log.previousValue.length > 80 ? log.previousValue.slice(0, 80) + "..." : log.previousValue}</span></>}
                            {log.newValue && <> · New: <span className="text-green-600">{log.newValue.length > 80 ? log.newValue.slice(0, 80) + "..." : log.newValue}</span></>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {editTab === "invoice" && (
              <div className="px-6 py-4 border-t flex justify-end gap-3">
                <button onClick={() => { setEditOrder(null); setEditForm(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE ORDER MODAL */}
      {showCreate && <CreateOrderModal activityTeams={activityTeams} activitySubs={activitySubs} saving={saving} onCreate={createOrder} onClose={() => setShowCreate(false)}
        prefill={typeof showCreate === "object" ? showCreate : null} />}
    </div>
  );
}

function CreateOrderModal({ activityTeams, activitySubs, saving, onCreate, onClose, prefill }) {
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
      const price = sub ? (sub.teamPricing || []).find((tp) => tp.teamId === teamId)?.priceCents || 0 : 0;
      return { ...p, teamId, subscriptionPriceCents: price };
    });
  }
  function onSubChange(subId) {
    const sub = activitySubs.find((s) => s.id === subId);
    if (!sub) { setForm((p) => ({ ...p, subscriptionId: "", subscriptionTitle: "", subscriptionPriceCents: 0 })); return; }
    const price = (sub.teamPricing || []).find((tp) => tp.teamId === form.teamId)?.priceCents || 0;
    setForm((p) => ({ ...p, subscriptionId: subId, subscriptionTitle: sub.title, subscriptionPriceCents: price }));
  }

  const TABS = [
    { key: "registration", label: "Registration" },
    { key: "parents", label: "Parents" },
    { key: "invoice", label: "Invoice" },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Add Registration</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="border-b flex">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === "registration" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">First Name *</label>
                  <input value={form.playerFirstName} onChange={(e) => update("playerFirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Last Name *</label>
                  <input value={form.playerLastName} onChange={(e) => update("playerLastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Date of Birth</label>
                  <input type="date" value={form.playerDob} onChange={(e) => update("playerDob", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                  <select value={form.playerGender} onChange={(e) => update("playerGender", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input value={form.playerPhone} onChange={(e) => update("playerPhone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input value={form.playerEmail} onChange={(e) => update("playerEmail", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">Team</label>
                <select value={form.teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No team</option>
                  {activityTeams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
                </select></div>
            </div>
          )}
          {tab === "parents" && (
            <div className="space-y-5">
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">Parent 1</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">First Name</label><input value={form.parent1FirstName} onChange={(e) => update("parent1FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label><input value={form.parent1LastName} onChange={(e) => update("parent1LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label><input value={form.parent1Phone} onChange={(e) => update("parent1Phone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label><input value={form.parent1Email} onChange={(e) => update("parent1Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <hr />
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">Parent 2 <span className="font-normal text-gray-400">(optional)</span></h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">First Name</label><input value={form.parent2FirstName} onChange={(e) => update("parent2FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label><input value={form.parent2LastName} onChange={(e) => update("parent2LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Phone</label><input value={form.parent2Phone} onChange={(e) => update("parent2Phone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Email</label><input value={form.parent2Email} onChange={(e) => update("parent2Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
            </div>
          )}
          {tab === "invoice" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Subscription</label>
                  <select value={form.subscriptionId} onChange={(e) => onSubChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">No subscription</option>
                    {activitySubs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">Subscription Price ($)</label>
                  <PriceInput value={form.subscriptionPriceCents} onChange={(cents) => update("subscriptionPriceCents", cents)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={() => onCreate(form)} disabled={saving || !form.playerFirstName.trim() || !form.playerLastName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? "Creating..." : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

/* ============== BULK ACTION MODAL ============== */
function BulkActionModal({ type, busy, selectedCount, orderCount, allOrders, onExecute, onClose }) {
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

  const title = type === "add_item" ? "Add Item to Selected" : type === "apply_discount" ? "Apply Discount to Selected" : "Remove Item from Selected";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            This will apply to <strong>{orderCount}</strong> registered player invoice{orderCount !== 1 ? "s" : ""}
            {selectedCount > orderCount ? ` (${selectedCount - orderCount} expected player${selectedCount - orderCount !== 1 ? "s" : ""} skipped)` : ""}.
          </p>

          {type === "add_item" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Item Name *</label>
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Jersey Fee, Late Fee..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Price ($)</label>
                  <PriceInput value={itemPrice} onChange={setItemPrice} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                  <input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(Number(e.target.value) || 1)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={itemIsDiscount} onChange={(e) => setItemIsDiscount(e.target.checked)} className="rounded" />
                This is a discount item (negative amount)
              </label>
            </>
          )}

          {type === "apply_discount" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Discount Type</label>
                <select value={discType} onChange={(e) => setDiscType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="amount">Fixed Amount ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{discType === "percentage" ? "Discount (%)" : "Discount ($)"}</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Item to Remove *</label>
              {allItemNames.length > 0 ? (
                <select value={removeItemName} onChange={(e) => setRemoveItemName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select an item...</option>
                  {allItemNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-400">No items found in selected orders.</p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSubmit} disabled={busy}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${type === "remove_item" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
            {busy ? "Applying..." : `Apply to ${orderCount} Invoice${orderCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== SEND PAYMENT EMAILS MODAL ============== */
function SendPaymentEmailsModal({ activityId, activity, orders, expectedPlayers, onClose, onDone, onError }) {
  const activityTeams = (activity?.teams || []).map((t) => ({
    teamId: t.teamId?._id || t.teamId, name: t.teamId?.name || "Unknown",
  }));
  const [selectedTeams, setSelectedTeams] = useState(() => new Set(activityTeams.map((t) => t.teamId)));
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
      if (imgs) imgs.forEach((img) => { img.style.maxWidth = "100%"; img.style.height = "auto"; img.style.borderRadius = "8px"; img.style.margin = "8px 0"; });
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
      setSelectedTeams(new Set(activityTeams.map((t) => t.teamId)));
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
    if (!subject.trim()) { onError("Subject is required"); return; }
    if (!html.trim() || html.trim() === "<br>") { onError("Message body is required"); return; }
    if (selectedTeams.size === 0) { onError("Select at least one team"); return; }

    setSending(true);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/send-bulk-payment-emails`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: [...selectedTeams], subject: subject.trim(), bodyHtml: html }),
      });
      const data = await res.json();
      if (data.success) {
        let msg = `Sent ${data.sentCount} payment email${data.sentCount !== 1 ? "s" : ""}`;
        if (data.errorCount > 0) msg += ` (${data.errorCount} failed)`;
        onDone(msg);
      } else {
        onError(data.error || "Failed to send emails");
      }
    } catch { onError("Failed to send payment emails"); }
    finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Send Payment Emails</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-5">

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">Teams</label>
              <button onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-800">
                {selectedTeams.size === activityTeams.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {activityTeams.map((t) => (
                <label key={t.teamId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={selectedTeams.has(t.teamId)} onChange={() => toggleTeam(t.teamId)} className="rounded" />
                  {t.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{selectedTeams.size} team{selectedTeams.size !== 1 ? "s" : ""} selected</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Payment link for..." />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email Message</label>
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="px-2 py-1 rounded text-sm font-bold hover:bg-gray-200" title="Bold">B</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="px-2 py-1 rounded text-sm italic hover:bg-gray-200" title="Italic">I</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="px-2 py-1 rounded text-sm underline hover:bg-gray-200" title="Underline">U</button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title="Bullet List">&#8226; List</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title="Numbered List">1. List</button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200 text-blue-600" title="Insert Link">Link</button>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); imgInputRef.current?.click(); }} className="px-2 py-1 rounded text-sm hover:bg-gray-200" title="Insert Image">Image</button>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <select onChange={(e) => { if (e.target.value) { execCmd("fontSize", "7"); const sel = window.getSelection(); if (sel.rangeCount) { const span = sel.anchorNode?.parentElement; if (span && span.style) span.style.fontSize = e.target.value; } } e.target.value = ""; }}
                  className="text-xs border-0 bg-transparent py-1 pr-1 text-gray-600 cursor-pointer hover:bg-gray-200 rounded" defaultValue="">
                  <option value="" disabled>Size</option>
                  <option value="12px">Small</option>
                  <option value="16px">Normal</option>
                  <option value="20px">Large</option>
                  <option value="24px">XL</option>
                </select>
              </div>
              <div ref={bodyRef} contentEditable suppressContentEditableWarning
                onBlur={() => { if (bodyRef.current) setBodyHtml(bodyRef.current.innerHTML); }}
                className="px-3 py-2 text-sm min-h-[150px] focus:outline-none prose prose-sm max-w-none"
                style={{ overflowY: "auto", maxHeight: "300px" }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">This message will appear above the player details and payment button in the email.</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <strong>{orderOnlyCount}</strong> unpaid parent{orderOnlyCount !== 1 ? "s" : ""} will receive this email
              {eligibleCount > orderOnlyCount && (
                <span className="text-gray-400"> ({eligibleCount - orderOnlyCount} expected players without orders will be skipped)</span>
              )}
            </p>
            {orderOnlyCount === 0 && <p className="text-xs text-orange-600 mt-1">No eligible parents found for the selected teams.</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSend} disabled={sending || orderOnlyCount === 0}
            className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {sending ? "Sending..." : `Send to ${orderOnlyCount} Parent${orderOnlyCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== TEAMS TAB ============== */
function TabActivityTeams({ activityId, activity }) {
  const [orders, setOrders] = useState([]);
  const [expectedPlayers, setExpectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activities/${activityId}/orders`).then((r) => r.json()).then((d) => {
      setOrders(d.orders || []);
      setExpectedPlayers(d.expectedPlayers || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [activityId]);

  const activityTeams = (activity?.teams || []).map((t) => ({
    teamId: t.teamId?._id || t.teamId, name: t.teamId?.name || "Unknown",
    season: t.teamId?.season || "", gender: t.teamId?.gender || "",
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

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">Loading teams...</p>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">Teams ({activityTeams.length})</h3>
      {activityTeams.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">No teams in this activity.</p> : (
        <div className="space-y-3">
          {activityTeams.map((t) => {
            const s = teamStats(t.teamId);
            return (
              <div key={t.teamId} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{t.name}</span>
                    {t.gender && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.gender}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.season}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{s.members} player{s.members !== 1 ? "s" : ""}</span>
                    {s.expectedCount > 0 && <span className="text-xs text-orange-600">({s.registered} registered · {s.expectedCount} expected)</span>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Expected Revenue</p>
                    <p className="text-lg font-bold text-gray-900">${centsToDisplay(s.expectedRevenue)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Collected</p>
                    <p className="text-lg font-bold text-green-700">${centsToDisplay(s.collected)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Fully Paid</p>
                    <p className="text-lg font-bold text-blue-700">{s.fullyPaid}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Partially Paid</p>
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
function TabLogs({ activityId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activities/${activityId}/logs`).then((r) => r.json()).then((d) => setLogs(d.logs || [])).catch(() => {}).finally(() => setLoading(false));
  }, [activityId]);

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">Loading logs...</p>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">Activity Logs ({logs.length})</h3>
      {logs.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">No changes recorded yet.</p> : (
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
const OVERVIEW_TABS = [
  { key: "participants", label: "Participants" },
  { key: "teams", label: "Teams" },
  { key: "logs", label: "Logs" },
];

export default function ActivityPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
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

  if (loading) return <p className="text-gray-500 py-8 text-center">Loading activity...</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/activities")} className="text-gray-400 hover:text-gray-600 text-sm">← Activities</button>
          <h2 className="text-xl font-bold text-gray-900">{activity?.title || "Activity"}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activity?.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
            {activity?.status || "draft"}
          </span>
          {activity?.season && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{activity.season}</span>}
        </div>
        <Link href={`/dashboard/activities/${activityId}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Edit Activity
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
        {currentTab === "participants" && <TabParticipants activityId={activityId} activity={activity} />}
        {currentTab === "teams" && <TabActivityTeams activityId={activityId} activity={activity} />}
        {currentTab === "logs" && <TabLogs activityId={activityId} />}
      </div>
    </div>
  );
}
