"use client";

import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import StatusBadge from "./StatusBadge";
import DataBadge from "./DataBadge";
import Card from "./ui/Card";
import Button from "./ui/Button";
import QuickShare from "./QuickShare";
import ExplainPanel from "./ExplainPanel";

interface RecommendationCardProps {
  recommendation: Recommendation;
  areaId: string;
  scenario?: string;
  onIssueAlert: () => void;
}

export default function RecommendationCard({
  recommendation,
  areaId,
  scenario,
  onIssueAlert,
}: RecommendationCardProps) {
  const { isAuthenticated } = useAuth();

  if (recommendation.dataQuality === "unavailable") {
    return (
      <Card muted className="p-6 shadow-none">
        <p className="text-muted font-medium">
          We can&apos;t get a reading for this area right now.
        </p>
        <p className="text-sm text-muted mt-2">Please check again in a little while.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-muted mb-2">What to do</p>
          <StatusBadge status={recommendation.status} large />
        </div>
        <DataBadge mode={recommendation.dataQuality} />
      </div>

      <p
        className="text-lg font-medium text-foreground mt-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {recommendation.action}
      </p>

      <ExplainPanel areaId={areaId} scenario={scenario} />

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <QuickShare areaId={areaId} scenario={scenario} />
          {recommendation.statusLevel >= 3 &&
            (isAuthenticated ? (
              <Button variant="secondary" onClick={onIssueAlert} className="min-h-11">
                Publish a public alert
              </Button>
            ) : (
              <Link
                href="/login?redirect=/"
                className="text-sm text-muted-strong underline underline-offset-2 sm:ml-2"
              >
                Sign in to publish a public alert for your area
              </Link>
            ))}
        </div>
      </div>
    </Card>
  );
}
