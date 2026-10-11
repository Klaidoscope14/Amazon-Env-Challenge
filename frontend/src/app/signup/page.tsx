"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authSignUp } from "@/lib/api";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authSignUp({
        email,
        password,
        name,
      });
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md">
        <Card className="p-8">
          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Create Account
          </h1>
          <p className="text-sm text-muted text-center mb-6">
            Save the places you care about, add emergency contacts for SOS, and post alerts for your area.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="signup-name" className="block text-sm font-medium text-muted-strong mb-1">
                Your name *
              </label>
              <input
                id="signup-name"
                autoComplete="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-text"
                placeholder="Dr. Jane Smith"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-muted-strong mb-1">
                Email *
              </label>
              <input
                id="signup-email"
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
              <label htmlFor="signup-password" className="block text-sm font-medium text-muted-strong mb-1">
                Password *
              </label>
              <input
                id="signup-password"
                autoComplete="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                aria-describedby="signup-password-hint"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-text"
                placeholder="••••••••"
              />
              <p id="signup-password-hint" className="mt-1 text-xs text-muted">
                At least 8 characters, with one lowercase letter and one number.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted text-center">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent-text hover:opacity-80 font-medium"
            >
              Sign In
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
