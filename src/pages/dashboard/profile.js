import { useState, useEffect, useRef } from "react";
import { useIntl } from "react-intl";
// useLocale is no longer imported from layout — use useIntl().locale

import { useRouter } from "next/router";
import DashboardLayout from "@/components/DashboardLayout";
export default function ClubProfilePage() {
  const intl = useIntl();
  // next-intl migration: use intl.formatMessage({ id: "payments.profile.key" })
  // next-intl migration: use intl.formatMessage({ id: "payments.common.key" })
  const { locale } = useIntl();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [language, setLanguage] = useState("en");
  const [supportEmail, setSupportEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    fetch("/api/club/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.club) {
          setProfile(d.club);
          setName(d.club.name || "");
          setLogoUrl(d.club.logoUrl || null);
          setLogoPreview(d.club.logoUrl || null);
          setLanguage(d.club.language || "en");
          setSupportEmail(d.club.supportEmail || "");
          setSmtpHost(d.club.smtpHost || "");
          setSmtpPort(String(d.club.smtpPort || 587));
          setSmtpEmail(d.club.smtpEmail || "");
          setSmtpPassword(d.club.smtpPassword || "");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setToast({ message: t("logoSizeError"), type: "error" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setLogoUrl(dataUrl);
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoUrl(null);
    setLogoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave() {
    if (!name.trim()) {
      setToast({ message: t("nameRequired"), type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/club/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), logoUrl, language, supportEmail, smtpHost, smtpPort, smtpEmail, smtpPassword }),
      });
      const data = await res.json();
      if (data.club) {
        setProfile(data.club);
        updateAppLocale(language);
        setToast({ message: t("savedSuccess"), type: "success" });
      } else {
        setToast({ message: data.error || t("saveFailed"), type: "error" });
      }
    } catch {
      setToast({ message: t("saveFailed"), type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{t("title")}</h2>

      <div className="bg-white rounded-xl border shadow-sm max-w-xl">
        {/* Logo Section */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-3">{t("clubLogo")}</label>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Club logo" className="w-full h-full object-contain" />
              ) : (
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={handleLogoUpload} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                {logoPreview ? t("changeLogo") : t("uploadLogo")}
              </button>
              {logoPreview && (
                <button onClick={removeLogo}
                  className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition">
                  {t("removeLogo")}
                </button>
              )}
              <p className="text-xs text-gray-400">{t("logoHint")}</p>
            </div>
          </div>
        </div>

        {/* Name Section */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("clubName")}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={t("clubNamePlaceholder")} />
        </div>

        {/* Username (read-only) */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("username")}</label>
          <input type="text" value={profile?.username || ""} disabled
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
          <p className="text-xs text-gray-400 mt-1">{t("usernameHint")}</p>
        </div>

        {/* Language Section */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("language")}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="en">{t("langEnglish")}</option>
            <option value="he">{t("langHebrew")}</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">{t("languageHint")}</p>
        </div>

        {/* Support Email */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("supportEmail")}</label>
          <p className="text-xs text-gray-400 mb-2">{t("supportEmailHint")}</p>
          <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@club.com"
            className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        {/* Email Settings */}
        <div className="p-6 border-b">
          <label className="block text-sm font-medium text-gray-700 mb-3">{t("emailSettings")}</label>
          <p className="text-xs text-gray-400 mb-4">{t("emailSettingsHint")}</p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">{t("smtpHost")}</label>
                <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("smtpPort")}</label>
                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("smtpEmailLabel")}</label>
              <input type="email" value={smtpEmail} onChange={(e) => setSmtpEmail(e.target.value)}
                placeholder="club@gmail.com"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("smtpPasswordLabel")}</label>
              <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={t("smtpPasswordPlaceholder")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              <p className="text-xs text-gray-400 mt-1">{t("smtpPasswordHint")}</p>
            </div>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-1">{t("gmailHintTitle")}</p>
              <p className="text-xs text-amber-700">{t("gmailHintBody")}</p>
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-800 font-medium underline hover:text-amber-900 mt-1">
                {t("gmailHintLink")}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
              </a>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="p-6 flex items-center justify-between">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? tc("saving") : t("saveProfile")}
          </button>
          {logoPreview && (
            <div className="text-xs text-gray-400">{t("logoVisibility")}</div>
          )}
        </div>
      </div>

      {/* Preview */}
      {logoPreview && (
        <div className="mt-8 max-w-xl">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("previewTitle")}</h3>
          <div className="bg-gray-50 rounded-xl border p-8 text-center">
            <img src={logoPreview} alt="Preview" className="h-14 w-auto mx-auto mb-2 object-contain" />
            <p className="text-lg font-bold text-gray-900">{name || t("previewClubName")}</p>
            <p className="text-sm text-gray-500 mt-1">{t("previewActivityTitle")}</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

ClubProfilePage.getLayout = (page) => <DashboardLayout>{page}</DashboardLayout>;
