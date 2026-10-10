"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, recordDecision } from "@/lib/api";
import { DECISION_OPTIONS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import type { Alert } from "@/lib/types";

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
      <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
        <p className="text-xs text-blue-700 font-medium">Decision recorded</p>
        <p className="text-sm text-blue-900 mt-0.5">{decision}</p>
        {(at || by) && (
          <p className="text-xs text-blue-700 mt-0.5">
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
        className="mt-3 inline-block text-sm text-gray-600 hover:text-blue-700 underline"
      >
        Sign in to record a decision
      </Link>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="mt-3 text-sm text-blue-700 hover:text-blue-900 font-medium"
      >
        Record decision
      </button>
    );
  }

  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const customId = `custom-decision-${alert.alertId}`;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-gray-600 font-medium">Record what you decided:</p>
      <div className="flex flex-wrap gap-2">
        {DECISION_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => mutation.mutate(opt)}
            disabled={mutation.isPending}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-gray-900"
          >
            {opt}
          </button>
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
          className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900"
        />
        <button
          type="submit"
          disabled={mutation.isPending || !customDecision.trim()}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </form>
      {mutation.isError && (
        <p className="text-xs text-red-700" role="alert">
          {conflict
            ? "A decision was already recorded for this alert. Refreshing…"
            : "Failed to save. Try again."}
        </p>
      )}
    </div>
  );
}
