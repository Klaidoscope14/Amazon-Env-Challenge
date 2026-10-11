"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Card from "@/components/ui/Card";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import ProfileForm from "@/components/account/ProfileForm";
import EmergencyContactsForm from "@/components/account/EmergencyContactsForm";
import TwoStepCard from "@/components/account/TwoStepCard";

export default function AccountPage() {
  const { user, isLoading, signOut } = useAuth();

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!user) {
    return (
      <Card className="p-8 max-w-md mx-auto text-center">
        <p className="text-foreground font-medium">Sign in to manage your account.</p>
        <Link href="/login?redirect=/account" className="mt-3 inline-block text-blue-600 font-medium">
          Sign in
        </Link>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={user.name || user.email} src={user.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-foreground">Account settings</h1>
          <p className="text-sm text-muted truncate">{user.email}</p>
        </div>
        <Button variant="secondary" onClick={signOut} className="shrink-0">
          Sign out
        </Button>
      </div>
      <ProfileForm user={user} />
      <EmergencyContactsForm user={user} />
      <TwoStepCard user={user} />
    </div>
  );
}
