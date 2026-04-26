"use client";

import { useState } from "react";

export default function ContactForm({ activityId, activity, order, t, tc }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      await fetch("/api/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId,
          orderId: order._id,
          clubId: activity.clubId,
          playerName: `${order.playerFirstName || ""} ${order.playerLastName || ""}`.trim(),
          parentName: `${order.parent1FirstName || ""} ${order.parent1LastName || ""}`.trim(),
          parentEmail: order.parent1Email || "",
          parentPhone: order.parent1Phone || "",
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSent(true);
    } catch {
      alert(tc("somethingWentWrong"));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">{t("requestSent")}</h3>
        <p className="text-sm text-gray-500">{t("requestSentDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">{t("sendRequest")}</h3>
      <p className="text-sm text-gray-500">{t("sendRequestDesc")}</p>
      <div>
        <label className="block text-xs text-gray-500 mb-1 text-start">{t("requestSubject")} *</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("requestSubjectPlaceholder")}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1 text-start">{t("requestMessage")} *</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("requestMessagePlaceholder")}
          rows={4}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={sending || !subject.trim() || !message.trim()}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {sending ? tc("saving") : t("submitRequest")}
        </button>
      </div>
    </div>
  );
}
