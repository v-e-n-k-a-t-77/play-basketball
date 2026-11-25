import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/db/pool.js";
import { hashToken } from "../../src/lib/crypto.js";
import { verifyAccessToken } from "../../src/lib/jwt.js";
import { createUser, resetDb } from "../factories.js";

beforeEach(resetDb);
afterAll(() => pool.end());

const PASSWORD = "Secret123";

function login(body: unknown) {
  return request(createApp())
    .post("/api/v1/auth/login")
    .send(body as object);
}

function refreshCookieOf(res: request.Response): string {
  const cookie = (res.get("Set-Cookie") ?? []).find((c) => c.startsWith("pb_rt="));
  if (!cookie) throw new Error("No refresh cookie was set");
  return cookie;
}

function tokenOf(cookie: string): string {
  return cookie.split(";")[0]!.slice("pb_rt=".length);
}

describe("POST /api/v1/auth/login", () => {
  it("returns an access token and sets an HttpOnly refresh cookie", async () => {
    const user = await createUser({ password: PASSWORD });

    const res = await login({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(verifyAccessToken(res.body.accessToken)).toEqual({
      id: user.id,
      role: "PLAYER",
      emailVerified: true,
    });
    expect(res.body.user.email).toBe(user.email);
    expect(res.headers["cache-control"]).toBe("no-store");

    const cookie = refreshCookieOf(res);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toMatch(/Max-Age=259\d{4}/);
  });

  it("stores only the hash of the refresh token and never returns it in the body", async () => {
    const user = await createUser({ password: PASSWORD });

    const res = await login({ email: user.email, password: PASSWORD });
    const token = tokenOf(refreshCookieOf(res));

    expect(token).toHaveLength(86);
    expect(JSON.stringify(res.body)).not.toContain(token);

    const { rows } = await pool.query("SELECT * FROM refresh_tokens");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].user_id).toBe(user.id);
    expect(rows[0].revoked_at).toBeNull();
  });

  it("records the last login time", async () => {
    const user = await createUser({ password: PASSWORD });

    await login({ email: user.email, password: PASSWORD });

    const { rows } = await pool.query("SELECT last_login_at FROM users WHERE id = $1", [user.id]);
    expect(rows[0].last_login_at).not.toBeNull();
  });

  it("lets an unverified user log in", async () => {
    const user = await createUser({ password: PASSWORD, verified: false });

    const res = await login({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(false);
    expect(verifyAccessToken(res.body.accessToken).emailVerified).toBe(false);
  });

  it("accepts the email in other capitals", async () => {
    const user = await createUser({ password: PASSWORD });

    const res = await login({ email: user.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(200);
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    const user = await createUser({ password: PASSWORD });

    const wrongPassword = await login({ email: user.email, password: "Wrong12345" });
    const unknownEmail = await login({ email: "nobody@test.dev", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmail.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.get("Set-Cookie")).toBeUndefined();
  });

  it("rejects a user who has no password", async () => {
    const user = await createUser();

    const res = await login({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it("returns 403 for a banned user with the right password, but not with a wrong one", async () => {
    const user = await createUser({ password: PASSWORD });
    await pool.query("UPDATE users SET is_banned = true WHERE id = $1", [user.id]);

    const right = await login({ email: user.email, password: PASSWORD });
    const wrong = await login({ email: user.email, password: "Wrong12345" });

    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe("ACCOUNT_BANNED");
    expect(right.get("Set-Cookie")).toBeUndefined();
    expect(wrong.status).toBe(401);
  });

  it("starts a separate token family for each login", async () => {
    const user = await createUser({ password: PASSWORD });

    await login({ email: user.email, password: PASSWORD });
    await login({ email: user.email, password: PASSWORD });

    const { rows } = await pool.query("SELECT DISTINCT family_id FROM refresh_tokens");
    expect(rows).toHaveLength(2);
  });

  it("returns 400 when the password is missing", async () => {
    const res = await login({ email: "someone@test.dev" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
