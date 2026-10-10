"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError, authSignIn } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Sign In
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Access your BreatheSafe Campus dashboard
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="login-email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@campus.edu"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="login-password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your password"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-sm text-gray-500 text-center">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-gray-500">Loading...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
