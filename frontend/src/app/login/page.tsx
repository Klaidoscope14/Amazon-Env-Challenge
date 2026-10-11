"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { srpSignIn, type SessionTokens } from "@/lib/cognito";
import { useAuth } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

function LoginForm() {
  const searchParams = useSearchParams();
  // Only same-site paths: "//evil.example" or "https://..." would send a
  // freshly signed-in user off-site.
  const requested = searchParams.get("redirect") || "/";
  const redirect = /^\/(?![\/\\])/.test(requested) ? requested : "/";
  const passwordReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  // Set when the account has two-step verification: answer with an app code.
  const [mfaChallenge, setMfaChallenge] = useState<((code: string) => Promise<SessionTokens>) | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const router = useRouter();
  const { signIn } = useAuth();

  async function finishSignIn(tokens: SessionTokens) {
    await signIn(tokens);
    router.push(redirect);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);

    try {
      // SRP: the password never leaves this browser.
      const outcome = await srpSignIn(email, password);
      setPassword("");
      if (outcome.status === "mfa-required") {
        // Wrapped so React stores the function instead of calling it.
        setMfaChallenge(() => outcome.submitCode);
        return;
      }
      await finishSignIn(outcome.tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setNeedsVerification(err instanceof ApiError && err.code === "USER_NOT_CONFIRMED");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError("");
    setLoading(true);
    try {
      await finishSignIn(await mfaChallenge(mfaCode));
    } catch (err) {
      // A challenge can only be answered once: any failure goes back to the password step.
      setError(err instanceof Error ? err.message : "Verification failed");
      setMfaChallenge(null);
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  }

  if (mfaChallenge) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md">
          <Card className="p-8">
            <h1 className="text-2xl font-bold text-foreground text-center mb-2">Two-step verification</h1>
            <p className="text-sm text-muted text-center mb-6">
              Enter the 6-digit code from your authenticator app.
            </p>
            <form onSubmit={handleMfa} className="space-y-4">
              <div>
                <label htmlFor="mfa-code" className="block text-sm font-medium text-muted-strong mb-1">
                  Authentication code
                </label>
                <input
                  id="mfa-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-lg text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-accent-text"
                  placeholder="000000"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" fullWidth disabled={loading || mfaCode.length !== 6}>
                {loading ? "Verifying..." : "Verify and sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMfaChallenge(null);
                  setMfaCode("");
                  setError("");
                }}
                className="w-full text-sm text-accent-text hover:opacity-80 font-medium"
              >
                Back to sign in
              </button>
            </form>
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
            Sign In
          </h1>
          <p className="text-sm text-muted text-center mb-6">
            Sign in to share alerts and record what you decided
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-muted-strong mb-1">
                Email
              </label>
              <input
                id="login-email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-text"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-muted-strong mb-1">
                Password
              </label>
              <input
                id="login-password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-text"
                placeholder="Your password"
              />
              <p className="mt-1 text-right text-xs">
                <Link
                  href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                  className="text-accent-text hover:opacity-80 font-medium"
                >
                  Forgot password?
                </Link>
              </p>
            </div>

            {passwordReset && !error && (
              <p role="status" className="text-sm text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 rounded-lg px-3 py-2">
                Password changed. Sign in with your new password.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                {error}
                {needsVerification && (
                  <>
                    {" "}
                    <Link
                      href={`/verify?email=${encodeURIComponent(email)}`}
                      className="font-medium underline"
                    >
                      Verify your email
                    </Link>
                  </>
                )}
              </p>
            )}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted text-center">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-accent-text hover:opacity-80 font-medium"
            >
              Sign Up
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
