import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool, withTransaction } from "../../src/db/pool.js";
import * as usersRepo from "../../src/modules/users/users.repository.js";
import { resetDb } from "../factories.js";

beforeEach(resetDb);
afterAll(() => pool.end());

const newUser = { email: "ravi@example.com", passwordHash: "hash", name: "Ravi Kumar" };

describe("users repository", () => {
  it("inserts a user and returns the full row", async () => {
    const user = await usersRepo.insertUser(newUser);

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.role).toBe("PLAYER");
    expect(user.email_verified_at).toBeNull();
    expect(user.is_banned).toBe(false);
  });

  it("finds a user by email, ignoring capital letters", async () => {
    await usersRepo.insertUser(newUser);

    const found = await usersRepo.findByEmail("RAVI@Example.com");

    expect(found?.name).toBe("Ravi Kumar");
  });

  it("returns undefined when nobody has that email", async () => {
    await expect(usersRepo.findByEmail("nobody@example.com")).resolves.toBeUndefined();
  });

  it("rejects a duplicate email, even in different capitals", async () => {
    await usersRepo.insertUser(newUser);

    await expect(
      usersRepo.insertUser({ ...newUser, email: "RAVI@EXAMPLE.COM" }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("creates a profile with the default skill level", async () => {
    const user = await usersRepo.insertUser(newUser);
    await usersRepo.insertProfile(user.id);

    const { rows } = await pool.query(
      "SELECT skill_level FROM player_profiles WHERE user_id = $1",
      [user.id],
    );
    expect(rows[0].skill_level).toBe(2);
  });

  it("saves nothing when a later step in the same transaction fails", async () => {
    await expect(
      withTransaction(async (tx) => {
        await usersRepo.insertUser(newUser, tx);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(usersRepo.findByEmail(newUser.email)).resolves.toBeUndefined();
  });
});

describe("toPublicUser", () => {
  it("hides the password hash and converts to camelCase", async () => {
    const row = await usersRepo.insertUser(newUser);

    const publicUser = usersRepo.toPublicUser(row);

    expect(publicUser).not.toHaveProperty("password_hash");
    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(publicUser.emailVerified).toBe(false);
    expect(publicUser.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
