"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function EditClub() {
  const router = useRouter();
  const params = useParams();
  const clubId = params.id;

  const [club, setClub] = useState(null);
  const [name, setName] = useState("");
  const [hasDirectStripeAccess, setHasDirectStripeAccess] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const isLocked = club?.onboardingComplete && !club?.hasDirectStripeAccess;

  useEffect(() => {
    fetchClub();
  }, [clubId]);

  async function fetchClub() {
    const res = await fetch(`/api/admin/clubs/${clubId}`);
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setFetching(false);
      return;
    }
    setClub(data.club);
    setName(data.club.name);
    setHasDirectStripeAccess(data.club.hasDirectStripeAccess);
    setFetching(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = { name, hasDirectStripeAccess };
    if (hasDirectStripeAccess && stripeSecretKey) {
      payload.stripeSecretKey = stripeSecretKey;
    }

    const res = await fetch(`/api/admin/clubs/${clubId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to update club");
      setLoading(false);
      return;
    }

    router.push("/admin");
  }

  if (fetching) {
    return (
      <div className="max-w-lg">
        <p className="text-gray-500">Loading club...</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="max-w-lg">
        <p className="text-red-600">{error || "Club not found"}</p>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          &larr; Back to Clubs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Clubs
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Club</h2>
          <span className="text-xs font-mono text-gray-400">{club.username}</span>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
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

          <div className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">Username:</span> {club.username}
            <span className="text-xs text-gray-400 ml-2">(cannot be changed)</span>
          </div>

          <div className="border-t border-gray-200 pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Stripe Access</span>
              {club.stripeAccountId && !club.hasDirectStripeAccess && (
                <span className="text-xs font-mono text-gray-400">
                  {club.stripeAccountId}
                </span>
              )}
            </div>

            <label className={`flex items-center gap-3 ${isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={hasDirectStripeAccess}
                onChange={(e) => {
                  if (isLocked) return;
                  setHasDirectStripeAccess(e.target.checked);
                  if (!e.target.checked) setStripeSecretKey("");
                }}
                disabled={isLocked}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Has Direct Stripe Access
              </span>
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
                  placeholder={club.hasDirectStripeAccess && club.hasStripeKey ? "••••••••••••••••" : "sk_test_... or sk_live_..."}
                />
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
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
