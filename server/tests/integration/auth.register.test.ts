import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool.js";
import { createApp } from "../../src/app.js";
import { resetDb } from "../factories.js";

beforeEach(resetDb);
afterAll(() => pool.end());

const valid = { name: "Ravi Kumar", email: "ravi@example.com", password: "Secret123" };

function register(body: unknown) {
  return request(createApp())
    .post("/api/v1/auth/register")
    .send(body as object);
}

describe("POST /api/v1/auth/register", () => {
  it("creates an unverified user and never returns the password", async () => {
    const res = await register(valid);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: "Ravi Kumar",
      email: "ravi@example.com",
      role: "PLAYER",
      emailVerified: false,
    });
    expect(JSON.stringify(res.body)).not.toContain("Secret123");
    expect(res.body.user).not.toHaveProperty("password_hash");
  });

  it("stores a bcrypt hash, a profile and a hashed verification token", async () => {
    await register(valid);

    const { rows: users } = await pool.query("SELECT id, password_hash FROM users");
    expect(users).toHaveLength(1);
    expect(users[0].password_hash).toMatch(/^\$2b\$/);

    const { rows: profiles } = await pool.query("SELECT user_id FROM player_profiles");
    expect(profiles).toHaveLength(1);

    const { rows: tokens } = await pool.query("SELECT type, token_hash FROM email_tokens");
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe("VERIFY_EMAIL");
    expect(tokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lowercases the email", async () => {
    const res = await register({ ...valid, email: "  Ravi@Example.COM " });

    expect(res.body.user.email).toBe("ravi@example.com");
  });

  it("returns 409 EMAIL_TAKEN for a duplicate email, even in other capitals", async () => {
    await register(valid);

    const res = await register({ ...valid, email: "RAVI@EXAMPLE.COM" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("returns 400 for a weak password and creates nothing", async () => {
    const res = await register({ ...valid, password: "12345678" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.fields[0].path).toBe("password");

    const { rows } = await pool.query("SELECT id FROM users");
    expect(rows).toHaveLength(0);
  });

  it("rejects unknown fields such as role", async () => {
    const res = await register({ ...valid, role: "ADMIN" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("lets exactly one of five simultaneous registrations win", async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => register(valid)));

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);

    const { rows } = await pool.query("SELECT id FROM users");
    expect(rows).toHaveLength(1);
  });
});
