"use client";

import { activityTeamSlotKey } from "@/lib/activity-team-keys";
import { useGetActivityOrdersQuery } from "@/features/activities/services/activitiesApi";
import { centsToDisplay } from "@/features/activities/utils/formatting";

export default function ActivityTeamsTab({ activityId, activity, tc, td }) {
  const { data, isLoading } = useGetActivityOrdersQuery(activityId, { skip: !activityId });
  const orders = data?.orders ?? [];
  const expectedPlayers = data?.expectedPlayers ?? [];

  const activityTeams = (activity?.teams || []).map((row, slotIndex) => ({
    slotIndex,
    teamId: row.teamId?._id || row.teamId || null,
    name: row.teamId?.name || "Unknown",
    season: row.teamId?.season || "",
    gender: row.teamId?.gender || "",
  }));

  function teamStats(teamId) {
    const teamOrders = orders.filter((o) => {
      const oid = o.teamId?._id || o.teamId;
      return oid === teamId;
    });
    const teamExpected = expectedPlayers.filter((ep) => {
      const eid = ep.teamId?._id || ep.teamId;
      return String(eid) === String(teamId);
    });
    const members = teamOrders.length + teamExpected.length;
    const registered = teamOrders.length;
    let expectedRevenue = 0, collected = 0, fullyPaid = 0, partialPaid = 0;
    teamOrders.forEach((o) => {
      const total = o.totalCostCents || 0;
      expectedRevenue += total;
      collected += o.paidCents || 0;
      if (o.paidCents >= total && total > 0) fullyPaid++;
      else if (o.paidCents > 0) partialPaid++;
    });
    return { members, registered, expectedCount: teamExpected.length, expectedRevenue, collected, fullyPaid, partialPaid };
  }

  if (isLoading) return <p className="text-gray-500 py-4 text-center text-sm">{tc("loading")}</p>;

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4">{td("teamsCount", { count: activityTeams.length })}</h3>
      {activityTeams.length === 0 ? <p className="text-gray-400 text-sm p-8 bg-gray-50 rounded-lg text-center">{td("noTeamsInActivity")}</p> : (
        <div className="space-y-3">
          {activityTeams.map((team) => {
            const s = teamStats(team.teamId);
            return (
              <div key={activityTeamSlotKey(team, team.slotIndex)} className="border rounded-lg p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">{team.name}</span>
                    {team.gender && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.gender}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{team.season}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{td("playerCount", { count: s.members })}</span>
                    {s.expectedCount > 0 && <span className="text-xs text-orange-600">({s.registered} {td("registered")} · {s.expectedCount} {td("expected")})</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("expectedRevenue")}</p>
                    <p className="text-lg font-bold text-gray-900">${centsToDisplay(s.expectedRevenue)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("collected")}</p>
                    <p className="text-lg font-bold text-green-700">${centsToDisplay(s.collected)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("totalUncollected")}</p>
                    <p className="text-lg font-bold text-red-600">${centsToDisplay(s.expectedRevenue - s.collected)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("fullyPaid")}</p>
                    <p className="text-lg font-bold text-blue-700">{s.fullyPaid}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{td("partiallyPaid")}</p>
                    <p className="text-lg font-bold text-yellow-700">{s.partialPaid}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
