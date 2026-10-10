"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "./ui/Button";

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
    <header className="bg-surface border-b border-border sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" aria-label="BreatheSafe Campus — home">
            <span className="text-xl" aria-hidden="true">&#127788;&#65039;</span>
            <div>
              <span className="font-bold text-foreground">BreatheSafe</span>
              <span className="text-muted font-light ml-1">Campus</span>
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
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground hover:bg-surface-2"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <div className="h-8 w-20 bg-surface-2 rounded-lg animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  {user.institution && (
                    <p className="text-xs text-muted">{user.institution}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={signOut}
                  className="ml-1 inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-muted-strong"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className={buttonClasses()}>
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
              className={`inline-flex min-h-11 items-center px-3 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:bg-surface-2"
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
