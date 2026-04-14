import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(request) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;

  // Staff must change password before accessing anything else
  if (token?.role === "staff" && token.mustChangePassword && pathname !== "/set-password") {
    return NextResponse.redirect(new URL("/set-password", request.url));
  }

  // Protect admin routes
  if (pathname.startsWith("/admin")) {
    if (!token || token.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect dashboard routes (club only)
  if (pathname.startsWith("/dashboard")) {
    if (!token || token.role !== "club") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect staff routes
  if (pathname.startsWith("/staff")) {
    if (!token || token.role !== "staff") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect set-password page (staff only)
  if (pathname === "/set-password") {
    if (!token || token.role !== "staff") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Protect admin API routes
  if (pathname.startsWith("/api/admin")) {
    if (!token || token.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/api/admin/:path*", "/staff/:path*", "/set-password"],
};
