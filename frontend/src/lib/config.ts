/**
 * API base URL. Set NEXT_PUBLIC_API_URL (see .env.example) to point the app at
 * your own deployment. An empty value means "same site": the CloudFront-hosted
 * build calls /api/... on its own origin, which CloudFront routes to API
 * Gateway. Unset falls back to the project's public demo API.
 */
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
export const API_URL =
  configuredApiUrl === undefined
    ? "https://auzr0rreg6.execute-api.ap-south-1.amazonaws.com/prod"
    : configuredApiUrl.replace(/\/$/, "");

/**
 * Cognito user pool and app client for sign-in (SRP, straight from the
 * browser). Public identifiers, not secrets: stack outputs "UserPoolId" and
 * "UserPoolClientId". Defaults match the public demo API above.
 */
export const COGNITO_USER_POOL_ID =
  process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "ap-south-1_g1nAa94n7";
export const COGNITO_CLIENT_ID =
  process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "766d9jgdvjaeuitetda6ojgg2a";
