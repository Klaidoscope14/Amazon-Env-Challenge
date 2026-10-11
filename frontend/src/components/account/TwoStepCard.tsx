"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { mfaDisable, mfaEnable, mfaSetup } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/types";
import Card from "../ui/Card";
import Button from "../ui/Button";

type Setup = { secret: string; otpauthUri: string; qr: string };

export default function TwoStepCard({ user }: { user: UserProfile }) {
  const { refreshProfile } = useAuth();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      const { secret, otpauthUri } = await mfaSetup();
      const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 200 });
      setSetup({ secret, otpauthUri, qr });
      setCode("");
    });

  const confirmSetup = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await mfaEnable(code);
      await refreshProfile();
      setSetup(null);
      setNotice("Two-step verification is on. You'll be asked for a code each time you sign in.");
    });
  };

  const turnOff = () =>
    run(async () => {
      await mfaDisable();
      await refreshProfile();
      setNotice("Two-step verification is off.");
    });

  return (
      <Card className="p-6 space-y-4" id="security">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Two-step verification</h2>
            <p className="text-sm text-muted mt-1">
              Ask for a code from an authenticator app (Google Authenticator, Microsoft Authenticator,
              1Password…) whenever you sign in.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              user.mfaEnabled
                ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                : "bg-surface-2 text-muted-strong"
            }`}
          >
            {user.mfaEnabled ? "On" : "Off"}
          </span>
        </div>

        {notice && (
          <p role="status" className="text-sm text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-950/40 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {user.mfaEnabled ? (
          <Button variant="secondary" onClick={turnOff} disabled={busy}>
            {busy ? "Turning off…" : "Turn off two-step verification"}
          </Button>
        ) : setup ? (
          <form onSubmit={confirmSetup} className="space-y-4">
            <ol className="text-sm text-muted-strong list-decimal list-inside space-y-1">
              <li>Scan this QR code with your authenticator app.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img
                src={setup.qr}
                alt="QR code for adding VayuSaathi to an authenticator app"
                width={200}
                height={200}
                className="rounded-lg border border-border bg-white"
              />
              <div className="text-sm text-muted-strong space-y-2 min-w-0">
                <p>Can&apos;t scan? Enter this key in the app:</p>
                <code className="block break-all rounded bg-surface-2 px-2 py-1 font-mono text-xs text-foreground">
                  {setup.secret}
                </code>
                <a href={setup.otpauthUri} className="text-accent-text font-medium">
                  Open in authenticator app (on this device)
                </a>
              </div>
            </div>
            <div>
              <label htmlFor="mfa-setup-code" className="block text-sm font-medium text-muted-strong mb-1">
                Code from the app
              </label>
              <input
                id="mfa-setup-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                className="w-40 rounded-lg border border-border-strong px-3 py-2 text-lg text-center tracking-[0.3em] font-mono"
                placeholder="000000"
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Turn on"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setSetup(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={startSetup} disabled={busy}>
            {busy ? "Preparing…" : "Set up two-step verification"}
          </Button>
        )}
      </Card>
  );
}
