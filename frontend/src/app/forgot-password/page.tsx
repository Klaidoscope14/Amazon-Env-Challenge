"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authForgotPassword, authResetPassword } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

const INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await authForgotPassword(email);
      setMessage(result.message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a reset code");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authResetPassword({ email, code, password });
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset the password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <Card className="p-8">
          <h1 className="text-2xl font-bold text-foreground text-center mb-2">Reset password</h1>
          <p className="text-sm text-muted text-center mb-6">
            {step === "request"
              ? "We'll email you a code to set a new password."
              : "Enter the code from the email and choose a new password."}
          </p>

          {step === "request" ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-muted-strong mb-1">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={INPUT}
                  placeholder="you@example.com"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "Sending..." : "Send reset code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={resetPassword} className="space-y-4">
              {message && (
                <p role="status" className="text-sm text-muted-strong bg-surface-2 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}
              <div>
                <label htmlFor="reset-code" className="block text-sm font-medium text-muted-strong mb-1">
                  Code
                </label>
                <input
                  id="reset-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={10}
                  className={`${INPUT} text-center tracking-[0.5em] font-mono`}
                  placeholder="000000"
                />
              </div>
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-muted-strong mb-1">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  aria-describedby="reset-password-help"
                  className={INPUT}
                />
                <p id="reset-password-help" className="mt-1 text-xs text-muted">
                  At least 8 characters, with a lowercase letter and a number.
                </p>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" fullWidth disabled={loading || !code || password.length < 8}>
                {loading ? "Saving..." : "Set new password"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("request");
                  setError("");
                }}
                className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Use a different email or send a new code
              </button>
            </form>
          )}

          <p className="mt-6 text-sm text-muted text-center">
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to Sign In
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted">Loading...</p>
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
