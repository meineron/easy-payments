/**
 * Unique React list key for one entry in Activity.teams[].
 * Handles missing teamId and duplicate team references.
 */
export function activityTeamSlotKey(slot, index) {
  const raw = slot?.teamId;
  const id = raw != null && raw !== "" ? String(raw) : "";
  return id ? `act-team-${index}-${id}` : `act-team-${index}-empty`;
}
