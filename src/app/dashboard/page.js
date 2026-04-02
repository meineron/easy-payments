"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ClubDashboard() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    const shouldCheck =
      searchParams.get("onboarding") === "complete" ||
      searchParams.get("refresh") === "true";

    if (shouldCheck && !hasChecked.current && !onboardingComplete) {
      hasChecked.current = true;
      setCheckingStatus(true);

      fetch("/api/stripe/account-status")
        .then((res) => res.json())
        .then((data) => {
          if (data.onboardingComplete) {
            setOnboardingComplete(true);
          }
          setCheckingStatus(false);
          router.replace("/dashboard");
        })
        .catch((err) => {
          console.error("Failed to check status:", err);
          setCheckingStatus(false);
        });
    }
  }, [searchParams, onboardingComplete, router]);

  useEffect(() => {
    if (session?.user?.onboardingComplete) {
      setOnboardingComplete(true);
    }
  }, [session]);

  async function handleOnboarding() {
    setLoading(true);
    const res = await fetch("/api/stripe/create-account-link", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    setLoading(false);
  }

  async function handlePayment() {
    setLoading(true);
    const res = await fetch("/api/stripe/create-checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
    setLoading(false);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h2>

      {session?.user?.hasDirectStripeAccess ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Direct Stripe Access
          </h3>
          <p className="text-gray-500 mb-4">
            Your Stripe account is connected with a dedicated secret key. Use the Customer Data and Payment Links tabs to manage your Stripe data.
          </p>
        </div>
      ) : !onboardingComplete ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Connect Your Stripe Account
          </h3>
          <p className="text-gray-500 mb-6">
            To start accepting payments, you need to complete Stripe onboarding.
            This connects your bank account so you can receive payouts.
          </p>

          {checkingStatus ? (
            <p className="text-blue-600 text-sm">Checking your onboarding status...</p>
          ) : (
            <button
              onClick={handleOnboarding}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? "Redirecting..." : "Start Stripe Onboarding"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Stripe Account Connected
            </h3>
            <p className="text-gray-500 mb-6">
              Your account is set up and ready to accept payments.
            </p>

            <button
              onClick={handlePayment}
              disabled={loading}
              className="bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-bold hover:bg-green-700 transition disabled:opacity-50 shadow-lg"
            >
              {loading ? "Redirecting..." : "Pay $10.00"}
            </button>
            <p className="text-xs text-gray-400 mt-3">
              $1.00 platform fee included
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
