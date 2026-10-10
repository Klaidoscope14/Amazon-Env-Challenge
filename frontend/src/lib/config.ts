/**
 * API base URL. Set NEXT_PUBLIC_API_URL (see .env.example) to point the app at
 * your own deployment; the fallback is the project's public demo API.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://auzr0rreg6.execute-api.ap-south-1.amazonaws.com/prod";
