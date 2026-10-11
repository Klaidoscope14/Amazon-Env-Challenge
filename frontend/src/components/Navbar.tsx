"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "./ui/Button";
import ThemeToggle from "./ThemeToggle";
import Avatar from "./Avatar";
import SosDialog from "./SosDialog";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/alerts", label: "Shared alerts" },
  { href: "/notice", label: "Notice board" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [sosOpen, setSosOpen] = useState(false);

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2" aria-label="VayuSaathi — home">
            <span className="text-xl" aria-hidden="true">&#127788;&#65039;</span>
            <span className="font-bold text-foreground">VayuSaathi</span>
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

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSosOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-bold tracking-wide text-white shadow-sm hover:bg-red-700"
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white animate-pulse" />
              SOS
            </button>
            <ThemeToggle />
            {isLoading ? (
              <div className="h-8 w-20 bg-surface-2 rounded-lg animate-pulse" />
            ) : user ? (
              <Link
                href="/account"
                aria-label={`Account settings for ${user.name}`}
                className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2"
              >
                <span className="hidden sm:block max-w-[10rem] truncate text-sm font-medium text-foreground">{user.name}</span>
                <Avatar name={user.name || user.email} src={user.avatar} size={32} />
              </Link>
            ) : (
              <Link href="/login" className={buttonClasses()}>
                Sign In
              </Link>
            )}
          </div>
        </div>

        {sosOpen && <SosDialog onClose={() => setSosOpen(false)} />}

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
