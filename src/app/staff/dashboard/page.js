import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useIntl } from "react-intl";

export default function StaffDashboardPage() {
  const intl = useIntl();
  const { data: session } = useSession();
  const t = (id, values) => intl.formatMessage({ id: `payments.staffDashboard.${id}` }, values);

  const staffName = session?.user?.name || "";

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("welcome", { name: staffName })}
        </h1>
        <p className="text-gray-500">{t("subtitle")}</p>
      </div>
    </div>
  );
}
