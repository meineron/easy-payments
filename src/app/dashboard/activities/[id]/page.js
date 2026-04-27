import { use } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useIntl } from "react-intl";
import Tabs, { TabPanel } from "@/shared/components/Tabs";
import { useGetActivityQuery } from "@/features/activities/services/activitiesApi";
import ParticipantsTab from "@/features/activities/components/ParticipantsTab";
import ActivityTeamsTab from "@/features/activities/components/ActivityTeamsTab";
import LogsTab from "@/features/activities/components/LogsTab";
import RequestsTab from "@/features/activities/components/RequestsTab";

export default function ActivityPage() {
  const intl = useIntl();
  const { id: activityId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = (id, values) => intl.formatMessage({ id: `payments.activities.${id}` }, values);
  const tc = (id, values) => intl.formatMessage({ id: `payments.common.${id}` }, values);
  const td = (id, values) => intl.formatMessage({ id: `payments.activityDetail.${id}` }, values);

  const { data: activity, isLoading, isError } = useGetActivityQuery(activityId, {
    skip: !activityId,
  });

  if (isError) {
    router.push("/dashboard/activities");
    return null;
  }

  if (isLoading || !activity) {
    return <p className="text-gray-500 py-8 text-center">{tc("loading")}</p>;
  }

  const tabs = [
    { value: "participants", label: td("participants") },
    { value: "teams", label: td("teams") },
    { value: "requests", label: td("requests") },
    { value: "logs", label: td("logs") },
  ];

  const currentTab = searchParams.get("tab") || "participants";
  const status = activity?.status;
  const statusPillClasses =
    status === "published"
      ? "bg-green-100 text-green-700"
      : "bg-yellow-100 text-yellow-700";
  const statusLabel =
    status === "published" ? t("published") : !status || status === "draft" ? t("draft") : status;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push("/dashboard/activities")}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← {t("title")}
          </button>
          <h2 className="text-xl font-bold text-gray-900">{activity?.title || "Activity"}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusPillClasses}`}>
            {statusLabel}
          </span>
          {activity?.season && (
            <span
              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
              title={t("season")}
            >
              {activity.season}
            </span>
          )}
        </div>
        <Link
          href={`/dashboard/activities/${activityId}/edit`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 text-center w-full sm:w-auto"
        >
          {td("editActivity")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <Tabs tabs={tabs} paramKey="tab" />
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border p-3 sm:p-6">
        <TabPanel value="participants" active={currentTab}>
          <ParticipantsTab activityId={activityId} activity={activity} tc={tc} td={td} />
        </TabPanel>
        <TabPanel value="teams" active={currentTab}>
          <ActivityTeamsTab activityId={activityId} activity={activity} tc={tc} td={td} />
        </TabPanel>
        <TabPanel value="requests" active={currentTab}>
          <RequestsTab activityId={activityId} tc={tc} td={td} />
        </TabPanel>
        <TabPanel value="logs" active={currentTab}>
          <LogsTab activityId={activityId} tc={tc} td={td} />
        </TabPanel>
      </div>
    </div>
  );
}
