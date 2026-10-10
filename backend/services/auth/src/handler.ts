import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  AdminUpdateUserAttributesCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  RevokeTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  ConfirmBodySchema,
  EmailBodySchema,
  parse,
  ResetPasswordBodySchema,
  RefreshBodySchema,
  SignInBodySchema,
  SignUpBodySchema,
  ValidationError,
} from "../../../shared/src/schemas.js";
import { parseJsonBody, respond } from "../../../shared/src/http.js";
import { errorFields, log } from "../../../shared/src/observability.js";

const cognito = new CognitoIdentityProviderClient({});
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const USER_POOL_ID = process.env.USER_POOL_ID!;

/**
 * Grants the server-controlled "admin" role to a verified administrator
 * account. Users cannot self-assign it (custom:role is not a writable
 * attribute), so the write routes — which require role === "admin" — can only
 * be reached by accounts the server has deliberately promoted. In the MVP every
 * self-registered, email-verified account is promoted here; to restrict access,
 * remove this call and promote accounts manually (e.g. via the Cognito console).
 *
 * Best-effort: a failure never blocks sign-up/sign-in. The role check simply
 * denies alert actions until the attribute is set (e.g. on the next sign-in).
 */
async function grantAdminRole(username: string): Promise<void> {
  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: "custom:role", Value: "admin" }],
      })
    );
  } catch (err) {
    log("error", "grant_role_failed", errorFields(err));
  }
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const path = event.path;
  const method = event.httpMethod;

  try {
    if (method === "POST" && path.endsWith("/signup")) return await signUp(event);
    if (method === "POST" && path.endsWith("/confirm")) return await confirmSignUp(event);
    if (method === "POST" && path.endsWith("/signin")) return await signIn(event);
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
  NotAuthorizedException: { status: 401, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
  UserNotFoundException: { status: 401, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
  UserNotConfirmedException: { status: 403, code: "USER_NOT_CONFIRMED", message: "Please verify your email before signing in." },
  UsernameExistsException: { status: 409, code: "ACCOUNT_EXISTS", message: "An account with this email already exists. Sign in instead." },
  InvalidPasswordException: { status: 400, code: "INVALID_PASSWORD", message: "Password does not meet the requirements." },
  InvalidParameterException: { status: 400, code: "INVALID_INPUT", message: "Some details are invalid. Please check and try again." },
  CodeMismatchException: { status: 400, code: "INVALID_CODE", message: "That verification code is incorrect." },
  ExpiredCodeException: { status: 400, code: "EXPIRED_CODE", message: "That verification code has expired. Request a new one." },
  LimitExceededException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
  TooManyRequestsException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
  TooManyFailedAttemptsException: { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait and try again." },
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

  // Promote the new account to the admin role (server-side only).
  await grantAdminRole(email);

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

async function signIn(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email, password } = parse(SignInBodySchema, parseJsonBody(event));

  // Ensure the role claim is present before the ID token is minted below. This
  // also back-fills accounts created before role enforcement existed.
  await grantAdminRole(email);

  const result = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
  );

  const auth = result.AuthenticationResult;

  return respond(200, {
    message: "Sign in successful",
    accessToken: auth?.AccessToken,
    idToken: auth?.IdToken,
    refreshToken: auth?.RefreshToken,
    expiresIn: auth?.ExpiresIn,
  });
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

async function getProfile(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const token =
    event.headers?.Authorization?.replace("Bearer ", "") ||
    event.headers?.authorization?.replace("Bearer ", "");

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
