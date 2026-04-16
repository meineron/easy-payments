"use client";

import { useState, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useRouter } from "next/navigation";
import { IntlProvider, useTranslations } from "next-intl";
import { getMessages } from "@/lib/i18n";

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function CheckIcon({ pass }) {
  if (pass) {
    return (
      <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  );
}

function SetPasswordForm() {
  const t = useTranslations("setPassword");
  const router = useRouter();
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const rules = useMemo(() => ({
    minLength: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^a-zA-Z0-9]/.test(newPassword),
  }), [newPassword]);

  const allRulesPass = rules.minLength && rules.uppercase && rules.lowercase && rules.number && rules.special;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = currentPassword && allRulesPass && passwordsMatch && !loading;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!canSubmit) return;
    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 403 ? t("incorrectCurrent") : (data.error || t("failed")));
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => signOut({ callbackUrl: "/" }), 1500);
    } catch {
      setError(t("failed"));
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t("subtitle")}</p>
          </div>

          {success ? (
            <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200 text-center">
              {t("success")}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("currentPassword")}</label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showCurrent} />
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("newPassword")}</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showNew} />
                  </button>
                </div>

                {/* Rules */}
                <div className="mt-3 space-y-1.5">
                  {[
                    { key: "minLength", label: t("ruleMinLength") },
                    { key: "uppercase", label: t("ruleUppercase") },
                    { key: "lowercase", label: t("ruleLowercase") },
                    { key: "number", label: t("ruleNumber") },
                    { key: "special", label: t("ruleSpecial") },
                  ].map((rule) => (
                    <div key={rule.key} className="flex items-center gap-2">
                      <CheckIcon pass={rules[rule.key]} />
                      <span className={`text-xs ${rules[rule.key] ? "text-green-600" : "text-gray-400"}`}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("confirmPassword")}</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 pe-10 ${
                      confirmPassword && !passwordsMatch ? "border-red-300" : "border-gray-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-500 mt-1">{t("passwordMismatch")}</p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t("setting") : t("setPassword")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  const messages = getMessages("en");
  return (
    <SessionProvider>
      <IntlProvider locale="en" messages={messages}>
        <SetPasswordForm />
      </IntlProvider>
    </SessionProvider>
  );
}
