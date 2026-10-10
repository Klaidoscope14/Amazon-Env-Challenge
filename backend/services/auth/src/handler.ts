import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;

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
    return respond(404, { error: "Not found" });
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      return respond(400, { error: "Request body must be valid JSON" });
    }
    const name = err instanceof Error ? err.name : "UnknownError";
    const mapped = COGNITO_ERRORS[name];
    if (mapped) {
      // Expected user errors: clear message, stable code, no internal details.
      const message = name === "InvalidPasswordException" && err instanceof Error ? err.message : mapped.message;
      return respond(mapped.status, { error: message, code: mapped.code });
    }
    console.error("Auth error:", err);
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
  // Role is not accepted at sign-up: users can't self-assign one.
  const { email, password, name, institution } = JSON.parse(event.body || "{}");

  if (!email || !password || !name) {
    return respond(400, { error: "email, password, and name are required" });
  }

  const userAttributes = [
    { Name: "email", Value: email },
    { Name: "name", Value: name },
  ];
  if (institution) userAttributes.push({ Name: "custom:institution", Value: String(institution).slice(0, 100) });

  await cognito.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: userAttributes,
    })
  );

  return respond(200, {
    message: "Sign up successful. Check your email for a verification code.",
    email,
  });
}

async function confirmSignUp(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { email, code } = JSON.parse(event.body || "{}");

  if (!email || !code) {
    return respond(400, { error: "email and code are required" });
  }

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
  const { email, password } = JSON.parse(event.body || "{}");

  if (!email || !password) {
    return respond(400, { error: "email and password are required" });
  }

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
  const { refreshToken } = JSON.parse(event.body || "{}");

  if (!refreshToken) {
    return respond(400, { error: "refreshToken is required" });
  }

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
    institution: attributes["custom:institution"],
    role: attributes["custom:role"],
  });
}

function respond(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
}
