import type { PreTokenGenerationTriggerEvent } from "aws-lambda";

/*
 * Cognito Pre Token Generation trigger: puts the "custom:role" claim into
 * every ID token Cognito issues — after SRP sign-in, MFA and token refresh —
 * so the alert write routes (which require role "admin") work however the
 * user signed in, without the server ever seeing the password.
 *
 * custom:role isn't writable by users (see the app client's WriteAttributes),
 * so a stored value can only have been set by an administrator. Accounts
 * without one get DEFAULT_ROLE: today every verified account may share
 * alerts. To restrict that, set DEFAULT_ROLE to e.g. "member" and promote
 * accounts by setting custom:role=admin in the Cognito console.
 */
export const DEFAULT_ROLE = "admin";

export async function handler(
  event: PreTokenGenerationTriggerEvent
): Promise<PreTokenGenerationTriggerEvent> {
  const stored = event.request.userAttributes?.["custom:role"];
  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: { "custom:role": stored || DEFAULT_ROLE },
    },
  };
  return event;
}
