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
