"use client";

import { useState, useEffect, use } from "react";
import { useSearchParams } from "next/navigation";

function centsToDisplay(c) { return "$" + ((c || 0) / 100).toFixed(2); }

export default function RegistrationSuccessPage({ params }) {
  const resolvedParams = use(params);
  const activityId = resolvedParams.activityId;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/register/${activityId}${sessionId ? `?session_id=${sessionId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activityId, sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const activity = data?.activity;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Registration Complete!</h1>
        <p className="text-gray-600 mb-6">
          Your registration for <strong>{activity?.title || "the activity"}</strong> has been submitted successfully.
        </p>

        {activity?.hasPayment && (
          <div className="bg-green-50 rounded-lg p-4 mb-6 text-sm text-green-800">
            Payment received. A confirmation email has been sent to your email address.
          </div>
        )}

        {activity?.afterRegistrationMessage && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 mb-6 text-sm text-gray-700 text-left prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: activity.afterRegistrationMessage }} />
        )}

        <div className="text-sm text-gray-500 space-y-1">
          <p>{activity?.clubName || ""}</p>
          {activity?.season && <p>Season: {activity.season}</p>}
        </div>
      </div>
    </div>
  );
}
