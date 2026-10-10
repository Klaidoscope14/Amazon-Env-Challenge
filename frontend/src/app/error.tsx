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
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm mt-1">
        This page hit an unexpected error. You can try again, or check{" "}
        <a
          href="https://cpcb.nic.in"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          official CPCB sources
        </a>{" "}
        for the latest air quality.
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
