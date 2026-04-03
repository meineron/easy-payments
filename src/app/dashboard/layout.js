"use client";

import { useSession, signOut } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function DashboardLayoutInner({ children }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
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
              Dashboard
            </Link>
            <Link
              href="/dashboard/activities"
              className={`text-sm font-medium transition ${
                pathname.startsWith("/dashboard/activities")
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Activities
            </Link>
            <Link
              href="/dashboard/teams"
              className={`text-sm font-medium transition ${
                pathname.startsWith("/dashboard/teams")
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Teams
            </Link>
            <Link
              href="/dashboard/parents"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/parents"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Parents
            </Link>
            <Link
              href="/dashboard/players"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/players"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Players
            </Link>
            <Link
              href="/dashboard/transactions"
              className={`text-sm font-medium transition ${
                pathname === "/dashboard/transactions"
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Transactions
            </Link>
            {session?.user?.hasDirectStripeAccess && (
              <>
                <Link
                  href="/dashboard/customer-data"
                  className={`text-sm font-medium transition ${
                    pathname === "/dashboard/customer-data"
                      ? "text-blue-600"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Customer Data
                </Link>
                <Link
                  href="/dashboard/payment-links"
                  className={`text-sm font-medium transition ${
                    pathname === "/dashboard/payment-links"
                      ? "text-blue-600"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  Payment Links
                </Link>
              </>
            )}
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
              Profile
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-gray-500 hover:text-gray-900 transition"
            >
              Sign Out
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
  return (
    <SessionProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SessionProvider>
  );
}
