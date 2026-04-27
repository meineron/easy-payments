import RegisterPaymentClient from "@/app/payment/register/[teamId]/RegisterPaymentClient";
import { connectMain } from "@/lib/mongodb";
import mongoose from "mongoose";

export default function RegisterPaymentPage({ team, clubName, hasDiscount, notFound }) {
  if (notFound) {
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

  return <RegisterPaymentClient team={team} clubName={clubName} hasDiscount={hasDiscount} />;
}

export async function getServerSideProps(context) {
  const { teamId } = context.params;
  const hasDiscount = context.query?.discount === "true";

  try {
    const main = await connectMain();
    const db = main instanceof mongoose.Connection ? main.db : main;

    const team = await db.collection("teams").findOne(
      { _id: new mongoose.Types.ObjectId(teamId) },
      { projection: { name: 1, season: 1, gender: 1, teamType: 1, costCents: 1, loyaltyDiscountCents: 1, activityStartDate: 1, clubId: 1 } }
    );

    if (!team) return { props: { notFound: true } };

    const club = await db.collection("clubs").findOne(
      { _id: team.clubId },
      { projection: { name: 1 } }
    );

    return {
      props: {
        team: {
          _id: String(team._id),
          name: team.name,
          season: team.season || null,
          gender: team.gender || null,
          teamType: team.teamType || null,
          costCents: team.costCents || 0,
          loyaltyDiscountCents: team.loyaltyDiscountCents || 0,
          activityStartDate: team.activityStartDate ? team.activityStartDate.toISOString() : null,
        },
        clubName: club?.name || "",
        hasDiscount,
        notFound: false,
      },
    };
  } catch {
    return { props: { notFound: true } };
  }
}
