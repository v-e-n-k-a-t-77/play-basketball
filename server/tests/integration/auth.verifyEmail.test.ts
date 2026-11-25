import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/db/pool.js";
import { sentEmails } from "../../src/emails/mailer.js";
import { generateToken } from "../../src/lib/crypto.js";
import { resetDb, tokenFromLink } from "../factories.js";

beforeEach(async () => {
  await resetDb();
  sentEmails.length = 0;
});
afterAll(() => pool.end());

async function registerAndGetToken(): Promise<string> {
  await request(createApp())
    .post("/api/v1/auth/register")
    .send({ name: "Ravi Kumar", email: "ravi@example.com", password: "Secret123" });
  return tokenFromLink(sentEmails[0]!.text);
}

function verify(token: unknown) {
  return request(createApp()).post("/api/v1/auth/verify-email").send({ token });
}

describe("POST /api/v1/auth/verify-email", () => {
  it("verifies the user and marks the token as used", async () => {
    const token = await registerAndGetToken();

    const res = await verify(token);

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);

    const { rows: users } = await pool.query("SELECT email_verified_at FROM users");
    expect(users[0].email_verified_at).not.toBeNull();
    const { rows: tokens } = await pool.query("SELECT used_at FROM email_tokens");
    expect(tokens[0].used_at).not.toBeNull();
  });

  it("cannot be used a second time", async () => {
    const token = await registerAndGetToken();
    await verify(token);

    const res = await verify(token);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects a token nobody was given", async () => {
    await registerAndGetToken();

    const res = await verify(generateToken());

    expect(res.status).toBe(404);
  });

  it("rejects an expired token", async () => {
    const token = await registerAndGetToken();
    await pool.query("UPDATE email_tokens SET expires_at = now() - interval '1 minute'");

    const res = await verify(token);

    expect(res.status).toBe(404);
    const { rows } = await pool.query("SELECT email_verified_at FROM users");
    expect(rows[0].email_verified_at).toBeNull();
  });

  it("rejects a token of the wrong type", async () => {
    const token = await registerAndGetToken();
    await pool.query("UPDATE email_tokens SET type = 'RESET_PASSWORD'");

    const res = await verify(token);

    expect(res.status).toBe(404);
  });

  it("returns 400 when the token is missing", async () => {
    const res = await request(createApp()).post("/api/v1/auth/verify-email").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lets exactly one of five simultaneous uses succeed", async () => {
    const token = await registerAndGetToken();

    const responses = await Promise.all(Array.from({ length: 5 }, () => verify(token)));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 404, 404, 404, 404]);
  });
});
