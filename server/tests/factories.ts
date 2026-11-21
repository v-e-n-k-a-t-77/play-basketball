import { randomUUID } from "node:crypto";
import { pool } from "../src/db/pool.js";

export async function resetDb(): Promise<void> {
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
}

type UserOptions = {
  skill?: number;
  verified?: boolean;
  role?: "PLAYER" | "ADMIN";
};

export async function createUser(opts: UserOptions = {}): Promise<{ id: string; email: string }> {
  const email = `user-${randomUUID()}@test.dev`;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, name, role, email_verified_at)
     VALUES ($1, 'Test User', $2, $3) RETURNING id`,
    [email, opts.role ?? "PLAYER", opts.verified === false ? null : new Date()],
  );
  const id = rows[0]!.id;

  await pool.query("INSERT INTO player_profiles (user_id, skill_level) VALUES ($1, $2)", [
    id,
    opts.skill ?? 3,
  ]);
  return { id, email };
}

export async function createCourt(opts: { approved?: boolean } = {}): Promise<{ id: string }> {
  const creator = await createUser();

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO courts (name, address, area, location, status, created_by)
     VALUES ('Test Court', '1 Test Road', 'Ameerpet',
             ST_SetSRID(ST_MakePoint(78.4483, 17.4375), 4326)::geography, $1, $2)
     RETURNING id`,
    [opts.approved === false ? "PENDING" : "APPROVED", creator.id],
  );
  return { id: rows[0]!.id };
}

type GameOptions = {
  hostId?: string;
  courtId?: string;
  maxPlayers?: number;
  startsInHours?: number;
  durationMinutes?: number;
  visibility?: "PUBLIC" | "PRIVATE";
  inviteCode?: string | null;
};

export async function createGame(
  opts: GameOptions = {},
): Promise<{ id: string; hostId: string; courtId: string }> {
  const hostId = opts.hostId ?? (await createUser()).id;
  const courtId = opts.courtId ?? (await createCourt()).id;

  const startsAt = new Date(Date.now() + (opts.startsInHours ?? 48) * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + (opts.durationMinutes ?? 90) * 60_000);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO games
       (host_id, court_id, title, format, starts_at, ends_at, max_players, joined_count,
        visibility, invite_code)
     VALUES ($1, $2, 'Test game', 'FULL_COURT_5V5', $3, $4, $5, 1, $6, $7)
     RETURNING id`,
    [
      hostId,
      courtId,
      startsAt,
      endsAt,
      opts.maxPlayers ?? 10,
      opts.visibility ?? "PUBLIC",
      opts.inviteCode ?? null,
    ],
  );
  const id = rows[0]!.id;

  await pool.query(
    `INSERT INTO game_participants (game_id, user_id, status, is_host, joined_at)
     VALUES ($1, $2, 'JOINED', true, now())`,
    [id, hostId],
  );
  return { id, hostId, courtId };
}
