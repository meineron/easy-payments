"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CreateClub() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasDirectStripeAccess, setHasDirectStripeAccess] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = { name, username, password, hasDirectStripeAccess };
    if (hasDirectStripeAccess) {
      payload.stripeSecretKey = stripeSecretKey;
    }

    const res = await fetch("/api/admin/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create club");
      setLoading(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">
          &larr; Back to Clubs
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Club</h2>

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
              placeholder="e.g. FC Barcelona Academy"
            />
          </div>

          <div>
            <label htmlFor="club-username" className="block text-sm font-medium text-gray-700 mb-1">
              Username (for login)
            </label>
            <input
              id="club-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
              placeholder="e.g. fcbarcelona"
            />
          </div>

          <div>
            <label htmlFor="club-password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="club-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
              placeholder="Min 6 characters"
            />
          </div>

          <div className="border-t border-gray-200 pt-4 mt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDirectStripeAccess}
                onChange={(e) => {
                  setHasDirectStripeAccess(e.target.checked);
                  if (!e.target.checked) setStripeSecretKey("");
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Has Direct Stripe Access
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-7">
              Enable if this club has their own Stripe account with a secret key (not via Connect).
            </p>

            {hasDirectStripeAccess && (
              <div className="mt-3">
                <label htmlFor="stripeKey" className="block text-sm font-medium text-gray-700 mb-1">
                  Stripe Secret Key
                </label>
                <input
                  id="stripeKey"
                  type="password"
                  value={stripeSecretKey}
                  onChange={(e) => setStripeSecretKey(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 font-mono text-sm"
                  placeholder="sk_test_... or sk_live_..."
                />
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
            {loading ? "Creating..." : "Create Club"}
          </button>
        </form>
      </div>
    </div>
  );
}
