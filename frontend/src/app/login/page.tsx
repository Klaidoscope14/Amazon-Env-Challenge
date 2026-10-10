"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError, authSignIn } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

function LoginForm() {
  const searchParams = useSearchParams();
  // Only same-site paths: "//evil.example" or "https://..." would send a
  // freshly signed-in user off-site.
  const requested = searchParams.get("redirect") || "/";
  const redirect = /^\/(?![\/\\])/.test(requested) ? requested : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);

    try {
      const result = await authSignIn({ email, password });
      await signIn({
        accessToken: result.accessToken,
        idToken: result.idToken,
        refreshToken: result.refreshToken,
      });
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setNeedsVerification(err instanceof ApiError && err.code === "USER_NOT_CONFIRMED");
    } finally {
      setLoading(false);
    }
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
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your password"
              />
            </div>

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
              className="text-blue-600 hover:text-blue-700 font-medium"
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
