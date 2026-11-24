import { withTransaction } from "../../db/pool.js";
import { isUniqueViolation } from "../../db/pgErrors.js";
import { generateToken, hashToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import * as usersRepo from "../users/users.repository.js";
import * as authRepo from "./auth.repository.js";
import type { RegisterInput } from "./auth.schemas.js";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function register(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  try {
    return await withTransaction(async (tx) => {
      const row = await usersRepo.insertUser(
        { email: input.email, passwordHash, name: input.name },
        tx,
      );
      await usersRepo.insertProfile(row.id, tx);

      const verificationToken = generateToken();
      await authRepo.insertEmailToken(
        {
          userId: row.id,
          type: "VERIFY_EMAIL",
          tokenHash: hashToken(verificationToken),
          expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        },
        tx,
      );

      return { user: usersRepo.toPublicUser(row), verificationToken };
    });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_key")) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }
    throw err;
  }
}
