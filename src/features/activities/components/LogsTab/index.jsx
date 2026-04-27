import { useState } from "react";
import { useGetActivityLogsQuery } from "@/features/activities/services/activitiesApi";
import { fmtDateTime } from "@/features/activities/utils/formatting";

export default function LogsTab({ activityId, tc, td }) {
  const { data: logs = [], isLoading } = useGetActivityLogsQuery(activityId, { skip: !activityId });
  const [filter, setFilter] = useState("all");

  if (isLoading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  const filtered = logs.filter((log) => {
    if (filter === "all") return true;
    if (filter === "submissions") return log.field === "registration_submitted";
    if (filter === "comments") return log.field === "comment";
    if (filter === "changes") return log.field !== "registration_submitted" && log.field !== "comment";
    return true;
  });

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">{td("activityLogs", { count: logs.length })}</h3>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { id: "all", label: td("filterAll") },
          { id: "submissions", label: td("filterSubmissions") },
          { id: "comments", label: td("filterComments") },
          { id: "changes", label: td("filterChanges") },
        ].map((opt) => (
          <button key={opt.id} onClick={() => setFilter(opt.id)}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition ${
              filter === opt.id
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{td("noChangesRecordedYet")}</p> : (
        <div className="space-y-2">
          {filtered.map((log) => {
            const isComment = log.field === "comment";
            const isSubmission = log.field === "registration_submitted";
            return (
              <div key={log._id} className={`border rounded-lg p-3 text-sm ${
                isComment ? "border-blue-200 bg-blue-50/40" :
                isSubmission ? "border-green-200 bg-green-50/40" : ""
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 flex items-center gap-2">
                    {isComment && <span aria-hidden="true">{"\u{1F4AC}"}</span>}
                    {isSubmission && <span aria-hidden="true">{"\u2709"}</span>}
                    {isComment ? td("logComment") :
                      isSubmission ? td("logRegistrationSubmitted") :
                      log.description}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDateTime(log.createdAt)}</span>
                </div>
                {isComment && log.description && (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-1">{log.description}</p>
                )}
                <div className="text-xs text-gray-500">
                  by <span className="font-medium">{log.userName}</span>
                  {!isComment && !isSubmission && (
                    <>
                      {" · Field: "}<span className="font-mono">{log.field}</span>
                      {log.previousValue && log.previousValue !== "undefined" && <> · Prev: <span className="text-red-600">{log.previousValue.slice(0, 60)}</span></>}
                      {log.newValue && log.newValue !== "undefined" && log.newValue !== "created" && <> · New: <span className="text-green-600">{log.newValue.slice(0, 60)}</span></>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
