"use client";

import { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import InvoiceSlideOver from "@/components/InvoiceSlideOver";
import SubscriptionItemReviewModal from "@/components/SubscriptionItemReviewModal";
import SendBulkLinksModal from "@/components/SendBulkLinksModal";
import SendMessageModal from "@/components/SendMessageModal";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import { normalizeCopyUrl } from "@/lib/copy-url";
import { formatDob, dobToInputValue } from "@/lib/dob";

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
  const [showRegModal, setShowRegModal] = useState(false);
  const [sendMessageTarget, setSendMessageTarget] = useState(null);
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const headerActionsRef = useRef(null);

  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLogs, setEditLogs] = useState([]);
  const [editTab, setEditTab] = useState("invoice");
  const [playerCardData, setPlayerCardData] = useState(null);
  const [inlineReviewModal, setInlineReviewModal] = useState(null);

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

  const activityTeams = useMemo(() => (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
    teamType: row.teamId?.teamType || "",
    gender: row.teamId?.gender || "",
  })), [activity]);
  const assignableActivityTeams = useMemo(() => activityTeams.filter((t) => t.teamId), [activityTeams]);
  const teamTypes = useMemo(() => [...new Set(activityTeams.map((team) => team.teamType).filter(Boolean))].sort(), [activityTeams]);
  const genders = useMemo(() => [...new Set(activityTeams.map((team) => team.gender).filter(Boolean))].sort(), [activityTeams]);
  const activitySubs = useMemo(() => (activity?.subscriptions || []).map((s, i) => ({
    id: s._id || `sub_${i}`, title: s.title, priceCents: s.priceCents || 0,
    includedTeamIds: s.includedTeamIds || [], maxInstallments: s.maxInstallments || 1,
    dueDateAmountCents: s.dueDateAmountCents || 0, firstInstallmentDate: s.firstInstallmentDate,
    items: (s.items || []).map((it) => ({ name: it.name, priceCents: it.priceCents, quantity: it.quantity, isRequired: it.isRequired, isDiscount: it.isDiscount || false })),
  })), [activity]);

  // Precompute the subscription list for each team so each row doesn't have to
  // re-filter `activitySubs` during render — a hot path when the Actions menu
  // toggles and the whole table re-renders.
  const subsByTeamId = useMemo(() => {
    const map = new Map();
    for (const s of activitySubs) {
      for (const tid of s.includedTeamIds || []) {
        const key = String(tid);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
      }
    }
    return map;
  }, [activitySubs]);

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

  async function handleExpectedTeamChange(ep, newTeamId) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (order) {
        handleInlineTeamChange(order._id, newTeamId);
      } else {
        setToast({ message: tc("somethingWentWrong"), type: "error" });
      }
    } catch {
      setToast({ message: tc("somethingWentWrong"), type: "error" });
    } finally {
      setActionBusy(null);
    }
  }

  function buildAutoSwitchItems(newSub, oldSub, currentItems) {
    const oldNames = new Set((oldSub?.items || []).map((i) => i.name));
    const newNames = new Set((newSub?.items || []).map((i) => i.name));
    const manualItems = (currentItems || [])
      .filter((it) => !oldNames.has(it.name) && !newNames.has(it.name))
      .map((it) => ({ name: it.name, priceCents: it.priceCents, quantity: it.quantity || 1, isDiscount: it.isDiscount || false }));
    const newItems = (newSub?.items || []).map((it) => ({
      name: it.name, priceCents: it.priceCents, quantity: it.quantity || 1, isDiscount: it.isDiscount || false,
    }));
    return [...newItems, ...manualItems];
  }

  function handleInlineTeamChange(orderId, newTeamId) {
    const order = orders.find((o) => o._id === orderId);
    const currentSubId = order?.subscriptionId || "";
    const matchingSubs = newTeamId
      ? activitySubs.filter((s) => (s.includedTeamIds || []).map(String).includes(String(newTeamId)))
      : [];
    const oldSub = activitySubs.find((s) => s.id === currentSubId) || null;
    const currentSubStillValid = matchingSubs.some((s) => s.id === currentSubId);

    if (!newTeamId) {
      applyInlineTeamChange(orderId, newTeamId, null, null);
      return;
    }

    if (matchingSubs.length === 0) {
      applyInlineTeamChange(orderId, newTeamId, null, null);
      return;
    }

    if (matchingSubs.length === 1) {
      const only = matchingSubs[0];
      if (currentSubStillValid && only.id === currentSubId) {
        applyInlineTeamChange(orderId, newTeamId, null, null);
        return;
      }
      const items = buildAutoSwitchItems(only, oldSub, order?.items || []);
      applyInlineTeamChange(
        orderId,
        newTeamId,
        { subscriptionId: only.id, subscriptionTitle: only.title, subscriptionPriceCents: only.priceCents || 0 },
        items,
      );
      return;
    }

    const preSelected = currentSubStillValid
      ? matchingSubs.find((s) => s.id === currentSubId)
      : matchingSubs[0];
    setInlineReviewModal({
      orderId,
      teamId: newTeamId,
      newSub: preSelected,
      oldSub,
      currentItems: order?.items || [],
      availableSubs: matchingSubs,
    });
  }

  function handleInlineSubChange(orderId, newSubId) {
    const order = orders.find((o) => o._id === orderId);
    if (!order) return;
    const currentTeamId = order.teamId?._id || order.teamId || null;
    const currentSubId = order.subscriptionId || "";
    if (newSubId === currentSubId) return;
    const matchingSubs = currentTeamId
      ? activitySubs.filter((s) => (s.includedTeamIds || []).map(String).includes(String(currentTeamId)))
      : activitySubs;
    const newSub = activitySubs.find((s) => s.id === newSubId);
    if (!newSub) return;
    const oldSub = activitySubs.find((s) => s.id === currentSubId) || null;
    setInlineReviewModal({
      orderId,
      teamId: currentTeamId,
      newSub,
      oldSub,
      currentItems: order.items || [],
      availableSubs: matchingSubs.length > 0 ? matchingSubs : activitySubs,
    });
  }

  async function applyInlineTeamChange(orderId, teamId, subData, items) {
    const body = { teamId: teamId || null };
    if (subData) {
      body.subscriptionId = subData.subscriptionId;
      body.subscriptionTitle = subData.subscriptionTitle;
      body.subscriptionPriceCents = subData.subscriptionPriceCents;
      if (items) body.items = items;
    } else if (!teamId) {
      body.subscriptionId = "";
      body.subscriptionTitle = "";
      body.subscriptionPriceCents = 0;
    }
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        fetchOrders();
        setToast({ message: td("invoiceSaved"), type: "success" });
      }
    } catch { /* ignore */ }
  }

  function handleInlineReviewConfirm({ items, subscriptionId, subscriptionTitle, subscriptionPriceCents }) {
    if (!inlineReviewModal) return;
    applyInlineTeamChange(
      inlineReviewModal.orderId,
      inlineReviewModal.teamId,
      { subscriptionId, subscriptionTitle, subscriptionPriceCents },
      items,
    );
    setInlineReviewModal(null);
  }

  const effectiveFilterTeams = useMemo(() => {
    let teams = assignableActivityTeams;
    if (filterTeamType) teams = teams.filter((team) => team.teamType === filterTeamType);
    if (filterGender) teams = teams.filter((team) => team.gender === filterGender);
    const typeOrGenderActive = filterTeamType || filterGender;
    if (typeOrGenderActive && filterTeams.size > 0) {
      const narrowed = new Set(teams.map((team) => String(team.teamId)));
      return new Set([...filterTeams].filter((id) => narrowed.has(id)));
    }
    if (typeOrGenderActive) return new Set(teams.map((team) => String(team.teamId)));
    return filterTeams;
  }, [assignableActivityTeams, filterTeamType, filterGender, filterTeams]);

  const filteredRows = useMemo(() => {
    const rows = [...orders, ...expectedPlayers];
    const q = search ? search.toLowerCase() : "";
    return rows.filter((r) => {
      if (effectiveFilterTeams.size > 0) {
        const tid = String(r.teamId?._id || r.teamId || "");
        if (!effectiveFilterTeams.has(tid)) return false;
      }
      if (filterSub && (r.subscriptionId || "") !== filterSub) return false;
      if (q) {
        const hay = [r.playerFirstName, r.playerLastName, r.parent1FirstName, r.parent1LastName, r.parent1Email, r.parent1Phone, r.parent2FirstName, r.parent2LastName, r.parent2Email, r.parent2Phone].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, expectedPlayers, effectiveFilterTeams, filterSub, search]);

  let statExpected = 0, statCollected = 0, statFullyPaid = 0, statPartialPaid = 0;
  filteredRows.forEach((r) => {
    if (r._isExpected) return;
    const total = computeRowTotal(r);
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
        playerPhonePrefix: ep.playerPhonePrefix || "+1", playerPhone: ep.playerPhone || "", playerEmail: ep.playerEmail || "",
        parent1FirstName: ep.parent1FirstName || "", parent1LastName: ep.parent1LastName || "",
        parent1PhonePrefix: ep.parent1PhonePrefix || "+1", parent1Phone: ep.parent1Phone || "", parent1Email: ep.parent1Email || "",
        parent2FirstName: ep.parent2FirstName || "", parent2LastName: ep.parent2LastName || "",
        parent2PhonePrefix: ep.parent2PhonePrefix || "+1", parent2Phone: ep.parent2Phone || "", parent2Email: ep.parent2Email || "",
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
      dueDateAmountCents: order.dueDateAmountCents || 0,
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
        if (Array.isArray(data.logs)) setEditLogs(data.logs);
        setToast({ message: td("invoiceSaved"), type: "success" });
      } else setToast({ message: data.error || tc("failedToSave"), type: "error" });
    } catch { setToast({ message: tc("failedToSave"), type: "error" }); }
    finally { setSaving(false); }
  }

  /* --- Actions --- */
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

  async function sendRegistrationLinkVia(orderId, channel) {
    setActionBusy(orderId);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/send-registration-link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: channel === "sms" ? td("regLinkCopied") : td("regLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  async function sendPaymentLinkVia(orderId, channel) {
    setActionBusy(orderId);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/send-payment-link`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) => prev.map((o) => o._id === orderId ? { ...o, paymentLinkSentAt: data.paymentLinkSentAt } : o));
        setToast({ message: td("paymentLinkCopied"), type: "success" });
      } else setToast({ message: data.error || tc("somethingWentWrong"), type: "error" });
    } catch { setToast({ message: tc("somethingWentWrong"), type: "error" }); }
    finally { setActionBusy(null); }
  }

  function openSendMessage(row) {
    const pfx = row.parent1PhonePrefix || row.playerPhonePrefix || "+1";
    const email = row.parent1Email || row.playerEmail || "";
    const phone = row.parent1Phone || row.playerPhone || "";
    const recipient = {
      type: "parent",
      id: row.playerId || row._id,
      name: row.parent1FirstName ? `${row.parent1FirstName} ${row.parent1LastName}` : `${row.playerFirstName} ${row.playerLastName}`,
      email,
      phone: phone ? `${pfx}${phone}` : "",
    };
    setSendMessageTarget(recipient);
  }

  async function openPlayerCard(playerId, orderRow) {
    if (!playerId) {
      if (orderRow) {
        setPlayerCardData({
          _fromOrder: true,
          orderId: orderRow._id,
          playerFirstName: orderRow.playerFirstName,
          playerLastName: orderRow.playerLastName,
          playerDob: orderRow.playerDob,
          playerGender: orderRow.playerGender || "",
          playerPhonePrefix: orderRow.playerPhonePrefix || "+1",
          playerPhone: orderRow.playerPhone || "",
          playerEmail: orderRow.playerEmail || "",
          parents: [
            orderRow.parent1FirstName ? {
              firstName: orderRow.parent1FirstName, lastName: orderRow.parent1LastName,
              email: orderRow.parent1Email, phonePrefix: orderRow.parent1PhonePrefix || "+1",
              phone: orderRow.parent1Phone,
            } : null,
            orderRow.parent2FirstName ? {
              firstName: orderRow.parent2FirstName, lastName: orderRow.parent2LastName,
              email: orderRow.parent2Email, phonePrefix: orderRow.parent2PhonePrefix || "+1",
              phone: orderRow.parent2Phone,
            } : null,
          ].filter(Boolean),
        });
      }
      return;
    }
    try {
      const res = await fetch(`/api/players/${playerId}`);
      const data = await res.json();
      if (data.player) setPlayerCardData(data.player);
    } catch { /* ignore */ }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {td("participantCount", { count: filteredRows.length })}
          {expectedPlayers.length > 0 && <span className="text-sm font-normal text-gray-500 ms-2">({td("registeredCount", { count: orders.length })} · {td("expectedCount", { count: expectedPlayers.length })})</span>}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
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
                <button onClick={() => { setShowRegModal(true); setHeaderActionsOpen(false); }}
                  className="w-full text-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  {td("sendRegistrationLinks")}
                </button>
                {activity?.registrationType === "public" && (
                  <button onClick={() => { copyPublicRegistrationLink(); setHeaderActionsOpen(false); }}
                    className="w-full text-start px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    {td("copyPublicLink")} (Registration)
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
              {assignableActivityTeams.map((team) => {
                const checked = filterTeams.has(String(team.teamId));
                return (
                  <label key={activityTeamSlotKey(team, team.slotIndex)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("totalExpected")}</p>
          <p className="text-lg font-bold text-gray-900">${centsToDisplay(statExpected)}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("totalCollected")}</p>
          <p className="text-lg font-bold text-green-700">${centsToDisplay(statCollected)}</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500">{td("totalUncollected")}</p>
          <p className="text-lg font-bold text-red-600">${centsToDisplay(statExpected - statCollected)}</p>
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-blue-800">{td("selected", { count: selected.size })}</span>
          <div className="flex items-center gap-2 flex-wrap">
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
                <th className="pb-2 px-2 font-medium hidden sm:table-cell">{td("team")}</th>
                <th className="pb-2 px-2 font-medium hidden md:table-cell">{td("regDate")}</th>
                {detailed && <th className="pb-2 px-2 font-medium hidden lg:table-cell">{td("parent1")}</th>}
                {detailed && <th className="pb-2 px-2 font-medium hidden lg:table-cell">{td("parent2")}</th>}
                <th className="pb-2 px-2 font-medium text-right hidden md:table-cell">{td("subCost")}</th>
                <th className="pb-2 px-2 font-medium text-right hidden md:table-cell">{td("items")}</th>
                <th className="pb-2 px-2 font-medium text-right hidden md:table-cell">{td("discounts")}</th>
                <th className="pb-2 px-2 font-medium text-right">{tc("total")}</th>
                <th className="pb-2 px-2 font-medium text-right hidden sm:table-cell">{td("paid")}</th>
                <th className="pb-2 px-2 font-medium text-right hidden lg:table-cell">{td("refund")}</th>
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
                    </td>
                    <td className="py-2.5 px-2 hidden sm:table-cell">
                      {(() => {
                        const rowTeamId = r.teamId?._id || r.teamId || "";
                        const rowSubsForTeam = rowTeamId ? (subsByTeamId.get(String(rowTeamId)) || []) : [];
                        const rowSubId = r.subscriptionId || "";
                        const rowSubOptions = rowSubId && !rowSubsForTeam.some((s) => s.id === rowSubId)
                          ? [...rowSubsForTeam, activitySubs.find((s) => s.id === rowSubId)].filter(Boolean)
                          : rowSubsForTeam;
                        const canChangeSub = !isExpected && rowSubOptions.length > 1;
                        return (
                          <div className="flex flex-col gap-1">
                            <select
                              value={rowTeamId}
                              onChange={(e) => isExpected ? handleExpectedTeamChange(r, e.target.value) : handleInlineTeamChange(r._id, e.target.value)}
                              className={`text-xs px-2 py-1 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${!r.teamId ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}
                            >
                              <option value="">{td("unassigned")}</option>
                              {assignableActivityTeams.map((at) => (
                                <option key={activityTeamSlotKey(at, at.slotIndex)} value={String(at.teamId)}>{at.name}</option>
                              ))}
                            </select>
                            {canChangeSub ? (
                              <select
                                value={rowSubId}
                                onChange={(e) => handleInlineSubChange(r._id, e.target.value)}
                                className="text-[11px] px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
                                title={r.subscriptionTitle || ""}
                              >
                                {!rowSubId && <option value="">—</option>}
                                {rowSubOptions.map((s) => (
                                  <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                              </select>
                            ) : (
                              r.subscriptionTitle ? (
                                <div className="text-[11px] text-gray-400 truncate max-w-[160px]" title={r.subscriptionTitle}>
                                  {r.subscriptionTitle}
                                </div>
                              ) : null
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-2 text-gray-500 text-xs hidden md:table-cell">{regDate ? fmtDate(regDate) : "—"}</td>
                    {detailed && (
                      <td className="py-2.5 px-2 hidden lg:table-cell">
                        {r.parent1FirstName ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{r.parent1FirstName} {r.parent1LastName}</div>
                            {r.parent1Email && <div className="text-[10px] text-gray-400 truncate">{r.parent1Email}</div>}
                            {r.parent1Phone && <div className="text-[10px] text-gray-400" dir="ltr">{r.parent1PhonePrefix || "+1"} {r.parent1Phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    )}
                    {detailed && (
                      <td className="py-2.5 px-2 hidden lg:table-cell">
                        {r.parent2FirstName ? (
                          <div>
                            <div className="text-xs font-medium text-gray-900">{r.parent2FirstName} {r.parent2LastName}</div>
                            {r.parent2Email && <div className="text-[10px] text-gray-400 truncate">{r.parent2Email}</div>}
                            {r.parent2Phone && <div className="text-[10px] text-gray-400" dir="ltr">{r.parent2PhonePrefix || "+1"} {r.parent2Phone}</div>}
                          </div>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                    )}
                    <td className="py-2.5 px-2 text-right text-xs hidden md:table-cell">{subCost > 0 ? `$${centsToDisplay(subCost)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right text-xs hidden md:table-cell">{itemsCost > 0 ? `$${centsToDisplay(itemsCost)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right text-xs hidden md:table-cell">{totalDiscounts > 0 ? <span className="text-red-500">-${centsToDisplay(totalDiscounts)}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right font-medium">{total > 0 ? `$${centsToDisplay(total)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="py-2.5 px-2 text-right hidden sm:table-cell">
                      <span className="text-green-700">{paid > 0 ? `$${centsToDisplay(paid)}` : <span className="text-gray-400">$0.00</span>}</span>
                      {(r.chosenInstallments || 0) > 1 && (
                        <div className="text-[10px] text-gray-400">{(r.installmentSchedule || []).filter((i) => i.status === "paid").length}/{r.chosenInstallments} {td("installments")}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs hidden lg:table-cell">{refunded > 0 ? <span className="text-purple-600">$${centsToDisplay(refunded)}</span> : <span className="text-gray-400">—</span>}</td>
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
                            {(() => {
                              const hasAnyContact = r.parent1Email || r.parent1Phone || r.playerEmail || r.playerPhone || r.parent2Email || r.parent2Phone;
                              if (isExpected) return (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceForExpected(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("editInvoice")}</button>
                                {r.playerId && (
                                  <button onClick={() => { setActionsOpen(null); openPlayerCard(r.playerId); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("playerCard")}</button>
                                )}
                                {!r.registrationCompletedAt && (
                                  <button onClick={async () => { setActionsOpen(null); const order = await ensureOrder(r); if (order) setSendLinkModal({ type: "registration", orderId: order._id, row: { ...r, _id: order._id } }); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("sendRegistrationLink")}</button>
                                )}
                                <button onClick={async () => { setActionsOpen(null); const order = await ensureOrder(r); if (order) setSendLinkModal({ type: "payment", orderId: order._id, row: { ...r, _id: order._id } }); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("sendPaymentLink")}</button>
                                <button onClick={() => { setActionsOpen(null); payFromAdminForExpected(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("payFromAdmin")}</button>
                                {hasAnyContact && (
                                  <button onClick={() => { setActionsOpen(null); openSendMessage(r); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">{td("sendMessage")}</button>
                                )}
                              </>
                              );
                              return (
                              <>
                                <button onClick={() => { setActionsOpen(null); openInvoiceModal(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("editInvoice")}</button>
                                <button onClick={() => { setActionsOpen(null); openPlayerCard(r.playerId || null, r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("playerCard")}</button>
                                {!r.registrationCompletedAt && (
                                  <button onClick={() => { setActionsOpen(null); setSendLinkModal({ type: "registration", orderId: r._id, row: r }); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("sendRegistrationLink")}</button>
                                )}
                                {r.status !== "paid" && (
                                  <>
                                    <button onClick={() => { setActionsOpen(null); setSendLinkModal({ type: "payment", orderId: r._id, row: r }); }}
                                      className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("sendPaymentLink")}</button>
                                    <button onClick={() => { setActionsOpen(null); payFromAdmin(r._id); }}
                                      className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("payFromAdmin")}</button>
                                  </>
                                )}
                                {hasAnyContact && (
                                  <button onClick={() => { setActionsOpen(null); openSendMessage(r); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 border-t mt-1 pt-1.5">{td("sendMessage")}</button>
                                )}
                              </>
                              );
                            })()}
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

      {/* SEND PAYMENT LINKS MODAL */}
      {showEmailModal && (
        <SendBulkLinksModal
          type="payment"
          activityId={activityId}
          activity={activity}
          orders={orders}
          expectedPlayers={expectedPlayers}
          onClose={() => setShowEmailModal(false)}
          onDone={(msg) => { setShowEmailModal(false); setToast({ message: msg, type: "success" }); refreshList(); }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {/* SEND REGISTRATION LINKS MODAL */}
      {showRegModal && (
        <SendBulkLinksModal
          type="registration"
          activityId={activityId}
          activity={activity}
          orders={orders}
          expectedPlayers={expectedPlayers}
          onClose={() => setShowRegModal(false)}
          onDone={(msg) => { setShowRegModal(false); setToast({ message: msg, type: "success" }); refreshList(); }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
        />
      )}

      {/* SEND MESSAGE MODAL */}
      {sendMessageTarget && (
        <SendMessageModal
          recipient={sendMessageTarget}
          onClose={() => setSendMessageTarget(null)}
          onSent={(msg) => setToast({ message: msg, type: "success" })}
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

      {/* INLINE TEAM CHANGE — SUBSCRIPTION ITEM REVIEW */}
      {inlineReviewModal && (
        <SubscriptionItemReviewModal
          newSub={inlineReviewModal.newSub}
          oldSub={inlineReviewModal.oldSub}
          availableSubs={inlineReviewModal.availableSubs}
          currentItems={inlineReviewModal.currentItems}
          onConfirm={handleInlineReviewConfirm}
          onCancel={() => setInlineReviewModal(null)}
        />
      )}

      {/* CREATE ORDER MODAL */}
      {showCreate && <CreateOrderModal activityTeams={assignableActivityTeams} activitySubs={activitySubs} saving={saving} onCreate={createOrder} onClose={() => setShowCreate(false)}
        prefill={typeof showCreate === "object" ? showCreate : null} tc={tc} td={td} />}

      {/* SEND LINK MODAL */}
      {sendLinkModal && (
        <SendLinkRecipientModal
          type={sendLinkModal.type}
          orderId={sendLinkModal.orderId}
          row={sendLinkModal.row}
          activityId={activityId}
          onClose={() => setSendLinkModal(null)}
          onDone={(msg) => { setSendLinkModal(null); setToast({ message: msg, type: "success" }); fetchOrders(); }}
          onError={(msg) => setToast({ message: msg, type: "error" })}
          tc={tc}
          td={td}
        />
      )}

      {/* PLAYER CARD MODAL */}
      {playerCardData && (
        <PlayerCardModal
          player={playerCardData}
          activityId={activityId}
          onClose={() => setPlayerCardData(null)}
          onUpdated={() => { fetchOrders(); }}
          tc={tc}
          td={td}
        />
      )}
    </div>
  );
}

/* ============== SEND LINK RECIPIENT MODAL ============== */
function SendLinkRecipientModal({ type, orderId, row, activityId, onClose, onDone, onError, tc, td }) {
  const [selections, setSelections] = useState({});
  const [sending, setSending] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      setLinkLoading(true);
      try {
        const endpoint = type === "registration"
          ? `/api/activities/${activityId}/orders/${orderId}/send-registration-link`
          : `/api/activities/${activityId}/orders/${orderId}/send-payment-link`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: [] }),
        });
        const data = await res.json();
        if (cancelled) return;
        const url = type === "registration" ? data.registrationUrl : data.paymentUrl;
        if (url) setLinkUrl(normalizeCopyUrl(url));
      } catch { /* silent */ }
      finally { if (!cancelled) setLinkLoading(false); }
    }
    loadLink();
    return () => { cancelled = true; };
  }, [type, orderId, activityId]);

  async function handleCopy() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { onError(tc("somethingWentWrong")); }
  }

  const targets = [
    {
      key: "player",
      label: td("player"),
      name: `${row.playerFirstName || ""} ${row.playerLastName || ""}`.trim(),
      email: row.playerEmail || "",
      phone: row.playerPhone || "",
      phonePrefix: row.playerPhonePrefix || "+1",
    },
    {
      key: "parent1",
      label: td("parent1Title"),
      name: `${row.parent1FirstName || ""} ${row.parent1LastName || ""}`.trim(),
      email: row.parent1Email || "",
      phone: row.parent1Phone || "",
      phonePrefix: row.parent1PhonePrefix || "+1",
    },
    {
      key: "parent2",
      label: td("parent2Title"),
      name: `${row.parent2FirstName || ""} ${row.parent2LastName || ""}`.trim(),
      email: row.parent2Email || "",
      phone: row.parent2Phone || "",
      phonePrefix: row.parent2PhonePrefix || "+1",
    },
  ].filter((t) => t.name && (t.email || t.phone));

  function toggle(targetKey, channel) {
    setSelections((prev) => {
      const k = `${targetKey}_${channel}`;
      return { ...prev, [k]: !prev[k] };
    });
  }

  const selectedCount = Object.values(selections).filter(Boolean).length;

  async function handleSend() {
    const recipients = [];
    for (const t of targets) {
      if (selections[`${t.key}_email`] && t.email) recipients.push({ target: t.key, channel: "email" });
      if (selections[`${t.key}_sms`] && t.phone) recipients.push({ target: t.key, channel: "sms" });
    }
    if (recipients.length === 0) { onError(td("selectAtLeastOneRecipient")); return; }

    setSending(true);
    try {
      const endpoint = type === "registration"
        ? `/api/activities/${activityId}/orders/${orderId}/send-registration-link`
        : `/api/activities/${activityId}/orders/${orderId}/send-payment-link`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.results || {};
        let msg = td("linksSent", { count: r.sent || recipients.length });
        if (r.failed > 0) msg += ` (${td("failedCount", { count: r.failed })})`;
        onDone(msg);
      } else {
        onError(data.error || tc("somethingWentWrong"));
      }
    } catch {
      onError(tc("somethingWentWrong"));
    } finally {
      setSending(false);
    }
  }

  const title = type === "registration" ? td("sendRegistrationLink") : td("sendPaymentLink");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            {type === "registration" ? td("registrationLink") : td("paymentLink")}
          </label>
          <div className="flex items-stretch gap-2 mb-5">
            <input
              readOnly
              value={linkLoading ? td("loadingLink") : linkUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 text-gray-700 font-mono truncate focus:outline-none focus:ring-2 focus:ring-blue-500"
              dir="ltr"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={!linkUrl || linkLoading}
              title={td("copyLink")}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition ${
                copied
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {td("linkCopied")}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {td("copyLink")}
                </>
              )}
            </button>
          </div>

          {targets.length > 0 && (
            <p className="text-sm text-gray-500 mb-4">{td("orSendTo")}</p>
          )}
          <div className="space-y-3">
            {targets.map((t) => (
              <div key={t.key} className="border rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900 mb-2">{t.label} — {t.name}</p>
                <div className="flex flex-wrap gap-3">
                  {t.email ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!selections[`${t.key}_email`]} onChange={() => toggle(t.key, "email")} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        {t.email}
                      </span>
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">{td("noEmail")}</span>
                  )}
                  {t.phone ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!selections[`${t.key}_sms`]} onChange={() => toggle(t.key, "sms")} className="rounded text-blue-600" />
                      <span className="text-sm text-gray-700 flex items-center gap-1" dir="ltr">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        {t.phonePrefix} {t.phone}
                      </span>
                    </label>
                  ) : (
                    <span className="text-xs text-gray-400">{td("noPhone")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {targets.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{td("noContactInfo")}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSend} disabled={sending || selectedCount === 0}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {sending ? td("sending") : td("sendSelected", { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== PLAYER CARD MODAL ============== */
function PlayerCardModal({ player, activityId, onClose, onUpdated, tc, td }) {
  const isFromOrder = player._fromOrder;
  const [editingParentIdx, setEditingParentIdx] = useState(null);
  const [parentForm, setParentForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(false);
  const [playerForm, setPlayerForm] = useState(null);

  const [addingParent, setAddingParent] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState("");
  const [parentSearchResults, setParentSearchResults] = useState([]);
  const [parentSearchLoading, setParentSearchLoading] = useState(false);
  const [newParentMode, setNewParentMode] = useState(false);
  const [newParentForm, setNewParentForm] = useState({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" });

  function startEditPlayer() {
    if (isFromOrder) {
      setPlayerForm({
        firstName: player.playerFirstName || "",
        lastName: player.playerLastName || "",
        dateOfBirth: dobToInputValue(player.playerDob),
        gender: player.playerGender || "",
        phonePrefix: player.playerPhonePrefix || "+1",
        phoneNumber: player.playerPhone || "",
        email: player.playerEmail || "",
      });
    } else {
      setPlayerForm({
        firstName: player.firstName || "",
        lastName: player.lastName || "",
        dateOfBirth: dobToInputValue(player.dateOfBirth),
        gender: player.gender || "",
        phonePrefix: player.phonePrefix || "+1",
        phoneNumber: player.phoneNumber || "",
        email: player.email || "",
      });
    }
    setEditingPlayer(true);
    setError("");
  }

  async function savePlayerEdit() {
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerFirstName: playerForm.firstName,
            playerLastName: playerForm.lastName,
            playerDob: playerForm.dateOfBirth || null,
            playerGender: playerForm.gender,
            playerPhonePrefix: playerForm.phonePrefix,
            playerPhone: playerForm.phoneNumber,
            playerEmail: playerForm.email,
          }),
        });
        if (!res.ok) { setError(tc("failedToSave")); return; }
      } else {
        const res = await fetch(`/api/players/${player._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(playerForm),
        });
        if (!res.ok) { setError(tc("failedToSave")); return; }
      }
      setEditingPlayer(false);
      onUpdated();
      onClose();
    } catch {
      setError(tc("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  function startEditParent(idx) {
    const p = isFromOrder ? player.parents[idx] : player.parents[idx];
    if (!p) return;
    setParentForm({
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      email: p.email || "",
      phonePrefix: p.phonePrefix || "+1",
      phone: p.phone || "",
    });
    setEditingParentIdx(idx);
    setError("");
    setConfirmAction(null);
  }

  async function saveParentEdit(action) {
    if (!parentForm) return;
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const field = editingParentIdx === 0 ? "parent1" : "parent2";
        const body = {};
        body[`${field}FirstName`] = parentForm.firstName;
        body[`${field}LastName`] = parentForm.lastName;
        body[`${field}Email`] = parentForm.email;
        body[`${field}PhonePrefix`] = parentForm.phonePrefix;
        body[`${field}Phone`] = parentForm.phone;
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      } else {
        const parentDoc = player.parents[editingParentIdx];
        if (!parentDoc?._id) { setError(tc("failedToSave")); setSaving(false); return; }

        if (action === "edit") {
          const res = await fetch(`/api/parents/${parentDoc._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parentForm),
          });
          if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
        } else if (action === "replace") {
          const res = await fetch(`/api/parents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...parentForm,
              phone: parentForm.phone || "0000000000",
            }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || tc("failedToSave")); setSaving(false); return; }
          const newParentId = data.parent._id;
          const newParentIds = player.parents.map((p, i) =>
            i === editingParentIdx ? newParentId : (p._id || p)
          );
          await fetch(`/api/players/${player._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentIds: newParentIds }),
          });
        }
      }
      setEditingParentIdx(null);
      setParentForm(null);
      setConfirmAction(null);
      onUpdated();
      onClose();
    } catch {
      setError(tc("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  function handleSaveParentClick() {
    if (isFromOrder) {
      saveParentEdit("edit");
      return;
    }
    setConfirmAction(true);
  }

  const searchTimerRef = useRef(null);
  function handleParentSearch(q) {
    setParentSearchQuery(q);
    setNewParentMode(false);
    clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setParentSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setParentSearchLoading(true);
      try {
        const res = await fetch(`/api/parents?search=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        const existingIds = (player.parents || []).map((p) => p._id?.toString?.() || p.toString());
        setParentSearchResults((data.parents || []).filter((p) => !existingIds.includes(p._id)));
      } catch { setParentSearchResults([]); }
      setParentSearchLoading(false);
    }, 300);
  }

  async function linkExistingParent(parentDoc) {
    setSaving(true);
    setError("");
    try {
      if (isFromOrder) {
        const slot = !player.parents?.length ? "parent1" : "parent2";
        const body = {};
        body[`${slot}FirstName`] = parentDoc.firstName;
        body[`${slot}LastName`] = parentDoc.lastName;
        body[`${slot}Email`] = parentDoc.email;
        body[`${slot}PhonePrefix`] = parentDoc.phonePrefix || "+1";
        body[`${slot}Phone`] = parentDoc.phone;
        const res = await fetch(`/api/activities/${activityId}/orders/${player.orderId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      } else {
        const newIds = [...(player.parents || []).map((p) => p._id || p), parentDoc._id];
        const res = await fetch(`/api/players/${player._id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentIds: newIds }),
        });
        if (!res.ok) { setError(tc("failedToSave")); setSaving(false); return; }
      }
      setAddingParent(false);
      setParentSearchQuery("");
      setParentSearchResults([]);
      onUpdated();
      onClose();
    } catch { setError(tc("somethingWentWrong")); }
    setSaving(false);
  }

  async function createAndLinkParent() {
    if (!newParentForm.firstName || !newParentForm.lastName || !newParentForm.email || !newParentForm.phone) {
      setError(tc("required")); return;
    }
    setSaving(true);
    setError("");
    try {
      const createRes = await fetch("/api/parents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newParentForm),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setError(createData.error || tc("failedToSave")); setSaving(false); return; }
      await linkExistingParent(createData.parent);
    } catch { setError(tc("somethingWentWrong")); setSaving(false); }
  }

  const pName = isFromOrder
    ? `${player.playerFirstName} ${player.playerLastName}`
    : `${player.firstName} ${player.lastName}`;
  const pDob = isFromOrder ? player.playerDob : player.dateOfBirth;
  const pGender = isFromOrder ? player.playerGender : player.gender;
  const pPhone = isFromOrder ? player.playerPhone : player.phoneNumber;
  const pPhonePrefix = isFromOrder ? player.playerPhonePrefix : player.phonePrefix;
  const pEmail = isFromOrder ? player.playerEmail : player.email;
  const parents = player.parents || [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{td("playerCard")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Player Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">{td("playerDetails")}</h4>
              {!editingPlayer && (
                <button onClick={startEditPlayer} className="text-gray-400 hover:text-blue-600 transition" title={tc("edit")}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              )}
            </div>
            {editingPlayer && playerForm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("firstName")}</label>
                    <input value={playerForm.firstName} onChange={(e) => setPlayerForm((p) => ({ ...p, firstName: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("lastName")}</label>
                    <input value={playerForm.lastName} onChange={(e) => setPlayerForm((p) => ({ ...p, lastName: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{td("dateOfBirth")}</label>
                    <input type="date" value={playerForm.dateOfBirth} onChange={(e) => setPlayerForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{td("gender")}</label>
                    <select value={playerForm.gender} onChange={(e) => setPlayerForm((p) => ({ ...p, gender: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">—</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("phone")}</label>
                    <PhonePrefixInput prefix={playerForm.phonePrefix} phone={playerForm.phoneNumber}
                      onPrefixChange={(v) => setPlayerForm((p) => ({ ...p, phonePrefix: v }))}
                      onPhoneChange={(v) => setPlayerForm((p) => ({ ...p, phoneNumber: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tc("email")}</label>
                    <input type="email" value={playerForm.email} onChange={(e) => setPlayerForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditingPlayer(false); setPlayerForm(null); }}
                    className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                  <button onClick={savePlayerEdit} disabled={saving}
                    className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? tc("saving") : tc("save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-gray-900 text-base">{pName}</p>
                {pDob && <p className="text-gray-500">{td("dateOfBirth")}: {formatDob(pDob)}</p>}
                {pGender && <p className="text-gray-500">{td("gender")}: {pGender}</p>}
                {pPhone && <p className="text-gray-500" dir="ltr">{tc("phone")}: {pPhonePrefix} {pPhone}</p>}
                {pEmail && <p className="text-gray-500">{tc("email")}: {pEmail}</p>}
              </div>
            )}
          </div>

          {/* Parents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">{td("parents")} ({parents.length})</h4>
              {parents.length < 2 && !addingParent && editingParentIdx === null && (
                <button onClick={() => { setAddingParent(true); setNewParentMode(false); setParentSearchQuery(""); setParentSearchResults([]); setError(""); }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800">+ {td("addParent")}</button>
              )}
            </div>
            {parents.length === 0 && !addingParent ? (
              <p className="text-sm text-gray-400">{td("noParentsOnRecord")}</p>
            ) : (
              <div className="space-y-3">
                {parents.map((parent, idx) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase">
                        {idx === 0 ? td("parent1Title") : td("parent2Title")}
                      </span>
                      {editingParentIdx !== idx && (
                        <button onClick={() => startEditParent(idx)} className="text-gray-400 hover:text-blue-600 transition" title={tc("edit")}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                    </div>
                    {editingParentIdx === idx && parentForm ? (
                      <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("firstName")}</label>
                            <input value={parentForm.firstName} onChange={(e) => setParentForm((p) => ({ ...p, firstName: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("lastName")}</label>
                            <input value={parentForm.lastName} onChange={(e) => setParentForm((p) => ({ ...p, lastName: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("phone")}</label>
                            <PhonePrefixInput prefix={parentForm.phonePrefix} phone={parentForm.phone}
                              onPrefixChange={(v) => setParentForm((p) => ({ ...p, phonePrefix: v }))}
                              onPhoneChange={(v) => setParentForm((p) => ({ ...p, phone: v }))} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">{tc("email")}</label>
                            <input type="email" value={parentForm.email} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))}
                              className="w-full border rounded-lg px-3 py-2 text-sm" />
                          </div>
                        </div>

                        {confirmAction ? (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-gray-900 mb-2">{td("parentEditConfirm")}</p>
                            <div className="flex flex-col gap-2">
                              <button onClick={() => saveParentEdit("edit")} disabled={saving}
                                className="w-full px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {td("editCurrentParent")}
                              </button>
                              <button onClick={() => saveParentEdit("replace")} disabled={saving}
                                className="w-full px-3 py-2 text-sm text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                                {td("replaceWithNewParent")}
                              </button>
                              <button onClick={() => { setConfirmAction(null); }}
                                className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">{tc("cancel")}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => { setEditingParentIdx(null); setParentForm(null); setConfirmAction(null); }}
                              className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                            <button onClick={handleSaveParentClick} disabled={saving}
                              className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                              {saving ? tc("saving") : tc("save")}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{parent.firstName} {parent.lastName}</p>
                        {parent.email && <p className="text-xs text-gray-500 mt-0.5">{parent.email}</p>}
                        {parent.phone && <p className="text-xs text-gray-500" dir="ltr">{parent.phonePrefix || "+1"} {parent.phone}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {addingParent && (
              <div className="mt-3 border rounded-lg p-3 bg-blue-50/50">
                {!newParentMode ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={parentSearchQuery}
                        onChange={(e) => handleParentSearch(e.target.value)}
                        placeholder={td("searchParentPlaceholder")}
                        className="w-full border rounded-lg px-3 py-2 text-sm pr-8"
                        autoFocus
                      />
                      {parentSearchLoading && (
                        <span className="absolute right-3 top-2.5 text-xs text-gray-400">...</span>
                      )}
                    </div>

                    {parentSearchQuery.trim() && parentSearchResults.length > 0 && (
                      <div className="border rounded-lg bg-white max-h-48 overflow-y-auto divide-y">
                        {parentSearchResults.map((p) => (
                          <div key={p._id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                            <div className="text-sm min-w-0">
                              <p className="font-medium text-gray-900 truncate">{p.firstName} {p.lastName}</p>
                              <p className="text-xs text-gray-500 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ""}</p>
                            </div>
                            <button onClick={() => linkExistingParent(p)} disabled={saving}
                              className="shrink-0 ml-2 px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                              {td("linkParent")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {parentSearchQuery.trim() && !parentSearchLoading && parentSearchResults.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">{td("noParentsFound")}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setAddingParent(false); setParentSearchQuery(""); setParentSearchResults([]); }}
                        className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("cancel")}</button>
                      <button onClick={() => { setNewParentMode(true); setNewParentForm({ firstName: "", lastName: "", email: "", phonePrefix: "+1", phone: "" }); }}
                        className="flex-1 px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700">
                        + {td("createNewParent")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase">{td("createNewParent")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("firstName")} *</label>
                        <input value={newParentForm.firstName} onChange={(e) => setNewParentForm((p) => ({ ...p, firstName: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("lastName")} *</label>
                        <input value={newParentForm.lastName} onChange={(e) => setNewParentForm((p) => ({ ...p, lastName: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("phone")} *</label>
                        <PhonePrefixInput prefix={newParentForm.phonePrefix} phone={newParentForm.phone}
                          onPrefixChange={(v) => setNewParentForm((p) => ({ ...p, phonePrefix: v }))}
                          onPhoneChange={(v) => setNewParentForm((p) => ({ ...p, phone: v }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{tc("email")} *</label>
                        <input type="email" value={newParentForm.email} onChange={(e) => setNewParentForm((p) => ({ ...p, email: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setNewParentMode(false)}
                        className="flex-1 px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">{tc("back")}</button>
                      <button onClick={createAndLinkParent} disabled={saving}
                        className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {saving ? tc("saving") : tc("save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">{error}</div>}
        </div>
      </div>
    </div>
  );
}

function CreateOrderModal({ activityTeams, activitySubs, saving, onCreate, onClose, prefill, tc, td }) {
  const [tab, setTab] = useState("registration");
  const [form, setForm] = useState(() => {
    const defaults = {
      playerFirstName: "", playerLastName: "", playerDob: "", playerGender: "",
      playerPhonePrefix: "+1", playerPhone: "", playerEmail: "",
      parent1FirstName: "", parent1LastName: "", parent1PhonePrefix: "+1", parent1Phone: "", parent1Email: "",
      parent2FirstName: "", parent2LastName: "", parent2PhonePrefix: "+1", parent2Phone: "", parent2Email: "",
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")} *</label>
                  <input value={form.playerFirstName} onChange={(e) => update("playerFirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")} *</label>
                  <input value={form.playerLastName} onChange={(e) => update("playerLastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("dateOfBirth")}</label>
                  <input type="date" value={form.playerDob} onChange={(e) => update("playerDob", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("gender")}</label>
                  <select value={form.playerGender} onChange={(e) => update("playerGender", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option><option value="Male">{td("male")}</option><option value="Female">{td("female")}</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                  <PhonePrefixInput prefix={form.playerPhonePrefix} phone={form.playerPhone} onPrefixChange={(v) => update("playerPhonePrefix", v)} onPhoneChange={(v) => update("playerPhone", v)} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label>
                  <input value={form.playerEmail} onChange={(e) => update("playerEmail", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1">{td("team")}</label>
                <select value={form.teamId} onChange={(e) => onTeamChange(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">{td("noTeam")}</option>
                  {activityTeams.map((team) => (
                    <option key={activityTeamSlotKey(team, team.slotIndex)} value={String(team.teamId)}>{team.name}</option>
                  ))}
                </select></div>
            </div>
          )}
          {tab === "parents" && (
            <div className="space-y-5">
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent1Title")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent1FirstName} onChange={(e) => update("parent1FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent1LastName} onChange={(e) => update("parent1LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                    <PhonePrefixInput prefix={form.parent1PhonePrefix} phone={form.parent1Phone} onPrefixChange={(v) => update("parent1PhonePrefix", v)} onPhoneChange={(v) => update("parent1Phone", v)} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent1Email} onChange={(e) => update("parent1Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
              <hr />
              <div><h4 className="text-sm font-semibold text-gray-700 mb-3">{td("parent2Title")} <span className="font-normal text-gray-400">{td("parent2Optional")}</span></h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("firstName")}</label><input value={form.parent2FirstName} onChange={(e) => update("parent2FirstName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("lastName")}</label><input value={form.parent2LastName} onChange={(e) => update("parent2LastName", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("phone")}</label>
                    <PhonePrefixInput prefix={form.parent2PhonePrefix} phone={form.parent2Phone} onPrefixChange={(v) => update("parent2PhonePrefix", v)} onPhoneChange={(v) => update("parent2Phone", v)} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">{tc("email")}</label><input value={form.parent2Email} onChange={(e) => update("parent2Email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                </div>
              </div>
            </div>
          )}
          {tab === "invoice" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
  }));
  const linkTeams = activityTeams.filter((t) => t.teamId);
  const [selectedTeams, setSelectedTeams] = useState(() => new Set(linkTeams.map((row) => String(row.teamId))));
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
    const id = String(tid);
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const ids = linkTeams.map((row) => String(row.teamId));
    const allOn = ids.length > 0 && ids.every((id) => selectedTeams.has(id));
    if (allOn) setSelectedTeams(new Set());
    else setSelectedTeams(new Set(ids));
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
                {linkTeams.length > 0 && selectedTeams.size === linkTeams.length ? td("deselectAll") : td("selectAll")}
              </button>
            </div>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5">
              {linkTeams.map((team) => (
                <label key={activityTeamSlotKey(team, team.slotIndex)} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                  <input type="checkbox" checked={selectedTeams.has(String(team.teamId))} onChange={() => toggleTeam(team.teamId)} className="rounded" />
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

  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
    season: row.teamId?.season || "",
    gender: row.teamId?.gender || "",
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
              <div key={activityTeamSlotKey(team, team.slotIndex)} className="border rounded-lg p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{team.name}</span>
                    {team.gender && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.gender}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.season}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{td("playerCount", { count: s.members })}</span>
                    {s.expectedCount > 0 && <span className="text-xs text-orange-600">({s.registered} {td("registered")} · {s.expectedCount} {td("expected")})</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("expectedRevenue")}</p>
                    <p className="text-lg font-bold text-gray-900">${centsToDisplay(s.expectedRevenue)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("collected")}</p>
                    <p className="text-lg font-bold text-green-700">${centsToDisplay(s.collected)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("totalUncollected")}</p>
                    <p className="text-lg font-bold text-red-600">${centsToDisplay(s.expectedRevenue - s.collected)}</p>
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

/* ============== REQUESTS TAB ============== */
function TabRequests({ activityId, tc, td }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondTo, setRespondTo] = useState(null);

  useEffect(() => {
    fetch(`/api/registration-requests?activityId=${activityId}`)
      .then((r) => r.json())
      .then((d) => { if (d.requests) setRequests(d.requests); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activityId]);

  async function updateStatus(reqId, status) {
    const res = await fetch(`/api/registration-requests/${reqId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.request) {
      setRequests((prev) => prev.map((r) => r._id === reqId ? d.request : r));
    }
  }

  if (loading) return <p className="text-gray-500 text-center py-8">{tc("loading")}</p>;

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">{td("requestsTab", { count: requests.length })}</h3>

      {requests.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">{td("noRequests")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestFrom")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestPlayer")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestSubject")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestStatus")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestDate")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{req.parentName}</div>
                    <div className="text-xs text-gray-400">{req.parentEmail}</div>
                    {req.parentPhone && <div className="text-xs text-gray-400">{req.parentPhone}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{req.playerName}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{req.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{req.message}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      req.status === "open" ? "bg-yellow-100 text-yellow-700" :
                      req.status === "responded" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {td(`request${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRespondTo(req)}
                        className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded font-medium hover:bg-blue-100"
                      >
                        {td("respondToRequest")}
                      </button>
                      {req.status === "open" && (
                        <button
                          onClick={() => updateStatus(req._id, "responded")}
                          className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded font-medium hover:bg-gray-100"
                        >
                          {td("markResponded")}
                        </button>
                      )}
                      {req.status !== "closed" && (
                        <button
                          onClick={() => updateStatus(req._id, "closed")}
                          className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded font-medium hover:bg-gray-100"
                        >
                          {td("markClosed")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {respondTo && (
        <RespondModal
          request={respondTo}
          onClose={() => setRespondTo(null)}
          onSent={(msg) => {
            updateStatus(respondTo._id, "responded");
            setRespondTo(null);
          }}
          tc={tc}
          td={td}
        />
      )}
    </div>
  );
}

function RespondModal({ request, onClose, onSent, tc, td }) {
  const t = useTranslations("messages");

  const recipients = [];
  if (request.parentEmail) {
    recipients.push({ key: "parent", label: `${request.parentName} (${request.parentEmail})`, type: "parent", name: request.parentName, email: request.parentEmail, phone: request.parentPhone || "", phonePrefix: "" });
  }

  const [selected, setSelected] = useState(() => recipients.map((r) => r.key));
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState(`Re: ${request.subject}`);
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [smsNotification, setSmsNotification] = useState(false);
  const [smsNotificationText, setSmsNotificationText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);
  const bodyRef = useRef(null);
  const imgInputRef = useRef(null);

  function execCmd(cmd, val = null) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function insertLink() {
    const url = prompt(t("enterUrl"));
    if (url) execCmd("createLink", url);
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
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

  function toggleRecipient(key) {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  async function handleSend() {
    const chosenRecipients = recipients.filter((r) => selected.includes(r.key));
    if (chosenRecipients.length === 0) { setToast({ message: td("selectAtLeastOneRecipient"), type: "error" }); return; }

    if (channel === "email") {
      const html = bodyRef.current?.innerHTML || bodyHtml;
      if (!subject.trim()) { setToast({ message: t("subjectRequired"), type: "error" }); return; }
      if (!html.trim() || html === "<br>") { setToast({ message: t("bodyRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const payload = {
          channel: "email",
          subject: subject.trim(),
          bodyHtml: html,
          recipients: chosenRecipients.map((r) => ({ type: r.type, name: r.name, email: r.email })),
        };
        if (smsNotification) {
          payload.smsNotification = true;
          const rawText = smsNotificationText || `${t("smsNotificationPrefix")}\n${t("smsNotificationSubjectLabel")} {email_subject}`;
          payload.smsText = rawText.replace(/\{email_subject\}/g, subject.trim());
        }
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          if (onSent) onSent(t("sentSuccess"));
          onClose();
        } else {
          setToast({ message: d.error || t("sentFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("sentFailed"), type: "error" });
      }
      setSending(false);
    } else {
      if (!bodyText.trim()) { setToast({ message: t("smsBodyRequired"), type: "error" }); return; }

      setSending(true);
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "sms",
            subject: "SMS",
            bodyText: bodyText.trim(),
            recipients: chosenRecipients.map((r) => ({ type: r.type, name: r.name, email: r.email, phonePrefix: r.phonePrefix, phone: r.phone })),
          }),
        });
        const d = await res.json();
        if (d.message?.status === "sent") {
          if (onSent) onSent(t("smsSentSuccess"));
          onClose();
        } else {
          setToast({ message: d.error || t("smsSendFailed"), type: "error" });
        }
      } catch {
        setToast({ message: t("smsSendFailed"), type: "error" });
      }
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{td("respondToRequest")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Original request summary */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div><span className="font-medium text-gray-500">{td("requestFrom")}:</span> <span className="text-gray-900">{request.parentName}</span></div>
            <div><span className="font-medium text-gray-500">{td("requestSubject")}:</span> <span className="text-gray-900">{request.subject}</span></div>
            <p className="text-gray-600 text-xs mt-1">{request.message}</p>
          </div>

          {/* Recipient checkboxes */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{td("respondDesc")}</p>
            <div className="space-y-1.5">
              {recipients.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(r.key)} onChange={() => toggleRecipient(r.key)}
                    className="rounded border-gray-300 text-blue-600" />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {/* Channel */}
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button type="button" onClick={() => setChannel("email")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "email" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
                {t("channelEmail")}
              </button>
              <button type="button" onClick={() => setChannel("sms")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${channel === "sms" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}>
                {t("channelSMS")}
              </button>
            </div>
          </div>

          {channel === "email" && (
            <>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder={t("subjectPlaceholder")}
                className="w-full border rounded-lg px-3 py-2 text-sm" />

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
                  style={{ overflowY: "auto", maxHeight: "250px" }}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={smsNotification} onChange={(e) => {
                  setSmsNotification(e.target.checked);
                  if (e.target.checked && !smsNotificationText) {
                    setSmsNotificationText(`${t("smsNotificationPrefix")}\n${t("smsNotificationSubjectLabel")} {email_subject}`);
                  }
                }} className="rounded" />
                <span className="text-sm text-gray-700">{t("smsNotification")}</span>
              </label>
              {smsNotification && (
                <>
                  <textarea value={smsNotificationText} onChange={(e) => setSmsNotificationText(e.target.value)}
                    rows={2} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                  <p className="text-xs text-gray-400">{t("smsVariableHint")}</p>
                </>
              )}
            </>
          )}

          {channel === "sms" && (
            <>
              <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
                placeholder={t("smsBodyPlaceholder")}
                rows={5} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              <p className="text-xs text-gray-400">{t("smsCharCount", { count: bodyText.length })}</p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{tc("cancel")}</button>
          <button onClick={handleSend} disabled={sending || selected.length === 0}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {sending ? t("sending") : t("send")}
          </button>
        </div>

        {toast && (
          <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-[60] ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`} onClick={() => setToast(null)}>{toast.message}</div>
        )}
      </div>
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
    { key: "requests", label: td("requests") },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button onClick={() => router.push("/dashboard/activities")} className="text-gray-400 hover:text-gray-600 text-sm">← {t("title")}</button>
          <h2 className="text-xl font-bold text-gray-900">{activity?.title || "Activity"}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activity?.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
            {activity?.status === "published" ? t("published") : activity?.status === "draft" || !activity?.status ? t("draft") : activity.status}
          </span>
          {activity?.season && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600" title={t("season")}>{activity.season}</span>}
        </div>
        <Link href={`/dashboard/activities/${activityId}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 text-center w-full sm:w-auto">
          {td("editActivity")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {OVERVIEW_TABS.map((tab) => (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap shrink-0 ${currentTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border p-3 sm:p-6">
        {currentTab === "participants" && <TabParticipants activityId={activityId} activity={activity} tc={tc} td={td} />}
        {currentTab === "teams" && <TabActivityTeams activityId={activityId} activity={activity} tc={tc} td={td} />}
        {currentTab === "requests" && <TabRequests activityId={activityId} tc={tc} td={td} />}
        {currentTab === "logs" && <TabLogs activityId={activityId} tc={tc} td={td} />}
      </div>
    </div>
  );
}
