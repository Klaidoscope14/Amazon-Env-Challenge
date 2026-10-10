import { describe, expect, it } from "vitest";
import type { PreTokenGenerationTriggerEvent } from "aws-lambda";
import { handler, DEFAULT_ROLE } from "../services/auth/src/pre-token.js";

const event = (attributes: Record<string, string>) =>
  ({
    triggerSource: "TokenGeneration_Authentication",
    request: { userAttributes: attributes, groupConfiguration: {} },
    response: {},
  }) as unknown as PreTokenGenerationTriggerEvent;

describe("pre token generation trigger", () => {
  it("gives every verified account the default role", async () => {
    const out = await handler(event({ email: "a@b.co", email_verified: "true" }));
    expect(out.response.claimsOverrideDetails?.claimsToAddOrOverride).toEqual({ "custom:role": DEFAULT_ROLE });
    expect(DEFAULT_ROLE).toBe("admin");
  });

  it("keeps a role an administrator stored on the account", async () => {
    const out = await handler(event({ email: "a@b.co", "custom:role": "member" }));
    expect(out.response.claimsOverrideDetails?.claimsToAddOrOverride).toEqual({ "custom:role": "member" });
  });
});
