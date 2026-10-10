import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
  type ICognitoStorage,
} from "amazon-cognito-identity-js";
import { ApiError } from "./api";
import { COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID } from "./config";

/*
 * Sign-in with Cognito's Secure Remote Password (SRP) protocol, straight from
 * the browser: the password is used to compute a proof locally and is never
 * sent to Cognito or to BreatheSafe's API. Accounts with two-step
 * verification answer a TOTP challenge afterwards.
 */

export interface SessionTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export type SignInOutcome =
  | { status: "signed-in"; tokens: SessionTokens }
  | { status: "mfa-required"; submitCode: (code: string) => Promise<SessionTokens> };

// The app stores tokens itself (lib/auth.tsx); keep the library's copy in memory only.
class MemoryStorage implements ICognitoStorage {
  private data = new Map<string, string>();
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const storage = new MemoryStorage();
let pool: CognitoUserPool | null = null;

function userPool(): CognitoUserPool {
  pool ??= new CognitoUserPool({
    UserPoolId: COGNITO_USER_POOL_ID,
    ClientId: COGNITO_CLIENT_ID,
    Storage: storage,
    AdvancedSecurityDataCollectionFlag: false,
  });
  return pool;
}

function toTokens(session: CognitoUserSession): SessionTokens {
  return {
    accessToken: session.getAccessToken().getJwtToken(),
    idToken: session.getIdToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  };
}

/** Cognito errors as ApiErrors with the same messages/codes the API uses. */
export function toApiError(err: unknown, step: "password" | "mfa"): ApiError {
  const name = (err as { code?: string; name?: string })?.code ?? (err as Error)?.name ?? "";
  switch (name) {
    case "UserNotConfirmedException":
      return new ApiError("Please verify your email before signing in.", 403, "USER_NOT_CONFIRMED");
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return step === "mfa"
        ? new ApiError("Your sign-in attempt expired. Please sign in again.", 401, "SESSION_EXPIRED")
        : new ApiError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
    case "CodeMismatchException":
    case "EnableSoftwareTokenMFAException":
      // A challenge session can only be answered once, so a wrong code means signing in again.
      return new ApiError("That code is incorrect. Sign in again and enter the current code from your app.", 400, "INVALID_CODE");
    case "ExpiredCodeException":
      return new ApiError("Your sign-in attempt expired. Please sign in again.", 401, "SESSION_EXPIRED");
    case "PasswordResetRequiredException":
      return new ApiError("You need to reset your password before signing in.", 403, "PASSWORD_RESET_REQUIRED");
    case "TooManyRequestsException":
    case "LimitExceededException":
    case "TooManyFailedAttemptsException":
      return new ApiError("Too many attempts. Please wait and try again.", 429, "TOO_MANY_ATTEMPTS");
    default:
      return new ApiError("Sign-in failed. Please try again.", 500);
  }
}

export function srpSignIn(email: string, password: string): Promise<SignInOutcome> {
  const user = new CognitoUser({ Username: email.trim(), Pool: userPool(), Storage: storage });
  const details = new AuthenticationDetails({ Username: email.trim(), Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({ status: "signed-in", tokens: toTokens(session) }),
      onFailure: (err) => reject(toApiError(err, "password")),
      totpRequired: () =>
        resolve({
          status: "mfa-required",
          submitCode: (code) =>
            new Promise((done, fail) => {
              user.sendMFACode(
                code,
                {
                  onSuccess: (session) => done(toTokens(session)),
                  onFailure: (err) => fail(toApiError(err, "mfa")),
                },
                "SOFTWARE_TOKEN_MFA"
              );
            }),
        }),
      // The pool only offers TOTP; anything else is unexpected for this app.
      mfaRequired: () => reject(new ApiError("This sign-in method isn't supported.", 400)),
      newPasswordRequired: () =>
        reject(new ApiError("You need to set a new password. Use “Forgot password?”.", 403, "PASSWORD_RESET_REQUIRED")),
    });
  });
}
