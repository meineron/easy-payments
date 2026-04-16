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

function NavLink({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`text-sm font-medium transition ${
        active ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}
    </Link>
  );
}

function DashboardLayoutInner({ children }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tc = useTranslations("common");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">{tc("loading")}</p>
      </div>
    );
  }

  const navLinks = [
    { href: "/dashboard", label: t("dashboard"), active: pathname === "/dashboard" },
    { href: "/dashboard/activities", label: t("activities"), active: pathname.startsWith("/dashboard/activities") },
    { href: "/dashboard/teams", label: t("teams"), active: pathname.startsWith("/dashboard/teams") },
    { href: "/dashboard/parents", label: t("parents"), active: pathname === "/dashboard/parents" },
    { href: "/dashboard/players", label: t("players"), active: pathname === "/dashboard/players" },
    { href: "/dashboard/users", label: t("users"), active: pathname.startsWith("/dashboard/users") },
    { href: "/dashboard/messages", label: t("messages"), active: pathname.startsWith("/dashboard/messages") },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-4 md:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-6">
            <h1 className="text-lg font-bold text-gray-900 truncate max-w-[160px] md:max-w-none">
              {session?.user?.name || "Club Dashboard"}
            </h1>
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <NavLink key={link.href} href={link.href} active={link.active}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4">
              <NavLink href="/dashboard/profile" active={pathname === "/dashboard/profile"}>
                {t("profile")}
              </NavLink>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-gray-500 hover:text-gray-900 transition"
              >
                {tAuth("signOut")}
              </button>
            </div>
            <button
              className="md:hidden p-2 -me-2 text-gray-500 hover:text-gray-900"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              )}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                  link.active
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-1 border-gray-100" />
            <Link
              href="/dashboard/profile"
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                pathname === "/dashboard/profile"
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {t("profile")}
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-start px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium transition"
            >
              {tAuth("signOut")}
            </button>
          </div>
        )}
      </nav>
      <main className="flex-1 p-4 md:p-6">
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
