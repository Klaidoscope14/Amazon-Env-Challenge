"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CAMPUS_DISPLAY_NAME } from "@/lib/constants";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/alerts", label: "Alerts & Decisions" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🌬️</span>
            <div>
              <span className="font-bold text-gray-900">BreatheSafe</span>
              <span className="text-gray-400 font-light ml-1">Campus</span>
            </div>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500">{CAMPUS_DISPLAY_NAME}</p>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="sm:hidden flex gap-1 pb-3 -mt-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === item.href
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
