"use client";

import { useEffect, useId, useRef, useState } from "react";
import { STANDARD_LABEL, type AqiStandard } from "@/lib/aqiScale";
import { useAqiStandard } from "@/lib/useAqiStandard";

function IndiaFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="30" height="6.7" fill="#FF9933" />
      <rect y="6.7" width="30" height="6.6" fill="#FFFFFF" />
      <rect y="13.3" width="30" height="6.7" fill="#138808" />
      <circle cx="15" cy="10" r="2.3" fill="none" stroke="#000080" strokeWidth="0.6" />
      <circle cx="15" cy="10" r="0.5" fill="#000080" />
    </svg>
  );
}

function UsFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="30" height="20" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
      ))}
      <rect width="12.5" height="10.8" fill="#3C3B6E" />
      {[0, 1, 2, 3].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <circle key={`${r}-${c}`} cx={2.3 + c * 3.9 + (r % 2) * 1.9} cy={1.9 + r * 2.6} r="0.5" fill="#FFFFFF" />
        ))
      )}
    </svg>
  );
}

const OPTIONS: { value: AqiStandard; Flag: typeof IndiaFlag }[] = [
  { value: "india", Flag: IndiaFlag },
  { value: "us", Flag: UsFlag },
];

/** "AQI Standard" switch: the Indian CPCB index or the US EPA index. */
export default function AqiStandardSelect() {
  const [standard, setStandard] = useAqiStandard();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = OPTIONS.find((o) => o.value === standard) ?? OPTIONS[0];

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value: AqiStandard) => {
    setStandard(value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">AQI Standard</span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="glass mt-1 inline-flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-foreground"
      >
        <current.Flag className="h-4 w-6 shrink-0 rounded-[2px]" />
        {STANDARD_LABEL[standard].name}
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-accent-text transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="AQI standard"
          className="glass absolute left-0 z-40 mt-2 w-60 overflow-hidden rounded-xl py-1 shadow-xl"
        >
          {OPTIONS.map(({ value, Flag }, i) => {
            const selected = value === standard;
            return (
              <li key={value} role="presentation" className={i > 0 ? "border-t border-glass-border" : ""}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(value)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2/70"
                >
                  <Flag className="h-5 w-7 shrink-0 rounded-[2px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{STANDARD_LABEL[value].name}</span>
                    <span className="block text-xs text-muted">{STANDARD_LABEL[value].body}</span>
                  </span>
                  {selected && (
                    <svg viewBox="0 0 20 20" className="h-4 w-4 text-accent-text" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 10.5l4 4 8-9" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
