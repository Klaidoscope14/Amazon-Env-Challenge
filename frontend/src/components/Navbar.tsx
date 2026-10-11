"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/alerts", label: "Alerts & Decisions" },
  { href: "/notice", label: "Public Notice" },
  { href: "/about", label: "About" },
];

function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 9h11a3 3 0 1 0-3-3" />
        <path d="M3 14h15a3 3 0 1 1-3 3" />
        <path d="M3 19h6" />
      </svg>
    </span>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { user, isLoading, signOut } = useAuth();

  const linkClass = (href: string) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${
      pathname === href ? "bg-foreground/10 text-foreground" : "text-muted hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-glass-border bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto w-[min(80rem,calc(100vw-2rem))]">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="VayuSaathi — home">
            <LogoMark />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">VayuSaathi</span>
          </Link>

          <nav aria-label="Main" className="glass hidden items-center gap-1 rounded-full p-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={linkClass(item.href)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            {isLoading ? (
              <div className="h-10 w-24 animate-pulse rounded-full bg-surface-2" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/account"
                  className="hidden text-sm font-medium text-foreground hover:underline sm:block"
                >
                  {user.name}
                </Link>
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg"
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <button
                  onClick={signOut}
                  className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-canvas transition-opacity hover:opacity-90"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav aria-label="Main" className="-mt-1 flex flex-wrap gap-1 pb-3 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={linkClass(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
