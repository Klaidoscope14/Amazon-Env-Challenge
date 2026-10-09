export const STATUS_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; text: string }
> = {
  Good: {
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "Good",
  },
  Satisfactory: {
    color: "text-lime-700",
    bg: "bg-lime-50",
    border: "border-lime-200",
    text: "Satisfactory",
  },
  Moderate: {
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "Moderate",
  },
  Poor: {
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "Poor",
  },
  "Very Poor": {
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "Very Poor",
  },
  Severe: {
    color: "text-red-900",
    bg: "bg-red-100",
    border: "border-red-300",
    text: "Severe",
  },
};

export const AUDIENCE_OPTIONS = [
  { value: "all", label: "All (Students, Staff & Parents)" },
  { value: "students", label: "Students" },
  { value: "staff", label: "Staff" },
  { value: "parents", label: "Parents" },
] as const;

export const DECISION_OPTIONS = [
  "Moved activities indoors",
  "Cancelled outdoor events",
  "Sent advisory — monitoring",
  "No action needed",
] as const;

export const DEFAULT_CAMPUS = "dtu-delhi";
export const CAMPUS_DISPLAY_NAME = "Delhi Technological University";
