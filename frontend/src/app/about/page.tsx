import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "VayuSaathi tells you what the air means for your day, and helps you look out for the people you care about.",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Check the air where you are",
    body: "See today's air quality for your area, what it means, and what to do about it, in English or Hindi.",
  },
  {
    title: "Plan your day",
    body: "Add what you're planning outdoors (a walk, the kids' football, your commute) and get a Go, Modify or Avoid for each.",
  },
  {
    title: "Tell the people who matter",
    body: "Send the advice to your family on WhatsApp in one tap, in Hindi and English. They don't need the app to read it.",
  },
  {
    title: "Get help fast",
    body: "Press SOS to call emergency services or send your location to your emergency contacts.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">About VayuSaathi</h1>
        <p className="text-muted-strong mt-2">
          <span lang="hi">वायुसाथी</span> means &ldquo;air companion&rdquo;. Every winter the air across
          much of India turns unhealthy. A number on a screen doesn&apos;t tell you whether the evening
          walk is fine or how to warn your parents. VayuSaathi does.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-semibold text-accent-text">Step {i + 1}</p>
            <h2 className="mt-1 font-semibold text-foreground">{step.title}</h2>
            <p className="mt-1 text-sm text-muted-strong">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Why make an account?</h2>
        <ul className="text-sm text-muted-strong space-y-2 list-disc list-inside">
          <li>Save home, work and your parents&apos; place, and see all their air at a glance.</li>
          <li>Save emergency contacts, so SOS can reach them in one tap.</li>
          <li>Keep your profile: name, photo, phone and address.</li>
          <li>Post alerts on your area&apos;s notice board, signed with your name.</li>
        </ul>
        <p className="text-sm text-muted">Checking the air and sharing on WhatsApp work without an account.</p>
        <Link href="/signup" className="inline-block text-sm font-medium text-accent-text underline">
          Create a free account
        </Link>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Your privacy</h2>
        <ul className="text-sm text-muted-strong space-y-2 list-disc list-inside">
          <li>Your location is rounded to about 1 km to find your area, and never stored.</li>
          <li>Your plans stay on your device.</li>
          <li>Your profile and emergency contacts are visible only to you.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Where the numbers come from</h2>
        <p className="text-sm text-muted-strong">
          Air quality is shown on India&apos;s National Air Quality Index, with data from Google Air
          Quality and IQAir. VayuSaathi gives general advice, not medical advice. If you feel unwell,
          talk to a doctor.
        </p>
      </section>

      <p className="text-xs text-muted">
        Built by team Waterpark Enthusiasts for the WeMakeDevs × AWS Environmental Hacks.
      </p>
    </div>
  );
}
