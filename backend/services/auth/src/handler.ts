import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  RevokeTokenCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  ConfirmBodySchema,
  EmailBodySchema,
  MfaCodeBodySchema,
  parse,
  ResetPasswordBodySchema,
  RefreshBodySchema,
  SignUpBodySchema,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { header, parseJsonBody, respond } from "../../../shared/src/http.js";
import { errorFields, log } from "../../../shared/src/observability.js";

const cognito = new CognitoIdentityProviderClient({});
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    // Sign-in itself happens in the browser with SRP, directly against Cognito
    // (the password never reaches this service); see frontend/src/lib/cognito.ts.
    if (method === "POST" && path.endsWith("/mfa/setup")) return await mfaSetup(event);
    if (method === "POST" && path.endsWith("/mfa/enable")) return await mfaEnable(event);
    if (method === "POST" && path.endsWith("/mfa/disable")) return await mfaDisable(event);
    if (method === "POST" && path.endsWith("/signup")) return await signUp(event);
    if (method === "POST" && path.endsWith("/confirm")) return await confirmSignUp(event);
    if (method === "POST" && path.endsWith("/refresh")) return await refreshToken(event);
    if (method === "GET" && path.endsWith("/profile")) return await getProfile(event);
    if (method === "POST" && path.endsWith("/forgot-password")) return await forgotPassword(event);
    if (method === "POST" && path.endsWith("/reset-password")) return await resetPassword(event);
    if (method === "POST" && path.endsWith("/resend-code")) return await resendCode(event);
    if (method === "POST" && path.endsWith("/signout")) return await signOut(event);
    return respond(404, { error: "Not found" });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return respond(400, { error: err.message, code: "INVALID_INPUT" });
    }
    if (err instanceof Error && err.name === "MissingToken") {
      return respond(401, { error: err.message, code: "SIGN_IN_REQUIRED" });
    }
    const name = err instanceof Error ? err.name : "UnknownError";
    const mapped = COGNITO_ERRORS[name];
    if (mapped) {
      // Expected user errors: clear message, stable code, no internal details.
      const message = name === "InvalidPasswordException" && err instanceof Error ? err.message : mapped.message;
      return respond(mapped.status, { error: message, code: mapped.code });
    }
    log("error", "unhandled_error", { route: event.path, ...errorFields(err) });
    return respond(500, { error: "Authentication service error. Please try again." });
  }
}

// Cognito exceptions users can hit, mapped to HTTP status + a stable code the
// frontend can act on (e.g. send unconfirmed users to /verify).
const COGNITO_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  // Sign-in happens in the browser (SRP), so here "not authorized" means the
  // caller's access token is missing, expired or revoked.
  NotAuthorizedException: { status: 401, code: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." },
  UserNotFoundException: { status: 401, code: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." },
  UserNotConfirmedException: { status: 403, code: "USER_NOT_CONFIRMED", message: "Please verify your email before signing in." },
  UsernameExistsException: { status: 409, code: "ACCOUNT_EXISTS", message: "An account with this email already exists. Sign in instead." },
  InvalidPasswordException: { status: 400, code: "INVALID_PASSWORD", message: "Password does not meet the requirements." },
  InvalidParameterException: { status: 400, code: "INVALID_INPUT", message: "Some details are invalid. Please check and try again." },
  CodeMismatchException: { status: 400, code: "INVALID_CODE", message: "That verification code is incorrect." },
  ExpiredCodeException: { status: 400, code: "EXPIRED_CODE", message: "That verification code has expired. Request a new one." },
  LimitExceededException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
  TooManyRequestsException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
  TooManyFailedAttemptsException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
  EnableSoftwareTokenMFAException: { status: 400, code: "INVALID_CODE", message: "That code is incorrect. Check your authenticator app and try again." },
};

async function signUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Only email, password and name are accepted: users can't self-assign a role.
  const { email, password, name } = parse(SignUpBodySchema, parseJsonBody(event));

  await cognito.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "name", Value: name },
      ],
    })
  );

  return respond(200, {
    message: "Sign up successful. Check your email for a verification code.",
    email,
  });
}

async function confirmSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email, code } = parse(ConfirmBodySchema, parseJsonBody(event));

  await cognito.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    })
  );

  return respond(200, { message: "Email verified. You can now sign in." });
}


async function refreshToken(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { refreshToken } = parse(RefreshBodySchema, parseJsonBody(event));

  const result = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
  );

  const auth = result.AuthenticationResult;

  return respond(200, {
    accessToken: auth?.AccessToken,
    idToken: auth?.IdToken,
    expiresIn: auth?.ExpiresIn,
  });
}

