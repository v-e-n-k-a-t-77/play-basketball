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
