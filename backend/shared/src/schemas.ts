import { z } from "zod";
import { isDemoScenario } from "./demo.js";
import { AUDIENCES } from "./notice-templates.js";
import { isAreaId } from "./area-readings.js";
import { ACTIVITY_IDS } from "./plans.js";

/*
 * Zod schemas for every API input. Handlers call parse(); the first problem
 * becomes a 400 with a readable message. Blank strings and null count as
 * "not provided", and strings are trimmed before their limits are checked.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
}

const blankToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

function requiredText(field: string, max: number) {
  return z.preprocess(
    blankToUndefined,
    z
      .string({
        error: (issue) =>
          issue.input === undefined ? `Missing required field: ${field}` : `${field} must be a string`,
      })
      .trim()
      .max(max, `${field} must be at most ${max} characters`)
  );
}

function optionalText(field: string, max: number) {
  return z.preprocess(
    blankToUndefined,
    z
      .string({ error: `${field} must be a string` })
      .trim()
      .max(max, `${field} must be at most ${max} characters`)
      .optional()
  );
}

const areaId = z
  .string({ error: "campus (area id) is required" })
  .refine(isAreaId, "campus (area id) is required");

const scenario = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine(isDemoScenario, { error: (issue) => `Unknown demo scenario: ${String(issue.input)}` })
    .optional()
);

const audience = z.enum(AUDIENCES, {
  error: (issue) =>
    issue.input === undefined ? "Missing required field: audience" : `Unknown audience: ${String(issue.input)}`,
});

const lang = z.preprocess(
  (value) => blankToUndefined(value) ?? "en",
  z.enum(["en", "hi"], { error: "lang must be en or hi" })
);

const positiveInt = "hours must be a positive integer";

// India's rough bounding box; anything outside gets the area picker.
const outsideIndia = "lat/lon must be a location in India";
const latitude = z.coerce.number({ error: outsideIndia }).min(5, outsideIndia).max(38, outsideIndia);
const longitude = z.coerce.number({ error: outsideIndia }).min(67, outsideIndia).max(99, outsideIndia);

// ---- Query strings ---------------------------------------------------------

export const AreaQuerySchema = z.object({ campus: areaId, scenario });

export const TrendsQuerySchema = AreaQuerySchema.extend({
  hours: z
    .preprocess(
      (value) => blankToUndefined(value) ?? "24",
      z.coerce.number({ error: positiveInt }).int(positiveInt).min(1, positiveInt)
    )
    .transform((hours) => Math.min(hours, 168)),
});

export const NearestQuerySchema = z.object({ lat: latitude, lon: longitude });

export const MAX_SITES = 30;
export const MAX_ALERT_MESSAGE = 2000;
export const MAX_PLANS = 12;
const sitesMessage = `points must be up to ${MAX_SITES} "lat,lon" pairs separated by ";"`;

/** GET /aqi/sites?points=28.61,77.21;19.08,72.88 — places anywhere (only those in India get a reading). */
export const SitesQuerySchema = z.object({
  points: z
    .string({ error: sitesMessage })
    .max(MAX_SITES * 24, sitesMessage)
    .transform((value, ctx) => {
      const pairs = value.split(";").filter(Boolean);
      const points = pairs.map((pair) => pair.split(",").map(Number));
      const valid =
        pairs.length > 0 &&
        pairs.length <= MAX_SITES &&
        points.every(
          (p) => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
        );
      if (!valid) {
        ctx.addIssue({ code: "custom", message: sitesMessage });
        return z.NEVER;
      }
      return points.map(([lat, lon]) => ({ lat, lon }));
    }),
});

/** Google Places session token: groups a search and the chosen result for billing. */
const placesSession = z.preprocess(
  blankToUndefined,
  z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Invalid session").optional()
);

export const PlaceSearchQuerySchema = z.object({
  q: requiredText("q", 100).pipe(z.string().min(2, "Type at least 2 letters")),
  session: placesSession,
});

export const PlaceResolveQuerySchema = z.object({
  placeId: requiredText("placeId", 300).pipe(z.string().regex(/^[A-Za-z0-9_-]+$/, "Invalid placeId")),
  session: placesSession,
});

export const AlertsQuerySchema = z.object({
  campus: areaId,
  limit: z
    .preprocess((value) => blankToUndefined(value) ?? "25", z.coerce.number().int().catch(25))
    .transform((limit) => Math.min(Math.max(limit, 1), 50)),
  cursor: optionalText("cursor", 400),
});

export const NoticeDraftQuerySchema = AreaQuerySchema.extend({
  audience: z.preprocess((value) => blankToUndefined(value) ?? "all", audience),
  readingTimestamp: optionalText("readingTimestamp", 40),
});

export const NoticeAudioQuerySchema = z.object({
  campus: areaId,
  alertId: z.string({ error: "campus, alertId and createdAt are required" }).min(1).max(64),
  createdAt: z.string({ error: "campus, alertId and createdAt are required" }).min(1).max(40),
  lang,
});

export const ExplainQuerySchema = AreaQuerySchema.extend({ lang });

