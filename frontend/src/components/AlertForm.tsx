"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAlert, getNoticeDraft } from "@/lib/api";
import { useCatalog } from "@/lib/catalog";
import { useAuth } from "@/lib/auth";
import type { Alert, AreaInfo, Audience, Recommendation } from "@/lib/types";
import Button from "./ui/Button";

interface AlertFormProps {
  /** Area the alert is shared for. */
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
  const catalog = useCatalog();
  // The API's own limit; until the catalog loads, nothing counts as too long.
  const MAX_MESSAGE = catalog.data?.limits.maxAlertMessage ?? Infinity;
  const [audience, setAudience] = useState<Audience>("family");
  // null = untouched, so the field shows the (possibly refreshed) draft.
  const [editedEn, setEditedEn] = useState<string | null>(null);
  const [editedHi, setEditedHi] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const draftQuery = useQuery({
    queryKey: ["noticeDraft", area.id, audience, scenario, readingTimestamp, user?.name],
    queryFn: () =>
      getNoticeDraft({
        campus: area.id,
        audience,
        scenario,
        readingTimestamp,
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

  // One idempotency key per distinct submission: retrying the same content
  // (double click, network error) reuses it, so the server never creates or
  // emails the same alert twice. Editing the content starts a new key.
  const submission = useRef<{ body: string; key: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        campus: area.id,
        audience,
        message: messageEn.trim(),
        messageHi: messageHi.trim() || undefined,
        noticeSource: draftQuery.data?.source,
        scenario,
        readingTimestamp,
      };
      const body = JSON.stringify(data);
      if (submission.current?.body !== body) {
        submission.current = { body, key: crypto.randomUUID() };
      }
      return createAlert(data, submission.current.key);
    },
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

  // Dialog behaviour: focus the first field, trap Tab inside the dialog, close
  // on Escape, lock page scroll, and restore focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      // Return focus to whatever opened the dialog (the "Issue Alert" button).
      opener?.focus?.();
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        // Click on the backdrop (not the dialog) dismisses.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="bg-surface rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
              Publish a public alert
            </h2>
            <p className="text-xs text-muted">Area: {area.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-muted-strong text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {recommendation && (
          <div className="mb-4 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 p-3 text-sm">
            <p className="font-medium text-orange-900 dark:text-orange-200">
              Current: AQI {recommendation.evidence.aqi} ({recommendation.status})
            </p>
            <p className="text-orange-800 dark:text-orange-200 mt-1">{recommendation.action}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor={`${id}-audience`} className="block text-sm font-medium text-muted-strong mb-1">
              Who is this for?
            </label>
            <select
              id={`${id}-audience`}
              ref={firstFieldRef}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience);
                setConfirming(false);
              }}
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-foreground bg-surface focus:outline-none focus:ring-2 focus:ring-accent-text"
            >
              {(catalog.data?.audiences ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span aria-live="polite" className="text-muted">
              {draftQuery.isPending && "Writing a draft…"}
              {draftQuery.data && "Here’s a draft in English and Hindi. Edit it if you like."}
              {draftQuery.isError && "Couldn't prepare the Hindi version. You can write one below."}
            </span>
            {edited && draftQuery.data && (
              <button
                type="button"
                onClick={() => {
                  setEditedEn(null);
                  setEditedHi(null);
                }}
                className="shrink-0 text-accent-text underline"
              >
                Reset to draft
              </button>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-en`} className="block text-sm font-medium text-muted-strong mb-1">
              Message (English)
            </label>
            <textarea
              id={`${id}-en`}
              value={messageEn}
              onChange={(e) => setEditedEn(e.target.value)}
              disabled={draftQuery.isPending && editedEn === null}
              rows={6}
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-text disabled:bg-surface-2"
            />
            <p className={`text-xs mt-0.5 ${messageEn.length > MAX_MESSAGE ? "text-red-700 dark:text-red-300" : "text-muted"}`}>
              {messageEn.length}
              {Number.isFinite(MAX_MESSAGE) && `/${MAX_MESSAGE}`}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-hi`} className="block text-sm font-medium text-muted-strong mb-1">
              Message (Hindi / हिंदी) <span className="font-normal text-muted">— optional</span>
            </label>
            <textarea
              id={`${id}-hi`}
              lang="hi"
              value={messageHi}
              onChange={(e) => setEditedHi(e.target.value)}
              disabled={draftQuery.isPending && editedHi === null}
              rows={6}
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent-text disabled:bg-surface-2"
            />
            <p className={`text-xs mt-0.5 ${messageHi.length > MAX_MESSAGE ? "text-red-700 dark:text-red-300" : "text-muted"}`}>
              {messageHi.length}
              {Number.isFinite(MAX_MESSAGE) && `/${MAX_MESSAGE}`}
            </p>
          </div>

          <p className="text-xs text-muted">
            Shared as <strong>{user?.name ?? "you"}</strong>.
          </p>
        </div>

        {confirming && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            This notice will be shown to <strong>everyone</strong> who opens the public notice page
            for {area.name}. Press &ldquo;Confirm &amp; publish&rdquo; to continue.
          </p>
        )}

        {mutation.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            Failed to publish the alert: {(mutation.error as Error).message}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleSend} disabled={!canSend}>
            {mutation.isPending ? "Publishing…" : confirming ? "Confirm & publish" : "Publish alert"}
          </Button>
        </div>
      </div>
    </div>
  );
}
