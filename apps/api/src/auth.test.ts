import { describe, expect, it } from "vitest";
import { hashRefreshToken, signAccessToken, verifyAccessToken } from "./auth";
import type { AuthContext } from "./types";

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  departmentId: "33333333-3333-4333-8333-333333333333",
  username: "manager",
  role: "MANAGER"
};

describe("access tokens", () => {
  it("round-trips validated claims", () => {
    expect(verifyAccessToken(signAccessToken(auth))).toEqual(auth);
  });

  it("rejects malformed tokens", () => {
    expect(() => verifyAccessToken("not-a-jwt")).toThrow("invalid or expired");
  });
});

describe("refresh token hashing", () => {
  it("is deterministic without retaining the raw token", () => {
    const hash = hashRefreshToken("sample-refresh-token");
    expect(hash).toBe(hashRefreshToken("sample-refresh-token"));
    expect(hash).not.toContain("sample-refresh-token");
    expect(hash).toHaveLength(64);
  });
});
