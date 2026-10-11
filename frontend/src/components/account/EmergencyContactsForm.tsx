"use client";

import { useId, useState } from "react";
import { updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EmergencyContact, UserProfile } from "@/lib/types";
import Card from "../ui/Card";
import Button from "../ui/Button";
import FormMessage from "./FormMessage";

const MAX_CONTACTS = 5;

type Row = EmergencyContact & { key: string };

const toRows = (contacts: EmergencyContact[]): Row[] =>
  contacts.map((c) => ({ ...c, key: crypto.randomUUID() }));

export default function EmergencyContactsForm({ user }: { user: UserProfile }) {
  const { profileSaved } = useAuth();
  const id = useId();
  const [rows, setRows] = useState<Row[]>(() => toRows(user.emergencyContacts));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const update = (key: string, patch: Partial<EmergencyContact>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await updateProfile({
        name: user.name,
        phone: user.phone,
        addressLine1: user.addressLine1,
        addressLine2: user.addressLine2,
        emergencyContacts: rows
          .filter((r) => r.name.trim() || r.phone.trim())
          .map(({ name, phone, relation }) => ({ name, phone, ...(relation?.trim() ? { relation } : {}) })),
      });
      await profileSaved(saved);
      setRows(toRows(saved.emergencyContacts));
      setMessage({ kind: "ok", text: "Emergency contacts saved." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

  return (
    <Card className="p-6" id="contacts">
      <h2 className="text-lg font-semibold text-foreground">Emergency contacts</h2>
      <p className="text-sm text-muted mt-1">
        The people SOS can call or message in one tap. Add up to {MAX_CONTACTS}.
      </p>

      <form onSubmit={save} className="mt-4 space-y-4">
        {rows.length === 0 && (
          <p className="rounded-lg bg-surface-2 px-3 py-3 text-sm text-muted-strong">No emergency contacts yet.</p>
        )}
        {rows.map((row, i) => (
          <fieldset key={row.key} className="rounded-xl border border-border p-4">
            <legend className="px-1 text-xs font-medium text-muted">Contact {i + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
              <div>
                <label htmlFor={`${id}-${row.key}-name`} className="block text-xs font-medium text-muted-strong mb-1">
                  Name
                </label>
                <input
                  id={`${id}-${row.key}-name`}
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                  required
                  maxLength={60}
                  className={field}
                />
              </div>
              <div>
                <label htmlFor={`${id}-${row.key}-phone`} className="block text-xs font-medium text-muted-strong mb-1">
                  Phone
                </label>
                <input
                  id={`${id}-${row.key}-phone`}
                  type="tel"
                  inputMode="tel"
                  placeholder="98765 43210"
                  value={row.phone}
                  onChange={(e) => update(row.key, { phone: e.target.value })}
                  required
                  className={field}
                />
              </div>
              <div>
                <label htmlFor={`${id}-${row.key}-rel`} className="block text-xs font-medium text-muted-strong mb-1">
                  Relation <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id={`${id}-${row.key}-rel`}
                  placeholder="Father"
                  value={row.relation ?? ""}
                  onChange={(e) => update(row.key, { relation: e.target.value })}
                  maxLength={30}
                  className={field}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              className="mt-3 min-h-11 text-sm font-medium text-red-700 dark:text-red-300 underline"
            >
              Remove {row.name.trim() || `contact ${i + 1}`}
            </button>
          </fieldset>
        ))}

        <FormMessage message={message} />
        <div className="flex flex-wrap gap-3">
          {rows.length < MAX_CONTACTS && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows((current) => [...current, { key: crypto.randomUUID(), name: "", phone: "" }])}
            >
              Add contact
            </Button>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save contacts"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
