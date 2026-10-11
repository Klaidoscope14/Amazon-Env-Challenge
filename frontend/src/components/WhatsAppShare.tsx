"use client";

import type { Alert } from "@/lib/types";

/** WhatsApp link for a bilingual notice: Hindi first, then English, then the area's notice page. */
export function whatsAppUrl(notice: { en: string; hi?: string; campus: string }): string {
  const noticeUrl = `${window.location.origin}/notice?area=${encodeURIComponent(notice.campus)}`;
  const text = [notice.hi, notice.en, `वायु गुणवत्ता अभी / Air quality now: ${noticeUrl}`]
    .filter(Boolean)
    .join("\n\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp with an issued alert's notice. */
export default function WhatsAppShare({
  alert,
}: {
  alert: Pick<Alert, "message" | "messageHi" | "campus">;
}) {
  function share() {
    const url = whatsAppUrl({ en: alert.message, hi: alert.messageHi, campus: alert.campus });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
    >
      Share on WhatsApp
    </button>
  );
}
