import dbConnect from "@/lib/mongodb";
import Team from "@/models/Team";
import Club from "@/models/Club";
import RegisterPaymentClient from "./RegisterPaymentClient";

export const dynamic = "force-dynamic";

export default async function RegisterPaymentPage({ params, searchParams }) {
  const { teamId } = await params;
  const sp = await searchParams;
  const hasDiscount = sp?.discount === "true";

  await dbConnect();

  const team = await Team.findById(teamId).lean();
  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Team Not Found</h2>
          <p className="text-gray-500">This payment link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const club = await Club.findById(team.clubId).select("name").lean();

  const teamData = {
    _id: team._id.toString(),
    name: team.name,
    season: team.season,
    gender: team.gender,
    teamType: team.teamType,
    costCents: team.costCents,
    loyaltyDiscountCents: team.loyaltyDiscountCents || 0,
    activityStartDate: team.activityStartDate?.toISOString() || null,
  };

  return (
    <RegisterPaymentClient
      team={teamData}
      clubName={club?.name || ""}
      hasDiscount={hasDiscount}
    />
  );
}
