"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authConfirm } from "@/lib/api";

function VerifyForm() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";
  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authConfirm({ email, code });
      setVerified(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center">
            <div className="text-4xl mb-4">&#10003;</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email Verified
            </h1>
            <p className="text-sm text-gray-500">
              Redirecting to sign in...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Verify Email
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter the 6-digit code sent to your email
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="verify-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="verify-email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="verify-code" className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                id="verify-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-[0.5em] text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="000000"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifying..." : "Verify Email"}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-500 text-center">
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-gray-500">Loading...</p>
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
