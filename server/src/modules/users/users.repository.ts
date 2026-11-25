import { pool, type Db } from "../../db/pool.js";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  avatar_url: string | null;
  role: "PLAYER" | "ADMIN";
  email_verified_at: Date | null;
  is_banned: boolean;
  banned_reason: string | null;
  created_at: Date;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "PLAYER" | "ADMIN";
  emailVerified: boolean;
  createdAt: string;
};

const USER_COLUMNS = `id, email, password_hash, name, avatar_url, role,
  email_verified_at, is_banned, banned_reason, created_at`;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findByEmail(email: string, db: Db = pool): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [
    email,
  ]);
  return rows[0];
}

export async function findById(id: string, db: Db = pool): Promise<UserRow | undefined> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0];
}

export async function insertUser(
  input: { email: string; passwordHash: string; name: string },
  db: Db = pool,
): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [input.email, input.passwordHash, input.name],
  );
  return rows[0]!;
}

export async function insertProfile(userId: string, db: Db = pool): Promise<void> {
  await db.query("INSERT INTO player_profiles (user_id) VALUES ($1)", [userId]);
}

export async function markEmailVerified(userId: string, db: Db = pool): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, now())
    WHERE id = $1
    RETURNING ${USER_COLUMNS}`,
    [userId],
  );
  return rows[0]!;
}
