"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlert, getNoticeDraft } from "@/lib/api";
import { AUDIENCE_OPTIONS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import type { Alert, AreaInfo, Audience, Recommendation } from "@/lib/types";

const MAX_MESSAGE = 2000;

interface AlertFormProps {
  /** Area the alert is issued for. */
  area: AreaInfo;
  recommendation: Recommendation | null;
  /** Demo scenario on screen, so the stored snapshot matches what was shown. */
  scenario?: string;
  /** Live mode: source timestamp of the reading on screen. */
  readingTimestamp?: string;
  onClose: () => void;
  onSuccess: (alert: Alert) => void;
}

export default function AlertForm({
  area,
  recommendation,
  scenario,
  readingTimestamp,
  onClose,
  onSuccess,
}: AlertFormProps) {
  const { user } = useAuth();
  const [audience, setAudience] = useState<Audience>("all");
  // null = untouched, so the field shows the (possibly refreshed) draft.
  const [editedEn, setEditedEn] = useState<string | null>(null);
  const [editedHi, setEditedHi] = useState<string | null>(null);
  const [adminName, setAdminName] = useState(user?.name || "");
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const id = useId();

  const draftQuery = useQuery({
    queryKey: ["noticeDraft", area.id, audience, scenario, readingTimestamp, user?.institution],
    queryFn: () =>
      getNoticeDraft({
        campus: area.id,
        audience,
        scenario,
        readingTimestamp,
        institution: user?.institution,
      }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const fallbackEn = recommendation
    ? `AQI is ${recommendation.evidence.aqi} (${recommendation.status}). ${recommendation.action}`
    : "";
  const messageEn = editedEn ?? draftQuery.data?.en ?? (draftQuery.isError ? fallbackEn : "");
  const messageHi = editedHi ?? draftQuery.data?.hi ?? "";
  const edited = editedEn !== null || editedHi !== null;

  const mutation = useMutation({
    mutationFn: () =>
      createAlert({
        campus: area.id,
        audience,
        message: messageEn.trim(),
        messageHi: messageHi.trim() || undefined,
        noticeSource: draftQuery.data?.source,
        adminName: adminName.trim() || "Campus Admin",
        scenario,
        readingTimestamp,
      }),
    onSuccess: (alert) => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      onSuccess(alert);
    },
  });

  // Keep the latest onClose without re-running the mount effect: the parent
  // re-renders on every data refresh, and re-running it would steal focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Dialog behaviour: focus the first field, close on Escape, lock page scroll.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const tooLong = messageEn.length > MAX_MESSAGE || messageHi.length > MAX_MESSAGE;
  const canSend = !!messageEn.trim() && !tooLong && !mutation.isPending;

  function handleSend() {
    if (audience === "all" && !confirming) {
      setConfirming(true);
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900">
              Issue Campus Alert
            </h2>
            <p className="text-xs text-gray-600">Area: {area.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {recommendation && (
          <div className="mb-4 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
            <p className="font-medium text-orange-900">
              Current: AQI {recommendation.evidence.aqi} ({recommendation.status})
            </p>
            <p className="text-orange-800 mt-1">{recommendation.action}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor={`${id}-audience`} className="block text-sm font-medium text-gray-700 mb-1">
              Audience
            </label>
            <select
              id={`${id}-audience`}
              ref={firstFieldRef}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience);
                setConfirming(false);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span aria-live="polite" className="text-gray-600">
              {draftQuery.isPending && "Drafting notice…"}
              {draftQuery.data?.source === "ai" &&
                "AI-assisted draft (Gemini) from the approved template — review before sending."}
              {draftQuery.data?.source === "template" && "Pre-filled from the approved template."}
              {draftQuery.isError && "Couldn't load the bilingual draft — English fallback filled in."}
            </span>
            {edited && draftQuery.data && (
              <button
                type="button"
                onClick={() => {
                  setEditedEn(null);
                  setEditedHi(null);
                }}
                className="shrink-0 text-blue-700 underline"
              >
                Reset to draft
              </button>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-en`} className="block text-sm font-medium text-gray-700 mb-1">
              Message (English)
            </label>
            <textarea
              id={`${id}-en`}
              value={messageEn}
              onChange={(e) => setEditedEn(e.target.value)}
              disabled={draftQuery.isPending && editedEn === null}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            />
            <p className={`text-xs mt-0.5 ${messageEn.length > MAX_MESSAGE ? "text-red-700" : "text-gray-500"}`}>
              {messageEn.length}/{MAX_MESSAGE}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-hi`} className="block text-sm font-medium text-gray-700 mb-1">
              Message (Hindi / हिंदी) <span className="font-normal text-gray-500">— optional</span>
            </label>
            <textarea
              id={`${id}-hi`}
              lang="hi"
              value={messageHi}
              onChange={(e) => setEditedHi(e.target.value)}
              disabled={draftQuery.isPending && editedHi === null}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            />
            <p className={`text-xs mt-0.5 ${messageHi.length > MAX_MESSAGE ? "text-red-700" : "text-gray-500"}`}>
              {messageHi.length}/{MAX_MESSAGE}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-name`} className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              id={`${id}-name`}
              type="text"
              autoComplete="name"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              maxLength={100}
              placeholder="Campus Admin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {confirming && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            This will notify <strong>all students, staff and parents</strong>. Press
            &ldquo;Confirm &amp; send&rdquo; to continue.
          </p>
        )}

        {mutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Failed to send alert: {(mutation.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {mutation.isPending ? "Sending..." : confirming ? "Confirm & send" : "Send Alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
