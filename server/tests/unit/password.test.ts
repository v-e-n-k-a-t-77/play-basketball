import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("passwords", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword("Secret123");

    expect(hash).not.toContain("Secret123");
  });

  it("uses the bcrypt cost from the environment", async () => {
    const hash = await hashPassword("Secret123");

    expect(hash.startsWith("$2b$04$")).toBe(true);
  });

  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Secret123");

    await expect(verifyPassword("Secret123", hash)).resolves.toBe(true);
    await expect(verifyPassword("Secret124", hash)).resolves.toBe(false);
  });

  it("gives two different hashes for the same password (salt)", async () => {
    const first = await hashPassword("Secret123");
    const second = await hashPassword("Secret123");

    expect(first).not.toBe(second);
  });
});
