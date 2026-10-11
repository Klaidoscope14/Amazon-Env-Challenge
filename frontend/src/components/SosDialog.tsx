"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getNearbyHospitals } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCatalog } from "@/lib/catalog";
import type { EmergencyContact } from "@/lib/types";

type Location = { status: "finding" } | { status: "found"; lat: number; lon: number } | { status: "unavailable" };

const isApple = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** SMS link for one or more numbers (iOS and Android spell multi-recipient links differently). */
function smsUrl(numbers: string[], body: string): string {
  const text = encodeURIComponent(body);
  if (numbers.length === 1) return `sms:${numbers[0]}?body=${text}`;
  return isApple() ? `sms:/open?addresses=${numbers.join(",")}&body=${text}` : `sms:${numbers.join(",")}?body=${text}`;
}

const whatsAppUrl = (phone: string, body: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;

/**
 * SOS: one screen to call emergency services, or call / message your
 * emergency contacts with your current location. Messages open in the
 * phone's own SMS or WhatsApp, ready to send.
 */
export default function SosDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const services = useCatalog().data?.emergencyServices ?? [];
  const contacts: EmergencyContact[] = user?.emergencyContacts ?? [];
  const [location, setLocation] = useState<Location>({ status: "finding" });
  const closeRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // The location is read only now, and only goes into the message you choose to send.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      const timer = setTimeout(() => setLocation({ status: "unavailable" }), 0);
      return () => clearTimeout(timer);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ status: "found", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setLocation({ status: "unavailable" }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  const address = [user?.addressLine1, user?.addressLine2].filter(Boolean).join(", ");
  const where =
    location.status === "found"
      ? `My location: https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lon.toFixed(5)}`
      : address
        ? `My address: ${address}`
        : "";
  const message = [
    `SOS: ${user?.name ? `${user.name} needs` : "I need"} help urgently.`,
    "मुझे तुरंत मदद चाहिए।",
    where,
    user?.phone ? `Call me: ${user.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Rounded to ~1 km: enough to find the nearest hospitals.
  const near =
    location.status === "found"
      ? { lat: Math.round(location.lat * 100) / 100, lon: Math.round(location.lon * 100) / 100 }
      : null;
  const hospitals = useQuery({
    queryKey: ["hospitals", near?.lat, near?.lon],
    queryFn: () => getNearbyHospitals(near!.lat, near!.lon),
    enabled: !!near,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-title`} className="text-xl font-bold text-red-700 dark:text-red-400">
              SOS · <span lang="hi">आपातकाल</span>
            </h2>
            <p className="text-sm text-muted">Get help now.</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-h-11 min-w-11 text-2xl leading-none text-muted hover:text-foreground"
          >
            &times;
          </button>
        </div>

        <section aria-label="Emergency services" className="mt-4 space-y-2">
          {services.map((service, i) => (
            <a
              key={service.number}
              href={`tel:${service.number}`}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 font-semibold ${
                i === 0
                  ? "bg-red-600 text-white hover:bg-red-700 text-lg"
                  : "border border-border-strong text-foreground hover:bg-surface-2"
              }`}
            >
              <span>{service.label}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">Call {service.number}</span>
            </a>
          ))}
        </section>

        {(near || location.status === "finding") && !hospitals.isError && (
          <section aria-label="Nearest hospitals" className="mt-6">
            <h3 className="text-sm font-semibold text-foreground">Nearest hospitals</h3>
            {(location.status === "finding" || hospitals.isPending) && (
              <p className="mt-2 text-sm text-muted">Finding hospitals near you…</p>
            )}
            {hospitals.data?.length === 0 && <p className="mt-2 text-sm text-muted">No hospitals found nearby.</p>}
            {hospitals.data && hospitals.data.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {hospitals.data.map((h) => (
                  <li key={`${h.name}-${h.distanceKm}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                      <p className="truncate text-xs text-muted">
                        {h.distanceKm} km{h.address ? ` · ${h.address}` : ""}
                      </p>
                    </div>
                    {h.phone && (
                      <a href={`tel:${h.phone}`} className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-surface-2">
                        Call
                      </a>
                    )}
                    {h.mapsUrl && (
                      <a
                        href={h.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Directions
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hospitals.data && hospitals.data.length > 0 && (
              <p className="mt-1 text-right text-[11px] text-muted">Powered by Google</p>
            )}
          </section>
        )}

        <section aria-label="Your emergency contacts" className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Your emergency contacts</h3>

          {!user && (
            <p className="mt-2 text-sm text-muted-strong">
              <Link href="/login?redirect=/account" onClick={onClose} className="font-medium text-blue-700 dark:text-blue-300 underline">
                Sign in
              </Link>{" "}
              to save emergency contacts, so you can reach them from here in one tap.
            </p>
          )}

          {user && contacts.length === 0 && (
            <p className="mt-2 text-sm text-muted-strong">
              You haven&apos;t added any yet.{" "}
              <Link href="/account#contacts" onClick={onClose} className="font-medium text-blue-700 dark:text-blue-300 underline">
                Add emergency contacts
              </Link>
            </p>
          )}

          {contacts.length > 0 && (
            <>
              <a
                href={smsUrl(contacts.map((c) => c.phone), message)}
                className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700"
              >
                Text SOS to {contacts.length === 1 ? contacts[0].name : `all ${contacts.length} contacts`}
              </a>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                {contacts.map((c) => (
                  <li key={c.phone} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted">{c.relation ? `${c.relation} · ` : ""}{c.phone}</p>
                    </div>
                    <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-3 text-sm font-medium text-foreground hover:bg-surface-2">
                      Call
                    </a>
                    <a
                      href={whatsAppUrl(c.phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg bg-green-700 px-3 text-sm font-medium text-white hover:bg-green-800"
                    >
                      WhatsApp
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-label="Message" className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">Your message</h3>
          <p className="mt-1 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground">{message}</p>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {location.status === "finding" && "Adding your location…"}
            {location.status === "found" && "Your current location is included."}
            {location.status === "unavailable" &&
              (address ? "Location is off, so your saved address is included." : "Location is off. Turn it on to include where you are.")}
          </p>
          {canShare && (
            <button
              type="button"
              onClick={() => void navigator.share({ text: message }).catch(() => {})}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-blue-700 dark:text-blue-300 underline"
            >
              Send another way
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
