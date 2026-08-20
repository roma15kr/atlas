import { describe, expect, it } from "vitest";
import { ApiError } from "../errors";
import type { AuthContext } from "../types";
import { assertTeamCreationPolicy, teamMemberInputSchema } from "./team";

const departmentId = "33333333-3333-4333-8333-333333333333";
const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  departmentId,
  username: "director",
  role: "DIRECTOR"
};

const validInput = {
  username: "New.User",
  password: "SecureAtlas1!",
  role: "EMPLOYEE" as const,
  fullName: "New User",
  departmentId
};

describe("team member input", () => {
  it("normalizes a valid username and accepts a strong password", () => {
    const parsed = teamMemberInputSchema.parse(validInput);
    expect(parsed.username).toBe("new.user");
    expect(parsed.password).toBe(validInput.password);
  });

  it("rejects weak passwords", () => {
    expect(teamMemberInputSchema.safeParse({ ...validInput, password: "alllowercase" }).success).toBe(false);
  });

  it("rejects ambiguous department input", () => {
    expect(teamMemberInputSchema.safeParse({ ...validInput, departmentName: "Sales" }).success).toBe(false);
  });
});

describe("team creation policy", () => {
  it("lets directors create a manager in a new department", () => {
    const input = teamMemberInputSchema.parse({
      ...validInput,
      role: "MANAGER",
      departmentId: undefined,
      departmentName: "Enterprise Sales"
    });
    expect(() => assertTeamCreationPolicy(auth, input)).not.toThrow();
  });

  it("limits managers to employees in their own department", () => {
    const manager = { ...auth, role: "MANAGER" as const };
    expect(() => assertTeamCreationPolicy(manager, teamMemberInputSchema.parse(validInput))).not.toThrow();
    expectPolicyError(manager, { ...validInput, role: "MANAGER" }, "MANAGER_EMPLOYEE_ONLY");
    expectPolicyError(manager, {
      ...validInput,
      departmentId: "44444444-4444-4444-8444-444444444444"
    }, "INVALID_DEPARTMENT");
  });

  it("requires a department when a director creates a manager or employee", () => {
    expectPolicyError(auth, { ...validInput, departmentId: undefined }, "DEPARTMENT_REQUIRED");
  });

  it("prevents employees from creating accounts", () => {
    expectPolicyError({ ...auth, role: "EMPLOYEE" }, validInput, "FORBIDDEN");
  });
});

function expectPolicyError(
  actor: AuthContext,
  input: Parameters<typeof teamMemberInputSchema.parse>[0],
  code: string
): void {
  try {
    assertTeamCreationPolicy(actor, teamMemberInputSchema.parse(input));
    throw new Error("Expected policy to reject input");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}
