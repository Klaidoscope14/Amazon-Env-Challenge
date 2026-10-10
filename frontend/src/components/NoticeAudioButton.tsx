"use client";

import { useEffect, useRef, useState } from "react";
import { getNoticeAudio } from "@/lib/api";
import type { Alert } from "@/lib/types";

interface NoticeAudioButtonProps {
  alert: Pick<Alert, "alertId" | "createdAt" | "campus">;
  lang: "en" | "hi";
  label: string;
}

/** Plays the issued notice as speech (Amazon Polly), e.g. for a PA system. */
export default function NoticeAudioButton({ alert, lang, label }: NoticeAudioButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  async function toggle() {
    if (state === "playing") {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
      setState("idle");
      return;
    }
    try {
      setState("loading");
      srcRef.current ??= await getNoticeAudio(alert, lang);
      const audio = new Audio(srcRef.current);
      audioRef.current?.pause();
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={state === "loading"}
        aria-pressed={state === "playing"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
      >
        <span aria-hidden="true">{state === "playing" ? "■" : "▶"}</span>
        {state === "loading" ? "Preparing audio…" : state === "playing" ? "Stop" : label}
      </button>
      {state === "error" && (
        <span role="alert" className="text-xs text-red-700 dark:text-red-300">
          Audio unavailable
        </span>
      )}
    </span>
  );
}
