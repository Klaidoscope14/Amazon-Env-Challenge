import { describe, expect, it } from "vitest";
import { evaluatePlan, type Activity } from "../shared/src/plans.js";
import { EvaluatePlansBodySchema, parse, ValidationError } from "../shared/src/schemas.js";
import type { AQIStatus } from "../shared/src/types.js";

const LEVELS: AQIStatus[] = ["Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"];
const verdict = (activity: Activity, level: number, extra: { durationMinutes?: number; sensitive?: boolean } = {}) =>
  evaluatePlan({ id: "p", activity, durationMinutes: 30, ...extra }, LEVELS[level - 1], level).verdict;

describe("evaluatePlan", () => {
  it("lets everything go ahead in Good and Satisfactory air", () => {
    for (const a of ["walk", "run", "kids_play"] as Activity[]) {
      expect(verdict(a, 1)).toBe("go");
      expect(verdict(a, 2)).toBe("go");
    }
  });

  it("gets stricter with exertion as air worsens", () => {
    expect([verdict("walk", 3), verdict("cycle", 3), verdict("run", 3)]).toEqual(["go", "go", "modify"]);
    expect([verdict("walk", 4), verdict("cycle", 4), verdict("run", 4)]).toEqual(["modify", "modify", "avoid"]);
    expect([verdict("walk", 5), verdict("cycle", 5), verdict("run", 5)]).toEqual(["modify", "avoid", "avoid"]);
    expect([verdict("walk", 6), verdict("commute", 6)]).toEqual(["avoid", "avoid"]);
  });

  it("is stricter for long plans and sensitive people from Moderate air", () => {
    expect(verdict("walk", 3, { durationMinutes: 90 })).toBe("modify");
    expect(verdict("walk", 3, { sensitive: true })).toBe("modify");
    expect(verdict("walk", 1, { durationMinutes: 300, sensitive: true })).toBe("go");
    expect(verdict("run", 2, { sensitive: true })).toBe("modify");
  });

  it("explains itself without medical advice", () => {
    const v = evaluatePlan({ id: "a", activity: "kids_play", durationMinutes: 90, sensitive: true }, "Poor", 4);
    expect(v).toMatchObject({ id: "a", verdict: "avoid", suggestion: "Keep children's play indoors today." });
    expect(v.reason).toBe("Children playing outside: Poor air, moderate activity, over 60 minutes, includes someone more sensitive.");
  });

  it("says 'unknown' without a reading", () => {
    expect(evaluatePlan({ id: "a", activity: "walk", durationMinutes: 30 }, "Unavailable", 0).verdict).toBe("unknown");
  });
});

describe("plans request validation", () => {
  const plan = { id: "1", activity: "walk", durationMinutes: 30 };
  it("accepts valid plans and rejects bad ones", () => {
    expect(parse(EvaluatePlansBodySchema, { campus: "city-pune", plans: [plan] }).plans).toHaveLength(1);
    const bad = (plans: unknown) => {
      try { parse(EvaluatePlansBodySchema, { campus: "city-pune", plans }); } catch (e) { return (e as ValidationError).message; }
    };
    expect(bad([])).toBe("Add at least one plan");
    expect(bad([{ ...plan, activity: "skydiving" }])).toBe("Unknown activity: skydiving");
    expect(bad([{ ...plan, durationMinutes: 2 }])).toBe("durationMinutes must be between 5 and 600");
    expect(bad(Array.from({ length: 13 }, (_, i) => ({ ...plan, id: String(i) })))).toBe("At most 12 plans");
  });
});
