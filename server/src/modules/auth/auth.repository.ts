import { pool, type Db } from "../../db/pool.js";

export async function insertEmailToken(
  input: {
    userId: string;
    type: "VERIFY_EMAIL" | "RESET_PASSWORD";
    tokenHash: string;
    expiresAt: Date;
  },
  db: Db = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO email_tokens (user_id, type, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.userId, input.type, input.tokenHash, input.expiresAt],
  );
}

export async function consumeEmailToken(
  tokenHash: string,
  type: "VERIFY_EMAIL" | "RESET_PASSWORD",
  db: Db = pool,
): Promise<string | undefined> {
  const { rows } = await db.query<{ user_id: string }>(
    `UPDATE email_tokens
     SET used_at = now()
     WHERE token_hash = $1
       AND type = $2
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING user_id`,
    [tokenHash, type],
  );
  return rows[0]?.user_id;
}

export async function insertRefreshToken(
  input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  },
  db: Db = pool,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.userId, input.familyId, input.tokenHash, input.expiresAt, input.userAgent, input.ip],
  );
  return rows[0]!.id;
}

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  family_id: string;
  replaced_by: string | null;
  revoked_at: Date | null;
  is_expired: boolean;
  within_grace: boolean;
};

const REFRESH_COLUMNS = `id, user_id, family_id, replaced_by, revoked_at,
  expires_at <= now() AS is_expired,
  (revoked_at IS NOT NULL AND revoked_at > now() - interval '10 seconds') AS within_grace`;

export async function findRefreshTokenForUpdate(
  tokenHash: string,
  db: Db = pool,
): Promise<RefreshTokenRow | undefined> {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT ${REFRESH_COLUMNS} FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
    [tokenHash],
  );
  return rows[0];
}

export async function findRefreshTokenById(
  id: string,
  db: Db = pool,
): Promise<RefreshTokenRow | undefined> {
  const { rows } = await db.query<RefreshTokenRow>(
    `SELECT ${REFRESH_COLUMNS} FROM refresh_tokens WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function markRefreshTokenReplaced(
  id: string,
  replacedBy: string,
  db: Db = pool,
): Promise<void> {
  await db.query("UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1", [
    id,
    replacedBy,
  ]);
}

export async function revokeFamily(familyId: string, db: Db = pool): Promise<void> {
  await db.query(
    "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1",
    [familyId],
  );
}
