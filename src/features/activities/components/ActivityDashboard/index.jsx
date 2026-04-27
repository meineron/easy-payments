/**
 * ActivityDashboard — embeddable shell component.
 *
 * Works in both:
 *  - Standalone Next.js (pages/dashboard/activities/[id].js)
 *  - pl-football-web (via EasyPaymentsV2, receives activityId as prop)
 *
 * Routing is injected via PaymentsHostContext (not next/router directly).
 */
import { useState } from "react";
import { useIntl } from "react-intl";
import Tabs from "@/shared/components/Tabs";
import { useGetActivityQuery } from "@/features/activities/services/activitiesApi";
import ParticipantsTab from "@/features/activities/components/ParticipantsTab";
import ActivityTeamsTab from "@/features/activities/components/ActivityTeamsTab";
import LogsTab from "@/features/activities/components/LogsTab";
import RequestsTab from "@/features/activities/components/RequestsTab";
import { usePaymentsRouter } from "@/shared/context/PaymentsHostContext";

export default function ActivityDashboard({ activityId, onBack }) {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.activities.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const td = (id, values) => intl.formatMessage({ id: `payments.activityDetail.${id}` }, values);

  const router = usePaymentsRouter();

  const [currentTab, setCurrentTab] = useState(
    () => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null) || "participants"
  );

  const { data: activity, isLoading, isError } = useGetActivityQuery(activityId, {
    skip: !activityId,
  });

  function handleTabChange(tab) {
    setCurrentTab(tab);
  }

  if (isError) {
    if (onBack) onBack();
    return null;
  }

  if (isLoading || !activity) {
    return <p className="text-gray-500 py-8 text-center">{tc("loading") || "Loading..."}</p>;
  }

  const status = activity?.status;
  const statusPillClasses =
    status === "published"
      ? "bg-green-100 text-green-700"
      : "bg-yellow-100 text-yellow-700";
  const statusLabel =
    status === "published"
      ? (t("published") || "Published")
      : (!status || status === "draft" ? (t("draft") || "Draft") : status);

  const tabs = [
    { value: "participants", label: td("participants") || "Participants" },
    { value: "teams", label: td("teams") || "Teams" },
    { value: "requests", label: td("requests") || "Requests" },
    { value: "logs", label: td("logs") || "Logs" },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ← {t("title") || "Activities"}
            </button>
          )}
          <h2 className="text-xl font-bold text-gray-900">{activity?.title || "Activity"}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusPillClasses}`}>
            {statusLabel}
          </span>
          {activity?.season && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {activity.season}
            </span>
          )}
        </div>
        <router.Link
          href={`/dashboard/activities/${activityId}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 text-center w-full sm:w-auto"
        >
          {td("editActivity") || "Edit Activity"}
        </router.Link>
      </div>

      <Tabs tabs={tabs} value={currentTab} onChange={handleTabChange} />

      <div className="mt-4">
        {currentTab === "participants" && <ParticipantsTab activityId={activityId} activity={activity} />}
        {currentTab === "teams" && <ActivityTeamsTab activityId={activityId} activity={activity} />}
        {currentTab === "requests" && <RequestsTab activityId={activityId} activity={activity} />}
        {currentTab === "logs" && <LogsTab activityId={activityId} activity={activity} />}
      </div>
    </div>
  );
}
