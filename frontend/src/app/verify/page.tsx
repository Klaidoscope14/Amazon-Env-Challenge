"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authConfirm } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

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
          <Card className="p-8 text-center">
            <div className="text-4xl mb-4">&#10003;</div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Email Verified
            </h1>
            <p className="text-sm text-muted">
              Redirecting to sign in...
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Continue now
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <Card className="p-8">
          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Verify Email
          </h1>
          <p className="text-sm text-muted text-center mb-6">
            Enter the 6-digit code sent to your email
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="verify-email" className="block text-sm font-medium text-muted-strong mb-1">
                Email
              </label>
              <input
                id="verify-email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="verify-code" className="block text-sm font-medium text-muted-strong mb-1">
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
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-center tracking-[0.5em] text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="000000"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth disabled={loading || code.length < 6}>
              {loading ? "Verifying..." : "Verify Email"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted text-center">
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to Sign In
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted">Loading...</p>
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
