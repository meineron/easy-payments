/**
 * ActivitiesList — embeddable activities list.
 * Works in both standalone Next.js and pl-football-web.
 * Navigation is handled via onSelect prop (or PaymentsHostContext).
 */
import { useIntl } from "react-intl";
import { useGetActivitiesQuery } from "@/features/activities/services/activitiesApi";

export default function ActivitiesList({ onSelect }) {
  const intl = useIntl();
  const t = (id, values) => intl.formatMessage({ id: `payments.activities.${id}` }, values);

  const { data: activities = [], isLoading, isError, refetch } = useGetActivitiesQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 mb-3">Failed to load activities.</p>
        <button onClick={refetch} className="text-sm text-blue-600 underline">Retry</button>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium mb-1">{t("noActivities") || "No activities yet"}</p>
        <p className="text-sm">{t("createFirst") || "Create your first activity to get started."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const status = activity.status || "draft";
        const statusColor =
          status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700";

        return (
          <div
            key={activity._id}
            onClick={() => onSelect?.(activity._id)}
            className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between hover:border-blue-300 hover:shadow-sm cursor-pointer transition"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 truncate">{activity.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                  {status}
                </span>
              </div>
              {activity.season && (
                <p className="text-sm text-gray-500 mt-0.5">{activity.season}</p>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
