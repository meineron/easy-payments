"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "../layout";

export default function ClubProfilePage() {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const { setLocale: updateAppLocale } = useLocale();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [language, setLanguage] = useState("en");
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
        body: JSON.stringify({ name: name.trim(), logoUrl, language }),
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
