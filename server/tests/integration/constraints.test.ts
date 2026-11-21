import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../../src/db/pool.js";
import { createGame, createUser, resetDb } from "../factories.js";

type PgError = { code?: string; constraint?: string };

async function pgErrorOf(promise: Promise<unknown>): Promise<PgError> {
  try {
    await promise;
  } catch (err) {
    return err as PgError;
  }
  throw new Error("Expected the query to fail, but it succeeded");
}

beforeEach(resetDb);
afterAll(() => pool.end());

// Postgres error codes: 23514 = check, 23505 = unique, 23P01 = exclusion
describe("games constraints", () => {
  it("chk_capacity: joined_count cannot exceed max_players", async () => {
    const game = await createGame({ maxPlayers: 10 });

    const err = await pgErrorOf(
      pool.query("UPDATE games SET joined_count = 11 WHERE id = $1", [game.id]),
    );

    expect(err.code).toBe("23514");
    expect(err.constraint).toBe("chk_capacity");
  });

  it("excl_host_overlap: one host cannot have two overlapping games", async () => {
    const first = await createGame({ startsInHours: 48 });

    const err = await pgErrorOf(
      createGame({ hostId: first.hostId, courtId: first.courtId, startsInHours: 48.5 }),
    );

    expect(err.code).toBe("23P01");
    expect(err.constraint).toBe("excl_host_overlap");
  });

  it("excl_host_overlap: a different host can use the same time", async () => {
    const first = await createGame({ startsInHours: 48 });

    await expect(
      createGame({ courtId: first.courtId, startsInHours: 48.5 }),
    ).resolves.toBeDefined();
  });

  it("excl_host_overlap: a cancelled game frees the host's time slot", async () => {
    const first = await createGame({ startsInHours: 48 });
    await pool.query("UPDATE games SET status = 'CANCELLED' WHERE id = $1", [first.id]);

    await expect(
      createGame({ hostId: first.hostId, courtId: first.courtId, startsInHours: 48.5 }),
    ).resolves.toBeDefined();
  });

  it("chk_private_code: a private game needs an invite code", async () => {
    const err = await pgErrorOf(createGame({ visibility: "PRIVATE", inviteCode: null }));

    expect(err.code).toBe("23514");
    expect(err.constraint).toBe("chk_private_code");
  });

  it("chk_private_code: a public game cannot have an invite code", async () => {
    const err = await pgErrorOf(createGame({ visibility: "PUBLIC", inviteCode: "ABCD2345" }));

    expect(err.code).toBe("23514");
    expect(err.constraint).toBe("chk_private_code");
  });
});

describe("game_participants constraints", () => {
  it("uq_participant: a user has only one row per game", async () => {
    const game = await createGame();

    const err = await pgErrorOf(
      pool.query(
        "INSERT INTO game_participants (game_id, user_id, status) VALUES ($1, $2, 'JOINED')",
        [game.id, game.hostId],
      ),
    );

    expect(err.code).toBe("23505");
    expect(err.constraint).toBe("uq_participant");
  });

  it("chk_waitlist_pos: a waitlisted player needs a position", async () => {
    const game = await createGame();
    const player = await createUser();

    const err = await pgErrorOf(
      pool.query(
        "INSERT INTO game_participants (game_id, user_id, status) VALUES ($1, $2, 'WAITLISTED')",
        [game.id, player.id],
      ),
    );

    expect(err.code).toBe("23514");
    expect(err.constraint).toBe("chk_waitlist_pos");
  });

  it("chk_waitlist_pos: a joined player cannot have a position", async () => {
    const game = await createGame();
    const player = await createUser();

    const err = await pgErrorOf(
      pool.query(
        `INSERT INTO game_participants (game_id, user_id, status, waitlist_position)
         VALUES ($1, $2, 'JOINED', 1)`,
        [game.id, player.id],
      ),
    );

    expect(err.code).toBe("23514");
    expect(err.constraint).toBe("chk_waitlist_pos");
  });
});
