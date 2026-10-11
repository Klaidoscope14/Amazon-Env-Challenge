"use client";

import { useQuery } from "@tanstack/react-query";
import { getNoticeTemplate } from "@/lib/api";
import { whatsAppUrl } from "./WhatsAppShare";

/**
 * One tap, no account: forwards the reviewed Hindi + English advice for this
 * area to WhatsApp. The text is fetched ahead of the tap so the WhatsApp
 * window opens directly from the click (browsers block pop-ups opened later).
 */
export default function QuickShare({ areaId, scenario }: { areaId: string; scenario?: string }) {
  const template = useQuery({
    queryKey: ["noticeTemplate", areaId, scenario],
    queryFn: () => getNoticeTemplate({ campus: areaId, audience: "family", scenario }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (template.isError) return null;

  return (
    <a
      href={template.data ? whatsAppUrl({ ...template.data, campus: areaId }) : undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!template.data}
      onClick={(e) => !template.data && e.preventDefault()}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white ${
        template.data ? "bg-green-700 hover:bg-green-800" : "bg-green-700/60 cursor-wait"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      Send to family on WhatsApp
    </a>
  );
}
