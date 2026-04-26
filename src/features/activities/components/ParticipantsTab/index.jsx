"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";
import dynamic from "next/dynamic";
import InvoiceSlideOver from "@/components/InvoiceSlideOver";
import SubscriptionItemReviewModal from "@/components/SubscriptionItemReviewModal";
import SendBulkLinksModal from "@/components/SendBulkLinksModal";
import SendMessageModal from "@/components/SendMessageModal";
import ParticipantLogsDrawer, { ParticipantLogsContent } from "@/components/ParticipantLogsDrawer";
import PhonePrefixInput from "@/components/PhonePrefixInput";
import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import { formatDob } from "@/lib/dob";
import { pushToast } from "@/store/slices/uiSlice";
import {
  centsToDisplay,
  displayToCents,
  fmtDate,
  fmtDateTime,
} from "@/features/activities/utils/formatting";
import { STATUS_COLORS } from "@/features/activities/utils/statusColors";
import PriceInput from "@/features/activities/components/PriceInput";

// Modals are loaded on demand — they're conditionally rendered when the user
// opens an action menu, so there's no point shipping their JS up-front.
const SendLinkRecipientModal = dynamic(
  () => import("@/features/activities/components/SendLinkRecipientModal"),
  { ssr: false }
);
const BulkSendMessageModal = dynamic(
  () => import("@/features/activities/components/BulkSendMessageModal"),
  { ssr: false }
);
const PlayerCardModal = dynamic(
  () => import("@/features/activities/components/PlayerCardModal"),
  { ssr: false }
);
// Used by the mobile per-row Player Card tab. Reuses the same module chunk as PlayerCardModal
// (Next dedupes), so opening the tab and then opening the modal won't double-fetch.
const PlayerCardContentLazy = dynamic(
  () => import("@/features/activities/components/PlayerCardModal").then((m) => m.PlayerCardContent),
  { ssr: false }
);
const CreateOrderModal = dynamic(
  () => import("@/features/activities/components/CreateOrderModal"),
  { ssr: false }
);
const BulkActionModal = dynamic(
  () => import("@/features/activities/components/BulkActionModal"),
  { ssr: false }
);
const SendPaymentEmailsModal = dynamic(
  () => import("@/features/activities/components/SendPaymentEmailsModal"),
  { ssr: false }
);

