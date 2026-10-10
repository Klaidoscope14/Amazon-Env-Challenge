import { AQIStatus } from "./types.js";

/*
 * "My plans today": a Go / Modify / Avoid verdict per outdoor plan, from the
 * current AQI category, how strenuous the activity is, how long it lasts and
 * whether someone more sensitive (children, older adults, people with
 * breathing conditions) is involved. Deterministic, and advisory only —
 * suggestions change plans, they never give medical instructions.
 */

export const ACTIVITIES = {
  commute: { label: "Commute / errands", exertion: 0 },
  walk: { label: "Walk", exertion: 0 },
  outdoor_event: { label: "Outdoor event or gathering", exertion: 0 },
  kids_play: { label: "Children playing outside", exertion: 1 },
  cycle: { label: "Cycling", exertion: 1 },
  run: { label: "Run or workout", exertion: 2 },
  sports: { label: "Outdoor sports", exertion: 2 },
} as const;

export type Activity = keyof typeof ACTIVITIES;
export type Verdict = "go" | "modify" | "avoid" | "unknown";

export const ACTIVITY_IDS = Object.keys(ACTIVITIES) as [Activity, ...Activity[]];

export interface Plan {
  id: string;
  activity: Activity;
  durationMinutes: number;
  /** Someone more sensitive to polluted air is taking part. */
  sensitive?: boolean;
}

export interface PlanVerdict {
  id: string;
  verdict: Verdict;
  reason: string;
  suggestion: string;
}

type Rated = Exclude<Verdict, "unknown">;
const ORDER: Rated[] = ["go", "modify", "avoid"];

// Rows: CPCB level 1 (Good) … 6 (Severe). Columns: exertion low, moderate, high.
const MATRIX: Rated[][] = [
  ["go", "go", "go"],
  ["go", "go", "go"],
  ["go", "go", "modify"],
  ["modify", "modify", "avoid"],
  ["modify", "avoid", "avoid"],
  ["avoid", "avoid", "avoid"],
];

const LONG_MINUTES = 60;

const SUGGESTIONS: Record<Rated, Record<Activity, string>> = {
  go: {
    commute: "Go ahead as planned.",
    walk: "Go ahead as planned.",
    outdoor_event: "Go ahead as planned.",
    kids_play: "Go ahead as planned.",
    cycle: "Go ahead as planned.",
    run: "Go ahead as planned.",
    sports: "Go ahead as planned.",
  },
  modify: {
    commute: "Go ahead, but keep time outside short.",
    walk: "Keep it shorter and at an easy pace.",
    outdoor_event: "Shorten it, or move it indoors if you can.",
    kids_play: "Keep outdoor play short and calm, or play indoors.",
    cycle: "Take a shorter, easier ride, or exercise indoors.",
    run: "Shorten it and keep the intensity low, or work out indoors.",
    sports: "Shorten the session and lower the intensity, or move it indoors.",
  },
  avoid: {
    commute: "Travel only if you need to, and keep time outside short.",
    walk: "Skip it today, or walk indoors.",
    outdoor_event: "Move it indoors or postpone it.",
    kids_play: "Keep children's play indoors today.",
    cycle: "Skip the ride today, or exercise indoors.",
    run: "Work out indoors or reschedule.",
    sports: "Move the session indoors or reschedule.",
  },
};

const EXERTION_WORDS = ["light", "moderate", "strenuous"];

export function evaluatePlan(plan: Plan, status: AQIStatus, statusLevel: number): PlanVerdict {
  if (status === "Unavailable" || statusLevel < 1 || statusLevel > 6) {
    return {
      id: plan.id,
      verdict: "unknown",
      reason: "No current air-quality reading for this area.",
      suggestion: "Check official sources before heading out.",
    };
  }

  const { exertion, label } = ACTIVITIES[plan.activity];
  let verdict = MATRIX[statusLevel - 1][exertion];
  const long = plan.durationMinutes > LONG_MINUTES;

  // From Moderate air upwards, a long plan or a more sensitive person moves
  // the verdict one step stricter; in Satisfactory air only strenuous plans
  // with sensitive people are flagged.
  const bump =
    (statusLevel >= 3 && (long || plan.sensitive)) ||
    (statusLevel === 2 && plan.sensitive && exertion === 2);
  if (bump) verdict = ORDER[Math.min(ORDER.indexOf(verdict) + 1, ORDER.length - 1)];

  const factors = [
    `${status} air`,
    `${EXERTION_WORDS[exertion]} activity`,
    ...(long ? [`over ${LONG_MINUTES} minutes`] : []),
    ...(plan.sensitive ? ["includes someone more sensitive"] : []),
  ];
  return {
    id: plan.id,
    verdict,
    reason: `${label}: ${factors.join(", ")}.`,
    suggestion: SUGGESTIONS[verdict][plan.activity],
  };
}
