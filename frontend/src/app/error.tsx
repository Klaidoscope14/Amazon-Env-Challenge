"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-red-800 dark:text-red-200">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm mt-1">
        This page hit an unexpected error. Please try again.
      </p>
      <div className="mt-4 flex gap-4 text-sm font-medium">
        <button onClick={() => retry()} className="underline">
          Try again
        </button>
        <Link href="/" className="underline">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
