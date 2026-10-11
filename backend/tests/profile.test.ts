import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { parse, ProfileBodySchema, ValidationError } from "../shared/src/schemas.js";

process.env.PROFILES_TABLE_NAME = "profiles";
process.env.USER_POOL_CLIENT_ID = "client";

const name = (cmd: unknown) => (cmd as { constructor: { name: string } }).constructor.name;
const cognitoSend = vi.spyOn(CognitoIdentityProviderClient.prototype, "send");
const dbSend = vi.spyOn(DynamoDBClient.prototype, "send");
let stored: Record<string, unknown> | null = null;

beforeEach(() => {
  stored = null;
  cognitoSend.mockReset();
  cognitoSend.mockImplementation((async (cmd: unknown) => {
    if (name(cmd) === "GetUserCommand") {
      return {
        UserAttributes: [
          { Name: "sub", Value: "user-1" },
          { Name: "email", Value: "asha@example.com" },
          { Name: "name", Value: "Asha" },
        ],
        UserMFASettingList: [],
      };
    }
    return {};
  }) as never);
  dbSend.mockReset();
  dbSend.mockImplementation((async (cmd: { input: { Item?: Record<string, never> } }) => {
    if (name(cmd) === "GetItemCommand") return stored ? { Item: marshall(stored) } : {};
    if (name(cmd) === "PutItemCommand") stored = unmarshall(cmd.input.Item!);
    return {};
  }) as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const { handler: auth } = await import("../services/auth/src/handler.js");

function request(method: string, body?: unknown, token = "access"): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    path: "/api/v1/auth/profile",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body === undefined ? null : JSON.stringify(body),
    queryStringParameters: null,
  } as unknown as APIGatewayProxyEvent;
}
const json = (res: { body: string }) => JSON.parse(res.body);
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("profile validation", () => {
  it("normalises Indian mobile numbers to E.164", () => {
    const body = parse(ProfileBodySchema, {
      name: "Asha",
      phone: "098765 43210",
      emergencyContacts: [{ name: "Dad", phone: "+91 91234-56789", relation: "Father" }],
    });
    expect(body.phone).toBe("+919876543210");
    expect(body.emergencyContacts[0].phone).toBe("+919123456789");
  });

  it("rejects bad numbers, too many contacts and non-image photos", () => {
    expect(() => parse(ProfileBodySchema, { name: "A", phone: "12345" })).toThrow(ValidationError);
    const contacts = Array.from({ length: 6 }, (_, i) => ({ name: `C${i}`, phone: "9876543210" }));
    expect(() => parse(ProfileBodySchema, { name: "A", emergencyContacts: contacts })).toThrow(/up to 5/);
    expect(() => parse(ProfileBodySchema, { name: "A", avatar: "data:text/html;base64,PGI+" })).toThrow(/JPEG, PNG or WebP/);
    expect(() => parse(ProfileBodySchema, { name: " " })).toThrow(ValidationError);
  });
});

describe("GET/PUT /auth/profile", () => {
  it("requires sign-in", async () => {
    const res = await auth(request("GET", undefined, ""));
    expect(res.statusCode).toBe(401);
    expect(json(res).code).toBe("SIGN_IN_REQUIRED");
  });

  it("returns an empty profile for a new account", async () => {
    const res = await auth(request("GET"));
    expect(json(res)).toEqual({
      email: "asha@example.com",
      name: "Asha",
      mfaEnabled: false,
      emergencyContacts: [],
    });
  });

  it("saves details under the caller's own sub and renames them in Cognito", async () => {
    const res = await auth(
      request("PUT", {
        name: "Asha Verma",
        phone: "9876543210",
        addressLine1: "12 Lodhi Road",
        addressLine2: "New Delhi 110003",
        avatar: PHOTO,
        emergencyContacts: [{ name: "Dad", phone: "9123456789", relation: "Father" }],
      })
    );
    expect(res.statusCode).toBe(200);
    expect(json(res)).toMatchObject({
      name: "Asha Verma",
      phone: "+919876543210",
      addressLine1: "12 Lodhi Road",
      avatar: PHOTO,
      emergencyContacts: [{ name: "Dad", phone: "+919123456789", relation: "Father" }],
    });
    expect(stored).toMatchObject({ userId: "user-1", phone: "+919876543210" });
    const rename = cognitoSend.mock.calls.map(([c]) => c).find((c) => name(c) === "UpdateUserAttributesCommand");
    expect((rename as { input: unknown }).input).toEqual({
      AccessToken: "access",
      UserAttributes: [{ Name: "name", Value: "Asha Verma" }],
    });
  });

  it("keeps the photo when it isn't sent, and removes it when sent as null", async () => {
    stored = { userId: "user-1", avatar: PHOTO, emergencyContacts: [] };
    await auth(request("PUT", { name: "Asha" }));
    expect(stored).toMatchObject({ avatar: PHOTO });
    await auth(request("PUT", { name: "Asha", avatar: null }));
    expect(stored).not.toHaveProperty("avatar");
    // Name unchanged: Cognito is not asked to update it.
    expect(cognitoSend.mock.calls.some(([c]) => name(c) === "UpdateUserAttributesCommand")).toBe(false);
  });

  it("maps an expired session to 401", async () => {
    cognitoSend.mockRejectedValueOnce(Object.assign(new Error("expired"), { name: "NotAuthorizedException" }));
    const res = await auth(request("PUT", { name: "Asha" }));
    expect(res.statusCode).toBe(401);
    expect(json(res).code).toBe("SESSION_EXPIRED");
  });
});
