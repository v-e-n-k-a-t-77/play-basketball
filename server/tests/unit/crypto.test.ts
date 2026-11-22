import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "../../src/lib/crypto.js";

describe("generateToken", () => {
  it("makes URL-safe tokens of the expected length", () => {
    const token = generateToken(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(43);
  });

  it("never repeats", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("hashToken", () => {
  it("is a 64-character hex string", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same hash for the same token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("gives different hashes for different tokens", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});
