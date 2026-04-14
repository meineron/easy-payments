"use client";

import { useState, useEffect } from "react";
import { useSession, signOut, SessionProvider } from "next-auth/react";
import { useTranslations } from "next-intl";
import IntlProvider from "@/components/IntlProvider";
import { getMessages, getDirection } from "@/lib/i18n";

function StaffLayoutInner({ children }) {
  const { data: session, status } = useSession();
  const tAuth = useTranslations("auth");
  const tc = useTranslations("common");

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">{tc("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-gray-900">EasyCoach</h1>
            <span className="text-sm text-gray-500">{session?.user?.name}</span>
            {session?.user?.staffRole && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {session.user.staffRole}
              </span>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-gray-500 hover:text-gray-900 transition"
          >
            {tAuth("signOut")}
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

export default function StaffLayout({ children }) {
  const [locale, setLocale] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Staff locale could be stored on their profile; for now default to "en"
    setReady(true);
  }, []);

  return (
    <SessionProvider>
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {!ready ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <StaffLayoutInner>{children}</StaffLayoutInner>
        )}
      </IntlProvider>
    </SessionProvider>
  );
}
