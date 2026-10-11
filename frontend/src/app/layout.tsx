import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VayuSaathi — Air quality you can act on",
    template: "%s — VayuSaathi",
  },
  description:
    "The AQI where you are, what to do about it, and an easy way to warn your family and neighbours — in English and Hindi.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets the theme before first paint (no flash). Mirrors lib/theme.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var k="breathesafe_theme",v=localStorage.getItem(k),m=window.matchMedia("(prefers-color-scheme: dark)").matches,t=(v==="light"||v==="dark")?v:(m?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-canvas">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-blue-700 focus:shadow"
        >
          Skip to content
        </a>
        <Providers>
          <Navbar />
          <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