/** The caller's Cognito access token ("Authorization: Bearer <token>"). */
function accessToken(event: APIGatewayProxyEvent): string | null {
  const value = header(event, "Authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() || null : null;
}

async function getProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token = accessToken(event);

  if (!token) {
    return respond(401, { error: "Authorization token required" });
  }

  const result = await cognito.send(
    new GetUserCommand({ AccessToken: token })
  );

  const attributes: Record<string, string> = {};
  for (const attr of result.UserAttributes || []) {
    if (attr.Name && attr.Value) attributes[attr.Name] = attr.Value;
  }

  return respond(200, {
    email: attributes.email,
    name: attributes.name,
    role: attributes["custom:role"],
    mfaEnabled: (result.UserMFASettingList ?? []).includes("SOFTWARE_TOKEN_MFA"),
  });
}

// Same answer whether or not the account exists, so the endpoint can't be
// used to discover registered emails (the pool also prevents existence errors).
const RESET_SENT = "If an account exists for this email, we've sent a code to reset the password.";

async function forgotPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email } = parse(EmailBodySchema, parseJsonBody(event));
  try {
    await cognito.send(new ForgotPasswordCommand({ ClientId: CLIENT_ID, Username: email }));
  } catch (err) {
    if ((err as Error).name !== "UserNotFoundException") throw err;
  }
  return respond(200, { message: RESET_SENT });
}

async function resetPassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email, code, password } = parse(ResetPasswordBodySchema, parseJsonBody(event));
  await cognito.send(
    new ConfirmForgotPasswordCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: password,
    })
  );
  return respond(200, { message: "Password changed. You can now sign in." });
}

async function resendCode(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email } = parse(EmailBodySchema, parseJsonBody(event));
  try {
    await cognito.send(new ResendConfirmationCodeCommand({ ClientId: CLIENT_ID, Username: email }));
  } catch (err) {
    if ((err as Error).name !== "UserNotFoundException") throw err;
  }
  return respond(200, { message: "If this email needs verifying, we've sent a new code." });
}

/**
 * Revokes the refresh token (and the tokens issued from it), so a copied
 * session can't be refreshed after sign-out. Best-effort: the client clears
 * its tokens either way.
 */
async function signOut(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { refreshToken } = parse(RefreshBodySchema, parseJsonBody(event));
  try {
    await cognito.send(new RevokeTokenCommand({ ClientId: CLIENT_ID, Token: refreshToken }));
  } catch (err) {
    console.warn(JSON.stringify({ event: "token_revoke_failed", error: (err as Error).name }));
  }
  return respond(200, { message: "Signed out." });
}

// ---- Two-step verification (TOTP authenticator apps) -----------------------

function requireAccessToken(event: APIGatewayProxyEvent): string {
  const token = accessToken(event);
  if (!token) throw Object.assign(new Error("Please sign in to continue."), { name: "MissingToken" });
  return token;
}

/** Starts setup: a new secret for the user's authenticator app (shown once, as text and QR). */
async function mfaSetup(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token = requireAccessToken(event);
  const [{ SecretCode }, user] = await Promise.all([
    cognito.send(new AssociateSoftwareTokenCommand({ AccessToken: token })),
    cognito.send(new GetUserCommand({ AccessToken: token })),
  ]);
  const email = user.UserAttributes?.find((a) => a.Name === "email")?.Value ?? "account";
  const label = encodeURIComponent(`VayuSaathi:${email}`);
  return respond(200, {
    secret: SecretCode,
    otpauthUri: `otpauth://totp/${label}?secret=${SecretCode}&issuer=VayuSaathi`,
  });
}

/** Confirms setup with a first code, then makes TOTP required at every sign-in. */
async function mfaEnable(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token = requireAccessToken(event);
  const { code } = parse(MfaCodeBodySchema, parseJsonBody(event));
  const verified = await cognito.send(
    new VerifySoftwareTokenCommand({ AccessToken: token, UserCode: code, FriendlyDeviceName: "Authenticator app" })
  );
  if (verified.Status !== "SUCCESS") {
    return respond(400, { error: "That code is incorrect. Check your authenticator app and try again.", code: "INVALID_CODE" });
  }
  await cognito.send(
    new SetUserMFAPreferenceCommand({
      AccessToken: token,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    })
  );
  return respond(200, { message: "Two-step verification is on.", mfaEnabled: true });
}

async function mfaDisable(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token = requireAccessToken(event);
  await cognito.send(
    new SetUserMFAPreferenceCommand({
      AccessToken: token,
      SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
    })
  );
  return respond(200, { message: "Two-step verification is off.", mfaEnabled: false });
}
