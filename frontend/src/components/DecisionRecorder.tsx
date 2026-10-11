"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, recordDecision } from "@/lib/api";
import { useCatalog } from "@/lib/catalog";
import { useAuth } from "@/lib/auth";
import type { Alert } from "@/lib/types";
import Button from "./ui/Button";

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

interface DecisionRecorderProps {
  alert: Alert;
  /** Show the options straight away (used right after issuing an alert). */
  startOpen?: boolean;
  onRecorded?: (decision: string) => void;
}

export default function DecisionRecorder({
  alert,
  startOpen = false,
  onRecorded,
}: DecisionRecorderProps) {
  const [showForm, setShowForm] = useState(startOpen);
  const [customDecision, setCustomDecision] = useState("");
  const [recorded, setRecorded] = useState<{ decision: string; at: string } | null>(null);
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const decisionOptions = useCatalog().data?.decisionOptions ?? [];

  const mutation = useMutation({
    mutationFn: (decision: string) => recordDecision(alert, decision),
    onSuccess: (result, decision) => {
      setRecorded({ decision, at: result.decisionTimestamp });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      onRecorded?.(decision);
    },
    onError: (error) => {
      // Someone else recorded a decision first: show theirs.
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["alerts"] });
      }
    },
  });

  const decision = recorded?.decision ?? alert.decision;
  if (decision) {
    const at = recorded?.at ?? alert.decisionTimestamp;
    const by = recorded ? user?.name : alert.decisionBy;
    return (
      <div className="mt-3 rounded-lg bg-surface-2 border border-border px-3 py-2">
        <p className="text-xs text-accent-text font-medium">Decision recorded</p>
        <p className="text-sm text-foreground mt-0.5">{decision}</p>
        {(at || by) && (
          <p className="text-xs text-accent-text mt-0.5">
            {by ? `by ${by}` : ""}
            {by && at ? " · " : ""}
            {formatTime(at)}
          </p>
        )}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        href="/login?redirect=/alerts"
        className="mt-3 inline-block text-sm text-muted hover:opacity-80 underline"
      >
        Sign in to record a decision
      </Link>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="mt-3 text-sm text-accent-text hover:text-foreground font-medium"
      >
        Record decision
      </button>
    );
  }

  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const customId = `custom-decision-${alert.alertId}`;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted font-medium">Record what you decided:</p>
      <div className="flex flex-wrap gap-2">
        {decisionOptions.map((opt) => (
          <Button
            key={opt}
            variant="secondary"
            size="sm"
            onClick={() => mutation.mutate(opt)}
            disabled={mutation.isPending}
          >
            {opt}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = customDecision.trim();
          if (value) mutation.mutate(value);
        }}
      >
        <label htmlFor={customId} className="sr-only">
          Custom decision
        </label>
        <input
          id={customId}
          type="text"
          value={customDecision}
          onChange={(e) => setCustomDecision(e.target.value)}
          maxLength={500}
          placeholder="Or type a custom decision..."
          className="flex-1 min-h-11 text-xs border border-border-strong rounded-lg px-3 text-foreground"
        />
        <Button type="submit" size="sm" disabled={mutation.isPending || !customDecision.trim()}>
          Save
        </Button>
      </form>
      {mutation.isError && (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {conflict
            ? "A decision was already recorded for this alert. Refreshing…"
            : "Failed to save. Try again."}
        </p>
      )}
    </div>
  );
}
