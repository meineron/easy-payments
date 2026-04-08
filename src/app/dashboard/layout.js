"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import IntlProvider from "@/components/IntlProvider";
import { getMessages, getDirection } from "@/lib/i18n";

const LocaleContext = createContext({ locale: "en", setLocale: () => {} });
export function useLocale() { return useContext(LocaleContext); }

function DashboardLayoutInner({ children }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const t = useTranslations("nav");
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
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-gray-900">
              {session?.user?.name || "Club Dashboard"}
            </h1>
            <Link
              href="/dashboard"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("dashboard")}
            </Link>
            <Link
              href="/dashboard/activities"
              className={`text-sm font-medium transition ${
                pathname.startsWith("/dashboard/activities")
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("activities")}
            </Link>
            <Link
              href="/dashboard/teams"
              className={`text-sm font-medium transition ${
                pathname.startsWith("/dashboard/teams")
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("teams")}
            </Link>
            <Link
              href="/dashboard/parents"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/parents"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("parents")}
            </Link>
            <Link
              href="/dashboard/players"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/players"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("players")}
            </Link>
            <Link
              href="/dashboard/messages"
              className={`text-sm font-medium transition ${
                pathname.startsWith("/dashboard/messages")
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("messages")}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/profile"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/profile"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t("profile")}
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-gray-500 hover:text-gray-900 transition"
            >
              {tAuth("signOut")}
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const [locale, setLocale] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/club/profile")
      .then((r) => r.json())
      .then((d) => {
        const lang = d.club?.language || "en";
        setLocale(lang);
        document.documentElement.lang = lang;
        document.documentElement.dir = getDirection(lang);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  function updateLocale(newLocale) {
    setLocale(newLocale);
    document.documentElement.lang = newLocale;
    document.documentElement.dir = getDirection(newLocale);
  }

  return (
    <SessionProvider>
      <LocaleContext.Provider value={{ locale, setLocale: updateLocale }}>
        <IntlProvider locale={locale} messages={getMessages(locale)}>
          {!ready ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
          )}
        </IntlProvider>
      </LocaleContext.Provider>
    </SessionProvider>
  );
}
