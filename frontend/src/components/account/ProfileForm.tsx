"use client";

import { useId, useRef, useState } from "react";
import { updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { UserProfile } from "@/lib/types";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Avatar from "../Avatar";
import FormMessage from "./FormMessage";

const PHOTO_SIZE = 256;

/** True for iPhone-style HEIC/HEIF photos, which only some browsers (Safari) can open. */
const isHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/**
 * Opens any image the browser can decode (JPEG, PNG, WebP, GIF, AVIF, BMP,
 * SVG, and HEIC in Safari), center-crops it and scales it to a small square
 * JPEG data URL. The photo's own orientation is respected.
 */
async function toAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("That file isn't a photo. Pick an image instead.");
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new Error(
            isHeic(file)
              ? "This browser can't open iPhone (HEIC) photos. Try Safari, or save the photo as a JPEG first."
              : "We couldn't open that photo. Try a JPEG, PNG, WebP or GIF."
          )
        );
      img.src = url;
    });
    // SVGs can have no natural size; treat them as square.
    const width = image.naturalWidth || PHOTO_SIZE;
    const height = image.naturalHeight || PHOTO_SIZE;
    const side = Math.min(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d")!;
    // White behind transparent images (PNG, GIF, SVG), since JPEG has no transparency.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ProfileForm({ user }: { user: UserProfile }) {
  const { profileSaved } = useAuth();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(user.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(user.addressLine2 ?? "");
  // undefined = unchanged, null = removed, string = new photo.
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const shownAvatar = avatar === undefined ? user.avatar : avatar ?? undefined;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatar(await toAvatar(file));
      setMessage(null);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await updateProfile({
        name,
        phone,
        addressLine1,
        addressLine2,
        emergencyContacts: user.emergencyContacts,
        ...(avatar !== undefined ? { avatar } : {}),
      });
      await profileSaved(saved);
      setAvatar(undefined);
      setMessage({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground";

  return (
    <Card className="p-6" id="profile">
      <h2 className="text-lg font-semibold text-foreground">Profile</h2>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={name || user.email} src={shownAvatar} size={72} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" onChange={pickPhoto} className="hidden" id={`${id}-photo`} />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              {shownAvatar ? "Change photo" : "Upload photo"}
            </Button>
            {shownAvatar && (
              <Button type="button" variant="secondary" onClick={() => setAvatar(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-muted-strong mb-1">
            Name
          </label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" className={field} />
        </div>

        <div>
          <label htmlFor={`${id}-phone`} className="block text-sm font-medium text-muted-strong mb-1">
            Phone
          </label>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${id}-a1`} className="block text-sm font-medium text-muted-strong mb-1">
            Address line 1
          </label>
          <input
            id={`${id}-a1`}
            autoComplete="address-line1"
            placeholder="House / flat, street"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            maxLength={120}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={`${id}-a2`} className="block text-sm font-medium text-muted-strong mb-1">
            Address line 2
          </label>
          <input
            id={`${id}-a2`}
            autoComplete="address-line2"
            placeholder="Area, city, PIN code"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            maxLength={120}
            className={field}
          />
          <p className="mt-1 text-xs text-muted">Your address is added to SOS messages if your location isn&apos;t available.</p>
        </div>

        <FormMessage message={message} />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Card>
  );
}
