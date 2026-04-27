import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const PASSWORD_MASK = "••••••••";

export default function EditClub() {
  const router = useRouter();
  const { id: clubId } = router.query;

  const [club, setClub] = useState(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(true);

  // Profile form state
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [language, setLanguage] = useState("en");
  const [supportEmail, setSupportEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [maxInstallments, setMaxInstallments] = useState("10");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const fileRef = useRef(null);

  // Stripe form state
  const [hasDirectStripeAccess, setHasDirectStripeAccess] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripeSaving, setStripeSaving] = useState(false);

  const isLocked = club?.onboardingComplete && !club?.hasDirectStripeAccess;

  useEffect(() => {
    fetchClub();
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileMessage) return;
    const t = setTimeout(() => setProfileMessage(null), 3000);
    return () => clearTimeout(t);
  }, [profileMessage]);

  async function fetchClub() {
    setFetching(true);
    const res = await fetch(`/api/admin/clubs/${clubId}`);
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setFetching(false);
      return;
    }
    applyClubToState(data.club);
    setFetching(false);
  }

  function applyClubToState(c) {
    setClub(c);
    setName(c.name || "");
    setLogoUrl(c.logoUrl || null);
    setLogoPreview(c.logoUrl || null);
    setLanguage(c.language || "en");
    setSupportEmail(c.supportEmail || "");
    setSmtpHost(c.smtpHost || "");
    setSmtpPort(String(c.smtpPort || 587));
    setSmtpEmail(c.smtpEmail || "");
    setSmtpPassword(c.smtpPassword || "");
    setMaxInstallments(String(c.maxPaymentRequestInstallments || 10));
    setHasDirectStripeAccess(!!c.hasDirectStripeAccess);
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({ type: "error", text: "Logo must be smaller than 2 MB" });
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

  async function handleProfileSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setProfileMessage({ type: "error", text: "Club name is required" });
      return;
    }
    setProfileSaving(true);
    setProfileMessage(null);

    const payload = {
      name: name.trim(),
      logoUrl,
      language,
      supportEmail,
      smtpHost,
      smtpPort,
      smtpEmail,
      maxPaymentRequestInstallments: parseInt(maxInstallments, 10) || 10,
    };
    if (smtpPassword && smtpPassword !== PASSWORD_MASK) {
      payload.smtpPassword = smtpPassword;
    }

    try {
      const res = await fetch(`/api/admin/clubs/${clubId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMessage({ type: "error", text: data.error || "Failed to update profile" });
      } else {
        applyClubToState(data.club);
        setProfileMessage({ type: "success", text: "Profile saved" });
      }
    } catch {
      setProfileMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleStripeSave(e) {
    e.preventDefault();
    setError("");
    setStripeSaving(true);

    const payload = { hasDirectStripeAccess };
    if (hasDirectStripeAccess && stripeSecretKey) {
      payload.stripeSecretKey = stripeSecretKey;
    }
    if (hasDirectStripeAccess && stripeWebhookSecret) {
      payload.stripeWebhookSecret = stripeWebhookSecret;
    }

    try {
      const res = await fetch(`/api/admin/clubs/${clubId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update club");
        setStripeSaving(false);
        return;
      }
      applyClubToState(data.club);
      setStripeSecretKey("");
      setStripeWebhookSecret("");
      router.push("/admin");
    } catch {
      setError("Failed to update club");
      setStripeSaving(false);
    }
  }

  if (fetching) {
    return (
      <div className="max-w-2xl">
        <p className="text-gray-500">Loading club...</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="max-w-2xl">
        <p className="text-red-600">{error || "Club not found"}</p>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          &larr; Back to Clubs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Clubs
        </Link>
      </div>

      {/* Club Profile */}
      <form onSubmit={handleProfileSave} className="bg-white rounded-xl border border-gray-200 divide-y">
        <div className="p-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Club Profile</h2>
          <span className="text-xs font-mono text-gray-400">{club.username}</span>
        </div>

        {/* Logo */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Club Logo</label>
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
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                {logoPreview ? "Change Logo" : "Upload Logo"}
              </button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="px-4 py-2 bg-white border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
                >
                  Remove Logo
                </button>
              )}
              <p className="text-xs text-gray-400">PNG, JPG, GIF, WebP, or SVG. Max 2 MB.</p>
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="p-6">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Club Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
          />
        </div>

        {/* Username (read-only) */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            type="text"
            value={club.username || ""}
            disabled
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>
        </div>

        {/* Language */}
        <div className="p-6">
          <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
            Language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
          >
            <option value="en">English</option>
            <option value="he">Hebrew</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">Default language for emails sent by this club.</p>
        </div>

        {/* Support Email */}
        <div className="p-6">
          <label htmlFor="supportEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Support Email
          </label>
          <p className="text-xs text-gray-400 mb-2">Reply-to address shown on emails sent by this club.</p>
          <input
            id="supportEmail"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@club.com"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
          />
        </div>

        {/* SMTP */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Email (SMTP) Settings</label>
          <p className="text-xs text-gray-400 mb-4">Outbound mail server used by this club. Leave password blank to keep the existing one.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Port</label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SMTP Email</label>
              <input
                type="email"
                value={smtpEmail}
                onChange={(e) => setSmtpEmail(e.target.value)}
                placeholder="club@gmail.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SMTP Password</label>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={club.hasSmtpPassword ? PASSWORD_MASK : "App password"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {club.hasSmtpPassword ? "A password is already stored. Leave the dots untouched to keep it." : "App-specific password (e.g. Gmail app password)."}
              </p>
            </div>
          </div>
        </div>

        {/* Max installments */}
        <div className="p-6">
          <label htmlFor="maxInstallments" className="block text-sm font-medium text-gray-700 mb-1">
            Max Payment Request Installments
          </label>
          <input
            id="maxInstallments"
            type="number"
            min={1}
            max={10}
            value={maxInstallments}
            onChange={(e) => setMaxInstallments(e.target.value)}
            className="w-32 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-1">Upper bound (1–10) for payment-request installment plans.</p>
        </div>

        {/* Save profile */}
        <div className="p-6 flex items-center justify-between">
          <button
            type="submit"
            disabled={profileSaving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {profileSaving ? "Saving..." : "Save Profile"}
          </button>
          {profileMessage && (
            <span className={`text-sm font-medium ${profileMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {profileMessage.text}
            </span>
          )}
        </div>
      </form>

      {/* Stripe Access */}
      <form onSubmit={handleStripeSave} className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Stripe Access</h2>
          {club.stripeAccountId && !club.hasDirectStripeAccess && (
            <span className="text-xs font-mono text-gray-400">{club.stripeAccountId}</span>
          )}
        </div>

        {isLocked && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">Stripe status is locked</p>
                <p className="text-xs text-green-600">
                  This club completed Connect onboarding. Stripe access type cannot be changed.
                </p>
              </div>
            </div>
          </div>
        )}

        <label className={`flex items-center gap-3 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            checked={hasDirectStripeAccess}
            onChange={(e) => {
              if (isLocked) return;
              setHasDirectStripeAccess(e.target.checked);
              if (!e.target.checked) {
                setStripeSecretKey("");
                setStripeWebhookSecret("");
              }
            }}
            disabled={isLocked}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Has Direct Stripe Access</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-7">
          {isLocked
            ? "Locked — this club completed Connect onboarding."
            : "Enable if this club has their own Stripe account with a secret key (not via Connect)."}
        </p>

        {!isLocked && hasDirectStripeAccess && (
          <div className="mt-3">
            <label htmlFor="stripeKey" className="block text-sm font-medium text-gray-700 mb-1">
              Stripe Secret Key
              {club.hasDirectStripeAccess && club.hasStripeKey && (
                <span className="text-xs text-gray-400 font-normal ml-2">
                  (leave blank to keep current key)
                </span>
              )}
            </label>
            <input
              id="stripeKey"
              type="password"
              value={stripeSecretKey}
              onChange={(e) => setStripeSecretKey(e.target.value)}
              required={!club.hasDirectStripeAccess || !club.hasStripeKey}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 font-mono text-sm"
              placeholder={club.hasDirectStripeAccess && club.hasStripeKey ? PASSWORD_MASK : "sk_test_... or sk_live_..."}
            />

            <div className="mt-3">
              <label htmlFor="stripeWebhookSecret" className="block text-sm font-medium text-gray-700 mb-1">
                Stripe Webhook Signing Secret
                {club.hasWebhookSecret && (
                  <span className="text-xs text-gray-400 font-normal ml-2">
                    (leave blank to keep current secret)
                  </span>
                )}
              </label>
              <input
                id="stripeWebhookSecret"
                type="password"
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 font-mono text-sm"
                placeholder={club.hasWebhookSecret ? PASSWORD_MASK : "whsec_..."}
              />
              <p className="text-xs text-gray-500 mt-1">
                From this club&apos;s Stripe Dashboard → Developers → Webhooks → endpoint for{" "}
                <code className="bg-gray-100 px-1 rounded">payments.easycoach.club/api/stripe/webhook</code> → Signing secret.
              </p>
            </div>
          </div>
        )}

        {!isLocked && !hasDirectStripeAccess && club.hasDirectStripeAccess && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <p className="text-xs text-yellow-700">
              Switching to Connect will remove the stored secret key and create a new Stripe Express account.
              The club will need to complete Connect onboarding.
            </p>
          </div>
        )}

        {!isLocked && hasDirectStripeAccess && !club.hasDirectStripeAccess && club.stripeAccountId && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <p className="text-xs text-yellow-700">
              Switching to Direct Access will delete the pending Stripe Express account ({club.stripeAccountId}).
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={stripeSaving || isLocked}
          className="mt-6 w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {stripeSaving ? "Saving..." : "Save Stripe Settings"}
        </button>
      </form>

      {/* Tenancy info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Tenancy</h3>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4">
          <dt className="text-gray-500">Migration status</dt>
          <dd className="font-mono">{club.migrationStatus || "legacy"}</dd>
          <dt className="text-gray-500">DB name</dt>
          <dd className="font-mono">{club.dbName || `club_${clubId}`}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{club.createdAt ? new Date(club.createdAt).toLocaleString() : "—"}</dd>
          <dt className="text-gray-500">Updated</dt>
          <dd>{club.updatedAt ? new Date(club.updatedAt).toLocaleString() : "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
