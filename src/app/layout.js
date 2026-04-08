import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "EasyCoach Payments",
  description: "Club payment management with Stripe Connect",
};

export default function RootLayout({ children }) {
  return (
    <html suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
