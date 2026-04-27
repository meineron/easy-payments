import { useState } from "react";
import { useDispatch } from "react-redux";
import dynamic from "next/dynamic";
import { pushToast } from "@/store/slices/uiSlice";
import {
  useGetRegistrationRequestsQuery,
  useUpdateRegistrationRequestMutation,
} from "@/features/activities/services/activitiesApi";

// Loaded on demand — only rendered when the user clicks "Respond".
const RespondModal = dynamic(
  () => import("@/features/activities/components/RespondModal"),
  { ssr: false }
);

export default function RequestsTab({ activityId, tc, td }) {
  const dispatch = useDispatch();
  const { data: requests = [], isLoading } = useGetRegistrationRequestsQuery(activityId, { skip: !activityId });
  const [updateRequest] = useUpdateRegistrationRequestMutation();
  const [respondTo, setRespondTo] = useState(null);

  async function updateStatus(reqId, status) {
    try {
      await updateRequest({ requestId: reqId, status }).unwrap();
    } catch (e) {
      dispatch(pushToast({ message: tc("somethingWentWrong"), type: "error" }));
    }
  }

  if (isLoading) return <p className="text-gray-500 text-center py-8">{tc("loading")}</p>;

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">{td("requestsTab", { count: requests.length })}</h3>

      {requests.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">{td("noRequests")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start">
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestFrom")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestPlayer")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestSubject")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestStatus")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{td("requestDate")}</th>
                <th className="px-3 py-2 font-medium text-gray-600">{tc("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{req.parentName}</div>
                    <div className="text-xs text-gray-400">{req.parentEmail}</div>
                    {req.parentPhone && <div className="text-xs text-gray-400">{req.parentPhone}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{req.playerName}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{req.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{req.message}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      req.status === "open" ? "bg-yellow-100 text-yellow-700" :
                      req.status === "responded" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {td(`request${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(req.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRespondTo(req)}
                        className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded font-medium hover:bg-blue-100"
                      >
                        {td("respondToRequest")}
                      </button>
                      {req.status === "open" && (
                        <button
                          onClick={() => updateStatus(req._id, "responded")}
                          className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded font-medium hover:bg-gray-100"
                        >
                          {td("markResponded")}
                        </button>
                      )}
                      {req.status !== "closed" && (
                        <button
                          onClick={() => updateStatus(req._id, "closed")}
                          className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded font-medium hover:bg-gray-100"
                        >
                          {td("markClosed")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {respondTo && (
        <RespondModal
          request={respondTo}
          onClose={() => setRespondTo(null)}
          onSent={(msg) => {
            updateStatus(respondTo._id, "responded");
            setRespondTo(null);
            dispatch(pushToast({ message: msg, type: "success" }));
          }}
          onError={(msg) => dispatch(pushToast({ message: msg, type: "error" }))}
          tc={tc}
          td={td}
        />
      )}
    </div>
  );
}