export default function ParticipantsTab({ activityId, activity, tc, td }) {
  const dispatch = useDispatch();
  const [orders, setOrders] = useState([]);
  const [expectedPlayers, setExpectedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(null);
  const [mobileActionsRow, setMobileActionsRow] = useState(null);
  const [expandedCards, setExpandedCards] = useState(new Set());

  // Per-row mobile card tab. Defaults to "invoice"; we only store rows whose tab differs.
  // Keys are row ids (`r._id`, including the synthetic `expected_*` ids for unregistered players).
  const [cardTabs, setCardTabs] = useState({});
  // Lazy cache of full player records fetched when the user opens the Player Card tab on a row
  // with a linked playerId. Rows without a linked playerId build a `_fromOrder` shape inline.
  const [cardPlayerCache, setCardPlayerCache] = useState({});

  function toggleExpanded(id) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setCardTab(rowId, tab) {
    setCardTabs((prev) => ({ ...prev, [rowId]: tab }));
  }

  // Lazy-load the full player record for the Player Card tab when first opened on a linked row.
  // Returns immediately if cached; otherwise fires a fetch and lets the tab re-render once data arrives.
  async function ensureCardPlayer(rowId, playerId) {
    if (!playerId || cardPlayerCache[rowId]) return;
    try {
      const res = await fetch(`/api/players/${playerId}`);
      const data = await res.json();
      if (data.player) setCardPlayerCache((prev) => ({ ...prev, [rowId]: data.player }));
    } catch { /* ignore */ }
  }

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
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [sendLinkModal, setSendLinkModal] = useState(null);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const headerActionsRef = useRef(null);

  const [editOrder, setEditOrder] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLogs, setEditLogs] = useState([]);
  const [editTab, setEditTab] = useState("invoice");
  const [playerCardData, setPlayerCardData] = useState(null);
  const [inlineReviewModal, setInlineReviewModal] = useState(null);
  const [logsTarget, setLogsTarget] = useState(null);
  const [logsFocusComment, setLogsFocusComment] = useState(false);

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

  // Single source of truth for the per-row math used by both the desktop table
  // and the mobile card list. Keep these in sync — any row-level derived value
  // that the UI renders should be computed here, not in JSX.
  function computeRowDerived(r) {
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
    return { isExpected, subCost, itemsCost, totalDiscounts, total, paid, refunded, due, regDate, rowId };
  }

  async function handleExpectedTeamChange(ep, newTeamId) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (order) {
        handleInlineTeamChange(order._id, newTeamId);
      } else {
        dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" }));
      }
    } catch {
      dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" }));
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
        dispatch(pushToast({ message: td("invoiceSaved"), type: "success" }));
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
      else dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
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
        dispatch(pushToast({ message: td("invoiceSaved"), type: "success" }));
      } else dispatch(pushToast({ message: data.error || tc("failedToSave"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("failedToSave"), type: "error" })); }
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
      else dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
    finally { setActionBusy(null); }
  }

  async function payFromAdminForExpected(ep) {
    setActionBusy(ep._id);
    try {
      const order = await ensureOrder(ep);
      if (!order) { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); return; }
      const res = await fetch(`/api/register/${activityId}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order._id, adminReturn: true }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
      else dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
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
        dispatch(pushToast({ message: td("registrationCreated"), type: "success" }));
      } else dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
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
        dispatch(pushToast({ message: channel === "sms" ? td("regLinkCopied") : td("regLinkCopied"), type: "success" }));
      } else dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
    finally { setActionBusy(null); }
  }

  async function sendWaiversConfirmationEmail(orderId) {
    setActionBusy(orderId);
    try {
      const res = await fetch(`/api/activities/${activityId}/orders/${orderId}/send-waivers-email`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        const count = (data.sentTo || []).length;
        dispatch(pushToast({ message: td("waiversEmailSent", { count }), type: "success" }));
      } else {
        dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
      }
    } catch {
      dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" }));
    } finally {
      setActionBusy(null);
    }
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
        dispatch(pushToast({ message: td("paymentLinkCopied"), type: "success" }));
      } else dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
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
    navigator.clipboard.writeText(url).then(() => dispatch(pushToast({ message: td("publicLinkCopied"), type: "success" })));
  }

  function copyPublicRegistrationLink() {
    const url = `${window.location.origin}/register/${activityId}`;
    navigator.clipboard.writeText(url).then(() => dispatch(pushToast({ message: td("registrationLinkCopied"), type: "success" })));
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
        dispatch(pushToast({ message: td("repairedOrders", { count: data.repaired }), type: "success" }));
        refreshList();
      } else {
        dispatch(pushToast({ message: data.error || td("repairFailed"), type: "error" }));
      }
    } catch { dispatch(pushToast({ message: td("repairFailed"), type: "error" })); }
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
      dispatch(pushToast({ message: td("selectRegisteredPlayers"), type: "error" }));
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
        dispatch(pushToast({ message: td("updatedInvoices", { count: data.count }), type: "success" }));
        setSelected(new Set());
        setBulkModal(null);
      } else {
        dispatch(pushToast({ message: data.error || tc("somethingWentWrong"), type: "error" }));
      }
    } catch { dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" })); }
    finally { setBulkBusy(false); }
  }

  if (loading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  return (
    <div>
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

      {/* BULK ACTIONS BAR — sticky so it floats with the user while scrolling the participants table */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 bg-blue-50/95 backdrop-blur border border-blue-200 rounded-lg px-4 py-3 mb-4 shadow-md flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
            <button onClick={() => setBulkMessageOpen(true)}
              className="bg-white border border-blue-300 text-blue-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-100">
              {td("sendMessage")}
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

      {/* TABLE / CARDS — desktop renders the table, mobile renders accordion cards */}
      {filteredRows.length === 0 ? (
        <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{(orders.length + expectedPlayers.length) === 0 ? td("noParticipantsYet") : td("noResultsMatchFilters")}</p>
      ) : (
        <>
        <div className="hidden md:block overflow-x-auto">
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
                const { isExpected, subCost, itemsCost, totalDiscounts, total, paid, refunded, due, regDate, rowId } = computeRowDerived(r);
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
                      <div className="inline-flex items-center gap-1">
                        {!isExpected && (
                          <button onClick={(e) => { e.stopPropagation(); setLogsFocusComment(false); setLogsTarget(r); }}
                            title={td("viewLogs")}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
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
                                <button onClick={async () => {
                                  setActionsOpen(null);
                                  const order = await ensureOrder(r);
                                  if (order) {
                                    setLogsFocusComment(true);
                                    setLogsTarget({ ...r, _id: order._id });
                                  }
                                }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("comment")}</button>
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
                                <button onClick={() => { setActionsOpen(null); setLogsFocusComment(true); setLogsTarget(r); }}
                                  className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("comment")}</button>
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
                                {(r.waiverConsents || []).some((c) => c.agreedAt) && (
                                  <button onClick={() => { setActionsOpen(null); sendWaiversConfirmationEmail(r._id); }}
                                    className="w-full text-start px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{td("sendWaiversConfirmationEmail")}</button>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD LIST — same data as the desktop table, rendered as accordion cards under md.
            Header (always visible): checkbox, name, status pill, total/due, chevron.
            Body (expanded): team & subscription, dates, parents (when "detailed"), cost breakdown,
            full-width primary action + 50/50 secondary actions per the mobile design rules. */}
        <div className="md:hidden space-y-2.5">
          {filteredRows.map((r) => {
            const { isExpected, subCost, itemsCost, totalDiscounts, total, paid, refunded, due, regDate, rowId } = computeRowDerived(r);
            const isOpen = expandedCards.has(rowId);
            const rowTeamId = r.teamId?._id || r.teamId || "";
            const rowSubsForTeam = rowTeamId ? (subsByTeamId.get(String(rowTeamId)) || []) : [];
            const rowSubId = r.subscriptionId || "";
            const rowSubOptions = rowSubId && !rowSubsForTeam.some((s) => s.id === rowSubId)
              ? [...rowSubsForTeam, activitySubs.find((s) => s.id === rowSubId)].filter(Boolean)
              : rowSubsForTeam;
            const canChangeSub = !isExpected && rowSubOptions.length > 1;
            const hasAnyContact = r.parent1Email || r.parent1Phone || r.playerEmail || r.playerPhone || r.parent2Email || r.parent2Phone;

            const isPaid = !isExpected && r.status === "paid";
            const isPartial = !isExpected && (paid > 0 && due > 0);
            const statusLabel = isExpected ? td("expected") : (isPaid ? tc("statusPaid") : isPartial ? tc("statusPartial") : tc("statusPending"));
            const statusClass = isExpected
              ? "bg-orange-100 text-orange-700"
              : isPaid
                ? "bg-green-100 text-green-700"
                : isPartial
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700";

            return (
              <div key={rowId}
                className={`rounded-xl border bg-white shadow-sm ${isExpected ? "border-orange-200 bg-orange-50/30" : "border-gray-200"}`}>
                {/* HEADER — checkbox is its own click target; tap the rest to toggle the accordion */}
                <div className="px-3 py-3 flex items-center gap-3">
                  <label className="flex-shrink-0 w-6 h-6 inline-flex items-center justify-center cursor-pointer">
                    <input type="checkbox" checked={selected.has(rowId)} onChange={() => toggleSelect(rowId)} className="rounded" />
                  </label>
                  <button type="button" onClick={() => toggleExpanded(rowId)}
                    aria-expanded={isOpen}
                    className="flex-1 min-w-0 flex items-center gap-3 text-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`font-medium truncate ${isExpected ? "text-gray-700" : "text-gray-900"}`}>
                          {r.playerFirstName} {r.playerLastName}
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                        <span>{tc("total")}: <span className="text-gray-700 font-medium">{total > 0 ? `$${centsToDisplay(total)}` : "—"}</span></span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {td("due")}: {due > 0
                            ? <span className="text-red-600 font-medium">${centsToDisplay(due)}</span>
                            : <span className="text-green-600 font-medium">$0.00</span>}
                        </span>
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* BODY — accordion content, organized into tabs:
                    - Invoice: team/subscription selectors + reg date + cost breakdown
                    - Parents: parent 1 & parent 2 contact info (always visible, no global "detailed" toggle needed)
                    - Comments: inline comment editor + audit timeline (shared with the desktop drawer)
                    - Player Card: inline player + parent editing (shared with the desktop modal)
                    The Actions button below the tabs opens the bottom-sheet picker for everything else. */}
                {isOpen && (() => {
                  const activeTab = cardTabs[rowId] || "invoice";
                  const cardPlayer = (() => {
                    if (cardPlayerCache[rowId]) return cardPlayerCache[rowId];
                    return {
                      _fromOrder: true,
                      orderId: r._id,
                      playerFirstName: r.playerFirstName,
                      playerLastName: r.playerLastName,
                      playerDob: r.playerDob,
                      playerGender: r.playerGender || "",
                      playerPhonePrefix: r.playerPhonePrefix || "+1",
                      playerPhone: r.playerPhone || "",
                      playerEmail: r.playerEmail || "",
                      parents: [
                        r.parent1FirstName ? {
                          firstName: r.parent1FirstName, lastName: r.parent1LastName,
                          email: r.parent1Email, phonePrefix: r.parent1PhonePrefix || "+1",
                          phone: r.parent1Phone,
                        } : null,
                        r.parent2FirstName ? {
                          firstName: r.parent2FirstName, lastName: r.parent2LastName,
                          email: r.parent2Email, phonePrefix: r.parent2PhonePrefix || "+1",
                          phone: r.parent2Phone,
                        } : null,
                      ].filter(Boolean),
                    };
                  })();
                  // Tab gating:
                  // - Comments needs a real orderId (the API is per-order). Hide for expected rows;
                  //   they still get Edit Invoice in the Actions sheet which creates the order.
                  // - Player + Parents on an expected row would save against the synthetic `expected_*`
                  //   orderId which doesn't exist on the backend. We can still edit when there's a real
                  //   linked player to fetch (saves go to /api/players/:id and /api/parents/:id instead),
                  //   or when the row already has a real orderId (non-expected).
                  // - For expected rows WITHOUT a linked playerId: hide the Player tab entirely; keep the
                  //   Parents tab but render a read-only summary (no editing path is possible).
                  const showCommentsTab = !isExpected;
                  const canEditPlayerOrParents = !isExpected || !!r.playerId;
                  const showPlayerTab = canEditPlayerOrParents;
                  // Tab labels stay short on purpose — see mobile-design rule. The Player tab uses
                  // the shorter `td("player")` (not `td("playerCard")`) so it fits one line on the
                  // narrowest phone alongside Invoice / Parents / Comments.
                  // Order: Invoice, Player, Parents, Comments — most-used context first.
                  const tabs = [
                    { value: "invoice", label: td("invoice") },
                    ...(showPlayerTab ? [{ value: "playerCard", label: td("player") }] : []),
                    { value: "parents", label: td("parents") },
                    ...(showCommentsTab ? [{ value: "comments", label: td("comments") }] : []),
                  ];
                  const onTabChange = (next) => {
                    setCardTab(rowId, next);
                    // Both Player and Parents tabs benefit from the linked player record so edits
                    // flow into /api/players/:id / /api/parents/:id (propagating to all activities).
                    if ((next === "playerCard" || next === "parents") && r.playerId) {
                      ensureCardPlayer(rowId, r.playerId);
                    }
                  };
                  return (
                    <div className="border-t border-gray-100 pt-3 px-3 pb-3 space-y-3">
                      {/* Tab strip spans the full card width edge-to-edge (negates the card's px-3)
                          so all 4 tabs fit on a phone without overflow scroll. Each tab is
                          flex-1 + min-w-0 + truncate so labels share width equally. */}
                      <div role="tablist" className="-mx-3 flex w-[calc(100%+1.5rem)] border-b border-gray-100">
                        {tabs.map((tab) => {
                          const isActive = tab.value === activeTab;
                          return (
                            <button
                              key={tab.value}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              onClick={() => onTabChange(tab.value)}
                              className={`flex-1 min-w-0 truncate px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
                                isActive
                                  ? "border-blue-600 text-blue-600"
                                  : "border-transparent text-gray-500 hover:text-gray-700"
                              }`}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* INVOICE TAB */}
                      {activeTab === "invoice" && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-medium">{td("team")}</label>
                            <select
                              value={rowTeamId}
                              onChange={(e) => isExpected ? handleExpectedTeamChange(r, e.target.value) : handleInlineTeamChange(r._id, e.target.value)}
                              className={`w-full text-sm px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${!r.teamId ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-700"}`}
                            >
                              <option value="">{td("unassigned")}</option>
                              {assignableActivityTeams.map((at) => (
                                <option key={activityTeamSlotKey(at, at.slotIndex)} value={String(at.teamId)}>{at.name}</option>
                              ))}
                            </select>
                            {canChangeSub ? (
                              <>
                                <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-medium">{td("subscription")}</label>
                                <select
                                  value={rowSubId}
                                  onChange={(e) => handleInlineSubChange(r._id, e.target.value)}
                                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
                                >
                                  {!rowSubId && <option value="">—</option>}
                                  {rowSubOptions.map((s) => (
                                    <option key={s.id} value={s.id}>{s.title}</option>
                                  ))}
                                </select>
                              </>
                            ) : r.subscriptionTitle ? (
                              <div className="text-xs text-gray-500"><span className="font-medium text-gray-600">{td("subscription")}:</span> {r.subscriptionTitle}</div>
                            ) : null}
                          </div>

                          <dl className="text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-gray-500">{td("regDate")}</dt>
                              <dd className="text-gray-700">{regDate ? fmtDate(regDate) : "—"}</dd>
                            </div>
                          </dl>

                          <dl className="text-xs space-y-1 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-gray-500">{td("subCost")}</dt>
                              <dd className="text-gray-700">{subCost > 0 ? `$${centsToDisplay(subCost)}` : "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-gray-500">{td("items")}</dt>
                              <dd className="text-gray-700">{itemsCost > 0 ? `$${centsToDisplay(itemsCost)}` : "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-gray-500">{td("discounts")}</dt>
                              <dd className={totalDiscounts > 0 ? "text-red-500" : "text-gray-700"}>{totalDiscounts > 0 ? `-$${centsToDisplay(totalDiscounts)}` : "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
                              <dt className="text-gray-500">{tc("total")}</dt>
                              <dd className="text-gray-900 font-medium">{total > 0 ? `$${centsToDisplay(total)}` : "—"}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-gray-500">{td("paid")}</dt>
                              <dd className="text-green-700 font-medium">
                                {paid > 0 ? `$${centsToDisplay(paid)}` : "$0.00"}
                                {(r.chosenInstallments || 0) > 1 && (
                                  <span className="ms-1 text-[10px] text-gray-400 font-normal">{(r.installmentSchedule || []).filter((i) => i.status === "paid").length}/{r.chosenInstallments} {td("installments")}</span>
                                )}
                              </dd>
                            </div>
                            {refunded > 0 && (
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-gray-500">{td("refund")}</dt>
                                <dd className="text-purple-600">${centsToDisplay(refunded)}</dd>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
                              <dt className="text-gray-500 font-medium">{td("due")}</dt>
                              <dd className={due > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                                {due > 0 ? `$${centsToDisplay(due)}` : "$0.00"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}

                      {/* PARENTS TAB — full editable parents list (edit / search & link / replace / create new).
                          Reuses the same PlayerCardContent body as the desktop modal, scoped to the parents
                          section. For expected rows without a linked playerId we have no save target, so we
                          fall back to a read-only summary instead. */}
                      {activeTab === "parents" && (
                        canEditPlayerOrParents ? (
                          <PlayerCardContentLazy
                            player={cardPlayer}
                            activityId={activityId}
                            onClose={() => {}}
                            onUpdated={() => fetchOrders()}
                            tc={tc}
                            td={td}
                            section="parents"
                          />
                        ) : (
                          <div className="space-y-3 text-sm">
                            {(r.parent1FirstName || r.parent2FirstName) ? (
                              <>
                                {r.parent1FirstName && (
                                  <div className="border rounded-lg p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">{td("parent1")}</div>
                                    <div className="text-gray-900 font-medium">{r.parent1FirstName} {r.parent1LastName}</div>
                                    {r.parent1Email && <div className="text-gray-500 truncate">{r.parent1Email}</div>}
                                    {r.parent1Phone && <div className="text-gray-500" dir="ltr">{r.parent1PhonePrefix || "+1"} {r.parent1Phone}</div>}
                                  </div>
                                )}
                                {r.parent2FirstName && (
                                  <div className="border rounded-lg p-3">
                                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">{td("parent2")}</div>
                                    <div className="text-gray-900 font-medium">{r.parent2FirstName} {r.parent2LastName}</div>
                                    {r.parent2Email && <div className="text-gray-500 truncate">{r.parent2Email}</div>}
                                    {r.parent2Phone && <div className="text-gray-500" dir="ltr">{r.parent2PhonePrefix || "+1"} {r.parent2Phone}</div>}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-sm text-gray-400 text-center py-4">{td("noParentsOnRecord")}</p>
                            )}
                          </div>
                        )
                      )}

                      {/* COMMENTS TAB — only for non-expected rows (need an orderId for the logs API).
                          Reuses the same component the desktop drawer wraps. Clamped to the 2 most
                          recent entries on mobile so the timeline doesn't dominate the card; users
                          can expand inline to see the rest. */}
                      {activeTab === "comments" && !isExpected && (
                        <ParticipantLogsContent order={r} activityId={activityId} initialLimit={2} />
                      )}

                      {/* PLAYER TAB — reuses the same component the desktop modal wraps, scoped to the
                          player-details section only (parents live in the Parents tab). The existing
                          edit pencil icon stays inside `PlayerCardContent` for editing the player. */}
                      {activeTab === "playerCard" && (
                        <PlayerCardContentLazy
                          player={cardPlayer}
                          activityId={activityId}
                          onClose={() => {}}
                          onUpdated={() => fetchOrders()}
                          tc={tc}
                          td={td}
                          section="player"
                        />
                      )}

                      {/* ACTIONS — single full-width button opens a bottom sheet picker (mobile-design rule).
                          Sheet excludes Comments / Player Card (those are tabs now); everything else stays in the sheet. */}
                      <div className="pt-2 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() => setMobileActionsRow(r)}
                          disabled={actionBusy === rowId}
                          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {actionBusy === rowId ? "..." : tc("actions")}
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* MOBILE ACTIONS BOTTOM SHEET — mirrors the desktop ▾ dropdown one-for-one (same gating).
          Triggered by the per-row "Actions" button on the mobile card; rendered once for the whole list. */}
      {mobileActionsRow && (() => {
        const r = mobileActionsRow;
        const isExpected = !!r._isExpected;
        const { due } = computeRowDerived(r);
        const hasAnyContact = r.parent1Email || r.parent1Phone || r.playerEmail || r.playerPhone || r.parent2Email || r.parent2Phone;
        const close = () => setMobileActionsRow(null);
        const itemClass = "w-full text-start px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed";
        const primaryClass = `${itemClass} text-blue-600 font-medium`;
        const neutralClass = `${itemClass} text-gray-700`;
        return (
          <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
            <button type="button" aria-label={tc("close")} onClick={close} className="absolute inset-0 bg-black/40" />
            <div className="relative w-full bg-white rounded-t-2xl shadow-xl overflow-hidden">
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="block w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="px-4 pb-2 text-xs uppercase tracking-wider text-gray-500 font-medium truncate">
                {r.playerFirstName} {r.playerLastName}
              </div>
              <div className="max-h-[75vh] overflow-y-auto border-t border-gray-100 divide-y divide-gray-100">
                {/* NOTE: Comment / View logs / Player Card are intentionally NOT in this sheet —
                    they live as per-row tabs in the card body. Keep this sheet focused on the actions
                    that need a confirmation, navigate elsewhere, or trigger background work. */}
                {isExpected ? (
                  <>
                    <button className={neutralClass} onClick={() => { close(); openInvoiceForExpected(r); }}>{td("editInvoice")}</button>
                    {!r.registrationCompletedAt && (
                      <button className={neutralClass} onClick={async () => {
                        close();
                        const order = await ensureOrder(r);
                        if (order) setSendLinkModal({ type: "registration", orderId: order._id, row: { ...r, _id: order._id } });
                      }}>{td("sendRegistrationLink")}</button>
                    )}
                    {due > 0 && (
                      <button className={neutralClass} onClick={async () => {
                        close();
                        const order = await ensureOrder(r);
                        if (order) setSendLinkModal({ type: "payment", orderId: order._id, row: { ...r, _id: order._id } });
                      }}>{td("sendPaymentLink")}</button>
                    )}
                    {due > 0 && (
                      <button className={neutralClass} onClick={() => { close(); payFromAdminForExpected(r); }}>{td("payFromAdmin")}</button>
                    )}
                    {hasAnyContact && (
                      <button className={primaryClass} onClick={() => { close(); openSendMessage(r); }}>{td("sendMessage")}</button>
                    )}
                  </>
                ) : (
                  <>
                    <button className={neutralClass} onClick={() => { close(); openInvoiceModal(r); }}>{td("editInvoice")}</button>
                    {!r.registrationCompletedAt && (
                      <button className={neutralClass} onClick={() => { close(); setSendLinkModal({ type: "registration", orderId: r._id, row: r }); }}>
                        {td("sendRegistrationLink")}
                      </button>
                    )}
                    {r.status !== "paid" && (
                      <button className={neutralClass} onClick={() => { close(); setSendLinkModal({ type: "payment", orderId: r._id, row: r }); }}>
                        {td("sendPaymentLink")}
                      </button>
                    )}
                    {r.status !== "paid" && (
                      <button className={neutralClass} onClick={() => { close(); payFromAdmin(r._id); }}>{td("payFromAdmin")}</button>
                    )}
                    {(r.waiverConsents || []).some((c) => c.agreedAt) && (
                      <button className={neutralClass} onClick={() => { close(); sendWaiversConfirmationEmail(r._id); }}>{td("sendWaiversConfirmationEmail")}</button>
                    )}
                    {hasAnyContact && (
                      <button className={primaryClass} onClick={() => { close(); openSendMessage(r); }}>{td("sendMessage")}</button>
                    )}
                  </>
                )}
              </div>
              <button type="button" onClick={close}
                className="w-full text-center px-4 py-3 text-sm font-medium text-gray-600 border-t border-gray-100 hover:bg-gray-50">
                {tc("cancel")}
              </button>
            </div>
          </div>
        );
      })()}

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
          onDone={(msg) => { setShowEmailModal(false); dispatch(pushToast({ message: msg, type: "success" })); refreshList(); }}
          onError={(msg) => dispatch(pushToast({ message: msg, type: "error" }))}
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
          onDone={(msg) => { setShowRegModal(false); dispatch(pushToast({ message: msg, type: "success" })); refreshList(); }}
          onError={(msg) => dispatch(pushToast({ message: msg, type: "error" }))}
        />
      )}

      {/* SEND MESSAGE MODAL */}
      {sendMessageTarget && (
        <SendMessageModal
          recipient={sendMessageTarget}
          onClose={() => setSendMessageTarget(null)}
          onSent={(msg) => dispatch(pushToast({ message: msg, type: "success" }))}
        />
      )}

      {/* PARTICIPANT LOGS DRAWER */}
      {logsTarget && (
        <ParticipantLogsDrawer
          order={logsTarget}
          activityId={activityId}
          focusComment={logsFocusComment}
          onClose={() => { setLogsTarget(null); setLogsFocusComment(false); }}
        />
      )}

      {/* BULK SEND MESSAGE MODAL */}
      {bulkMessageOpen && (
        <BulkSendMessageModal
          activityId={activityId}
          activity={activity}
          rows={filteredRows.filter((r) => selected.has(r._id))}
          ensureOrder={ensureOrder}
          onClose={() => setBulkMessageOpen(false)}
          onDone={(msg) => { setBulkMessageOpen(false); setSelected(new Set()); dispatch(pushToast({ message: msg, type: "success" })); fetchOrders(); }}
          onError={(msg) => dispatch(pushToast({ message: msg, type: "error" }))}
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
          activity={activity}
          onClose={() => setSendLinkModal(null)}
          onDone={(msg) => { setSendLinkModal(null); dispatch(pushToast({ message: msg, type: "success" })); fetchOrders(); }}
          onError={(msg) => dispatch(pushToast({ message: msg, type: "error" }))}
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
