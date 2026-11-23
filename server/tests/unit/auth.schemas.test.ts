import { describe, expect, it } from "vitest";
import { registerSchema } from "../../src/modules/auth/auth.schemas.js";

function issuesFor(input: unknown) {
  const result = registerSchema.safeParse(input);
  if (result.success) throw new Error("Expected validation to fail");
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

describe("registerSchema", () => {
  it("cleans name and email", () => {
    const result = registerSchema.parse({
      name: "  Ravi Kumar ",
      email: "  Ravi@Example.COM ",
      password: "Secret123",
    });

    expect(result).toEqual({
      name: "Ravi Kumar",
      email: "ravi@example.com",
      password: "Secret123",
    });
  });

  it("reports every bad field", () => {
    const paths = issuesFor({ name: "R", email: "nope", password: "short" }).map((i) => i.path);

    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("requires a letter in the password", () => {
    const messages = issuesFor({ name: "Ravi", email: "a@b.co", password: "12345678" }).map(
      (i) => i.message,
    );

    expect(messages).toContain("Password must contain a letter");
  });

  it("requires a digit in the password", () => {
    const messages = issuesFor({ name: "Ravi", email: "a@b.co", password: "abcdefgh" }).map(
      (i) => i.message,
    );

    expect(messages).toContain("Password must contain a digit");
  });

  it("rejects unknown keys such as role", () => {
    const issues = issuesFor({
      name: "Ravi",
      email: "a@b.co",
      password: "Secret123",
      role: "ADMIN",
    });

    expect(issues[0]?.message).toContain("role");
  });

  it("rejects a password over 72 characters", () => {
    const messages = issuesFor({
      name: "Ravi",
      email: "a@b.co",
      password: "Secret123".padEnd(80, "x"),
    }).map((i) => i.message);

    expect(messages).toContain("Password must be at most 72 characters");
  });
});
