"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAlert } from "@/lib/api";
import { AUDIENCE_OPTIONS, DEFAULT_CAMPUS } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import type { Recommendation } from "@/lib/types";

interface AlertFormProps {
  recommendation: Recommendation | null;
  /** Demo scenario on screen, so the stored snapshot matches what was shown. */
  scenario?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AlertForm({
  recommendation,
  scenario,
  onClose,
  onSuccess,
}: AlertFormProps) {
  const defaultMessage = recommendation
    ? `AQI is ${recommendation.evidence.aqi} (${recommendation.status}). ${recommendation.action}`
    : "";

  const { user } = useAuth();
  const [audience, setAudience] = useState("all");
  const [message, setMessage] = useState(defaultMessage);
  const [adminName, setAdminName] = useState(user?.name || "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createAlert({
        campus: DEFAULT_CAMPUS,
        audience,
        message,
        adminName: adminName || "Campus Admin",
        scenario,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      onSuccess();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Issue Campus Alert</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {recommendation && (
          <div className="mb-4 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
            <p className="font-medium text-orange-800">
              Current: AQI {recommendation.evidence.aqi} ({recommendation.status})
            </p>
            <p className="text-orange-700 mt-1">{recommendation.action}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Audience
            </label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alert Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Campus Admin"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Failed to send alert. Please try again.
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !message.trim()}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {mutation.isPending ? "Sending..." : "Send Alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
