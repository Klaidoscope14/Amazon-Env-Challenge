"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/alerts", label: "Alerts & Decisions" },
  { href: "/notice", label: "Campus Notice" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" aria-label="BreatheSafe Campus — home">
            <span className="text-xl" aria-hidden="true">&#127788;&#65039;</span>
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
                aria-current={pathname === item.href ? "page" : undefined}
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

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  {user.institution && (
                    <p className="text-xs text-gray-500">{user.institution}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={signOut}
                  className="text-xs text-gray-500 hover:text-gray-700 ml-1"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="sm:hidden flex flex-wrap gap-1 pb-3 -mt-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
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
