"use client";

import { SessionProvider } from "next-auth/react";

export default function InvitationsLayout({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
