"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "./ThemeToggle";
import Avatar from "./Avatar";
import SosDialog from "./SosDialog";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/notice", label: "Notices" },
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
  const { user, isLoading } = useAuth();
  const [sosOpen, setSosOpen] = useState(false);

  const linkClass = (href: string) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${
      pathname === href ? "bg-foreground/10 text-foreground" : "text-muted hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-glass-border bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto w-[min(80rem,calc(100vw-2rem))]">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label="VayuSaathi — home">
            <LogoMark />
            {/* Narrow phones: logo mark only, so SOS and sign-in fit. */}
            <span className="font-display text-lg font-semibold tracking-tight text-foreground max-[399px]:sr-only">
              VayuSaathi
            </span>
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

          <div className="flex items-center gap-1.5 sm:gap-3">
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
              <div className="h-10 w-24 animate-pulse rounded-full bg-surface-2" />
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
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full bg-foreground px-3 text-sm font-semibold text-canvas transition-opacity hover:opacity-90 sm:px-5"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {sosOpen && <SosDialog onClose={() => setSosOpen(false)} />}

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