// ---- Request bodies --------------------------------------------------------

export const CreateAlertBodySchema = z.object({
  campus: areaId,
  audience,
  message: requiredText("message", MAX_ALERT_MESSAGE),
  messageHi: optionalText("messageHi", MAX_ALERT_MESSAGE),
  noticeSource: z.preprocess(
    blankToUndefined,
    z.enum(["template", "ai"], { error: "noticeSource must be template or ai" }).optional()
  ),
  scenario,
  readingTimestamp: optionalText("readingTimestamp", 40),
});

export const RecordDecisionBodySchema = z.object({
  decision: requiredText("decision", 500),
  createdAt: optionalText("createdAt", 40),
});

const email = z.preprocess(
  blankToUndefined,
  z.email({
    error: (issue) =>
      issue.input === undefined ? "Missing required field: email" : "Enter a valid email address",
  })
);

const password = z
  .string({ error: "Missing required field: password" })
  .min(1, "Missing required field: password")
  .max(256, "password must be at most 256 characters");

export const SignUpBodySchema = z.object({
  email,
  password: password.min(8, "Password must be at least 8 characters"),
  name: requiredText("name", 100),
});

export const ConfirmBodySchema = z.object({ email, code: requiredText("code", 10) });

export const EmailBodySchema = z.object({ email });

export const ResetPasswordBodySchema = z.object({
  email,
  code: requiredText("code", 10),
  password: password.min(8, "Password must be at least 8 characters"),
});

const totpCode = z
  .string({ error: "Enter the 6-digit code from your authenticator app" })
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export const MfaCodeBodySchema = z.object({ code: totpCode });

export const RefreshBodySchema = z.object({ refreshToken: requiredText("refreshToken", 4096) });

/**
 * Phone numbers: spaces, dashes, dots and brackets are ignored; a 10-digit
 * Indian mobile number gets +91; anything else must be in international
 * form. Stored as E.164 ("+919876543210").
 */
function phoneNumber(field: string) {
  const message = `${field}: enter a 10-digit mobile number, or a number starting with +country code`;
  return z
    .string({ error: message })
    .transform((value) => value.replace(/[\s\-().]/g, ""))
    .transform((value) => (/^0?[6-9]\d{9}$/.test(value) ? `+91${value.slice(-10)}` : value))
    .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), message);
}

/** Profile photo: a small JPEG, PNG or WebP data URL (the browser resizes it first). */
const AVATAR_MAX_CHARS = 150_000;
const avatar = z
  .string()
  .max(AVATAR_MAX_CHARS, "Profile photo is too large")
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Profile photo must be a JPEG, PNG or WebP image")
  .nullable()
  .optional();

export const MAX_EMERGENCY_CONTACTS = 5;
export const MAX_PLACES = 5;

const placeSchema = z.object({
  label: requiredText("Place name", 30).pipe(z.string().min(1, "Give each place a name, like Home")),
  areaId: requiredText("areaId", 90).pipe(z.string().regex(/^[a-z0-9][a-z0-9-]{0,89}$/, "Invalid area")),
  name: requiredText("name", 80),
  lat: z.number().min(5).max(38),
  lon: z.number().min(67).max(99),
});

export const ProfileBodySchema = z.object({
  name: requiredText("name", 80).pipe(z.string().min(1, "Enter your name")),
  phone: z.preprocess(blankToUndefined, phoneNumber("Phone").optional()),
  addressLine1: optionalText("Address line 1", 120),
  addressLine2: optionalText("Address line 2", 120),
  avatar,
  emergencyContacts: z
    .array(
      z.object({
        name: requiredText("Contact name", 60).pipe(z.string().min(1, "Each contact needs a name")),
        phone: z.preprocess(
          (value) => blankToUndefined(value) ?? "",
          phoneNumber("Contact phone")
        ),
        relation: optionalText("Relation", 30),
      }),
      { error: "emergencyContacts must be a list" }
    )
    .max(MAX_EMERGENCY_CONTACTS, `You can save up to ${MAX_EMERGENCY_CONTACTS} emergency contacts`)
    .default([]),
  /** Omitted keeps the saved places as they are. */
  places: z
    .array(placeSchema, { error: "places must be a list" })
    .max(MAX_PLACES, `You can save up to ${MAX_PLACES} places`)
    .optional(),
});

export const EvaluatePlansBodySchema = z.object({
  campus: areaId,
  scenario,
  plans: z
    .array(
      z.object({
        id: z.string({ error: "Each plan needs an id" }).min(1).max(40),
        activity: z.enum(ACTIVITY_IDS, {
          error: (issue) => `Unknown activity: ${String(issue.input)}`,
        }),
        durationMinutes: z
          .number({ error: "durationMinutes must be a number" })
          .int()
          .min(5, "durationMinutes must be between 5 and 600")
          .max(600, "durationMinutes must be between 5 and 600"),
        sensitive: z.boolean().optional(),
      }),
      { error: "plans must be a list" }
    )
    .min(1, "Add at least one plan")
    .max(MAX_PLANS, `At most ${MAX_PLANS} plans`),
});
