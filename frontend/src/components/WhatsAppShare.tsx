"use client";

import type { Alert } from "@/lib/types";

/** Opens WhatsApp with the bilingual notice and a link to the public notice page. */
export default function WhatsAppShare({ alert }: { alert: Pick<Alert, "message" | "messageHi"> }) {
  function share() {
    const noticeUrl = `${window.location.origin}/notice`;
    const text = [alert.message, alert.messageHi, `Campus notice: ${noticeUrl}`]
      .filter(Boolean)
      .join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
    >
      Share on WhatsApp
    </button>
  );
}
