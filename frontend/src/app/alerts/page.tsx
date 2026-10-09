"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { getAlerts, recordDecision } from "@/lib/api";
import { DECISION_OPTIONS } from "@/lib/constants";
import { useLocation } from "@/lib/useLocation";
import { useAuth } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import DataBadge from "@/components/DataBadge";

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}

function DecisionRecorder({
  alertId,
  currentDecision,
}: {
  alertId: string;
  currentDecision: string | null;
}) {
  const [showForm, setShowForm] = useState(false);
  const [customDecision, setCustomDecision] = useState("");
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const location = useLocation();

  const mutation = useMutation({
    mutationFn: (decision: string) =>
      recordDecision(alertId, decision, location.campus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setShowForm(false);
    },
  });

  if (currentDecision) {
    return (
      <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
        <p className="text-xs text-blue-600 font-medium">Decision Recorded</p>
        <p className="text-sm text-blue-900 mt-0.5">{currentDecision}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link
        href="/login?redirect=/alerts"
        className="mt-3 inline-block text-sm text-gray-400 hover:text-blue-600"
      >
        Sign in to record decisions
      </Link>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        Record decision
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-gray-500 font-medium">Record your decision:</p>
      <div className="flex flex-wrap gap-2">
        {DECISION_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => mutation.mutate(opt)}
            disabled={mutation.isPending}
            className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={customDecision}
          onChange={(e) => setCustomDecision(e.target.value)}
          placeholder="Or type a custom decision..."
          className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5"
        />
        <button
          onClick={() => customDecision.trim() && mutation.mutate(customDecision)}
          disabled={mutation.isPending || !customDecision.trim()}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-red-600">Failed to save. Try again.</p>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const location = useLocation();

  const alertsQuery = useQuery({
    queryKey: ["alerts", location.campus],
    queryFn: () => getAlerts(location.campus),
    enabled: !location.isDetecting,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Alerts & Decision Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Alert history with AQI context and administrator decisions
        </p>
      </div>

      {alertsQuery.isPending && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-6 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {alertsQuery.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-medium">Failed to load alerts</p>
          <button
            onClick={() => alertsQuery.refetch()}
            className="mt-2 text-sm underline"
          >
            Retry
          </button>
        </div>
      )}

      {alertsQuery.data?.alerts.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No alerts issued yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Go to the Dashboard to issue an alert when AQI is elevated.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {alertsQuery.data?.alerts.map((alert) => (
          <div
            key={alert.alertId}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={alert.recommendation?.status || "Good"}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    AQI {alert.aqiSnapshot?.aqi || "N/A"} &middot;{" "}
                    {alert.audience === "all"
                      ? "All stakeholders"
                      : alert.audience}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTime(alert.createdAt)} &middot; by{" "}
                    {alert.adminName}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    alert.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {alert.status === "sent" ? "Sent" : "Simulated"}
                </span>
                {alert.aqiSnapshot?.dataMode && (
                  <DataBadge mode={alert.aqiSnapshot.dataMode} />
                )}
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-800">{alert.message}</p>
            </div>

            <DecisionRecorder
              alertId={alert.alertId}
              currentDecision={alert.decision}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
