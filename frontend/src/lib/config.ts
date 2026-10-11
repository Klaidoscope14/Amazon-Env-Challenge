/*
 * Deployment settings, always supplied at build time (see .env.example) and
 * never defaulted to a particular stack in code. next.config.ts stops the
 * build if one is missing.
 *
 * NEXT_PUBLIC_API_URL: the API base URL. An empty value means "same site":
 * the CloudFront-hosted build calls /api/... on its own origin.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Cognito user pool and app client for SRP sign-in (public identifiers, not secrets). */
export const COGNITO_USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
export const COGNITO_CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
