import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/db/pool.js";
import { hashToken } from "../../src/lib/crypto.js";
import { verifyAccessToken } from "../../src/lib/jwt.js";
import { cookieValue, createUser, loginAs, resetDb } from "../factories.js";

beforeEach(resetDb);
afterAll(() => pool.end());

const PASSWORD = "Secret123";

function refresh(token?: string) {
  const req = request(createApp()).post("/api/v1/auth/refresh");
  return token ? req.set("Cookie", `pb_rt=${token}`) : req;
}

async function activeTokenCount(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM refresh_tokens WHERE revoked_at IS NULL",
  );
  return rows[0].n;
}

describe("POST /api/v1/auth/refresh", () => {
  it("rotates: revokes the old token and issues a new one in the same family", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken: oldToken } = await loginAs(user, PASSWORD);

    const res = await refresh(oldToken);

    expect(res.status).toBe(200);
    expect(verifyAccessToken(res.body.accessToken).id).toBe(user.id);
    const newToken = cookieValue(res);
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(oldToken);

    const { rows } = await pool.query("SELECT * FROM refresh_tokens ORDER BY created_at");
    expect(rows).toHaveLength(2);
    const [oldRow, newRow] = rows;
    expect(oldRow.token_hash).toBe(hashToken(oldToken));
    expect(oldRow.revoked_at).not.toBeNull();
    expect(oldRow.replaced_by).toBe(newRow.id);
    expect(newRow.token_hash).toBe(hashToken(newToken!));
    expect(newRow.revoked_at).toBeNull();
    expect(newRow.family_id).toBe(oldRow.family_id);
  });

  it("returns 401 NO_REFRESH_TOKEN without a cookie", async () => {
    const res = await refresh();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("NO_REFRESH_TOKEN");
  });

  it("returns 401 INVALID_REFRESH_TOKEN for an unknown token", async () => {
    const res = await refresh("this-token-was-never-issued");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("returns 401 INVALID_REFRESH_TOKEN for an expired token", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken } = await loginAs(user, PASSWORD);
    await pool.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'");

    const res = await refresh(refreshToken);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_REFRESH_TOKEN");
  });

  it("detects reuse: revokes the whole family, even the newest token", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken: stolen } = await loginAs(user, PASSWORD);
    const newest = cookieValue(await refresh(stolen))!;
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE token_hash = $1",
      [hashToken(stolen)],
    );

    const replay = await refresh(stolen);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    expect(await activeTokenCount()).toBe(0);
    expect((await refresh(newest)).status).toBe(401);
  });

  it("allows a replay within 10 seconds (two tabs) without a new cookie", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken } = await loginAs(user, PASSWORD);
    await refresh(refreshToken);

    const second = await refresh(refreshToken);

    expect(second.status).toBe(200);
    expect(verifyAccessToken(second.body.accessToken).id).toBe(user.id);
    expect(second.get("Set-Cookie")).toBeUndefined();
    expect(await activeTokenCount()).toBe(1);
  });

  it("lets exactly one of five simultaneous refreshes rotate the token", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken } = await loginAs(user, PASSWORD);

    const responses = await Promise.all(Array.from({ length: 5 }, () => refresh(refreshToken)));

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses.filter((r) => cookieValue(r) !== undefined)).toHaveLength(1);
    const { rows } = await pool.query("SELECT id FROM refresh_tokens");
    expect(rows).toHaveLength(2);
    expect(await activeTokenCount()).toBe(1);
  });

  it("only revokes the family that was reused, not the user's other logins", async () => {
    const user = await createUser({ password: PASSWORD });
    const first = await loginAs(user, PASSWORD);
    const second = await loginAs(user, PASSWORD);
    await refresh(first.refreshToken);
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE token_hash = $1",
      [hashToken(first.refreshToken)],
    );

    expect((await refresh(first.refreshToken)).status).toBe(401);

    expect((await refresh(second.refreshToken)).status).toBe(200);
  });

  it("refuses a banned user and revokes the family", async () => {
    const user = await createUser({ password: PASSWORD });
    const { refreshToken } = await loginAs(user, PASSWORD);
    await pool.query("UPDATE users SET is_banned = true WHERE id = $1", [user.id]);

    const res = await refresh(refreshToken);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_BANNED");
    expect(await activeTokenCount()).toBe(0);
  });

  it("puts the current verification status into the new access token", async () => {
    const user = await createUser({ password: PASSWORD, verified: false });
    const { refreshToken } = await loginAs(user, PASSWORD);
    await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [user.id]);

    const res = await refresh(refreshToken);

    expect(verifyAccessToken(res.body.accessToken).emailVerified).toBe(true);
  });
});
