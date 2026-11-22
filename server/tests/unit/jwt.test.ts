import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../src/config/env.js";
import { AppError } from "../../src/lib/errors.js";
import { signAccessToken, verifyAccessToken } from "../../src/lib/jwt.js";

function failure(fn: () => unknown): AppError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Expected the function to throw");
}

const user = { id: randomUUID(), role: "PLAYER" as const, emailVerified: true };

describe("access tokens", () => {
  it("round-trips a user", () => {
    const token = signAccessToken(user);

    expect(verifyAccessToken(token)).toEqual(user);
  });

  it("rejects a token with a changed payload", () => {
    const [header, , signature] = signAccessToken(user).split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: user.id, role: "ADMIN", ver: true }),
    ).toString("base64url");

    const err = failure(() => verifyAccessToken(`${header}.${forgedPayload}.${signature}`));

    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a token signed with another secret", () => {
    const token = jwt.sign({ role: "PLAYER", ver: true }, "some-other-secret-some-other-secret", {
      algorithm: "HS256",
      subject: user.id,
    });

    expect(failure(() => verifyAccessToken(token)).code).toBe("UNAUTHENTICATED");
  });

  it("rejects a token that uses another algorithm", () => {
    const token = jwt.sign({ role: "PLAYER", ver: true }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS512",
      subject: user.id,
    });

    expect(failure(() => verifyAccessToken(token)).code).toBe("UNAUTHENTICATED");
  });

  it("reports an expired token as TOKEN_EXPIRED", () => {
    const token = jwt.sign({ role: "PLAYER", ver: true }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: -10,
    });

    const err = failure(() => verifyAccessToken(token));

    expect(err.status).toBe(401);
    expect(err.code).toBe("TOKEN_EXPIRED");
  });

  it("rejects garbage", () => {
    expect(failure(() => verifyAccessToken("not-a-jwt")).code).toBe("UNAUTHENTICATED");
  });
});
