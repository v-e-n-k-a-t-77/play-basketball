import { withTransaction } from "../../db/pool.js";
import { isUniqueViolation } from "../../db/pgErrors.js";
import { generateToken, hashToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import * as usersRepo from "../users/users.repository.js";
import * as authRepo from "./auth.repository.js";
import type { RegisterInput } from "./auth.schemas.js";
import { env } from "../../config/env.js";
import { sendEmail } from "../../emails/mailer.js";
import { verifyEmail } from "../../emails/templates.js";
import { logger } from "../../lib/logger.js";
import { randomUUID } from "node:crypto";
import { signAccessToken } from "../../lib/jwt.js";
import { verifyPassword } from "../../lib/password.js";
import type { LoginInput } from "./auth.schemas.js";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function register(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  let created;
  try {
    created = await withTransaction(async (tx) => {
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

  // The user is saved. From here on, a failure must not undo the registration.
  const link = `${env.CLIENT_URL}/verify-email?token=${created.verificationToken}`;
  try {
    await sendEmail({
      to: created.user.email,
      ...verifyEmail({ name: created.user.name, link }),
    });
  } catch (err) {
    logger.error({ err, userId: created.user.id }, "Failed to send verification email");
  }

  return { user: created.user };
}

export async function verifyEmailToken(token: string) {
  const row = await withTransaction(async (tx) => {
    const userId = await authRepo.consumeEmailToken(hashToken(token), "VERIFY_EMAIL", tx);
    if (!userId) {
      throw new AppError(404, "NOT_FOUND", "This verification link is invalid or has expired.");
    }
    return usersRepo.markEmailVerified(userId, tx);
  });

  return { user: usersRepo.toPublicUser(row) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 64;

let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password-1");
  return dummyHash;
}

type LoginContext = { userAgent: string | null; ip: string | null };

export async function login(input: LoginInput, context: LoginContext) {
  const user = await usersRepo.findByEmail(input.email);

  // Always run one bcrypt comparison, even for unknown emails, so the response
  // time does not reveal whether the email exists.
  const hashToCheck = user?.password_hash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(input.password, hashToCheck);

  if (!user || !user.password_hash || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (user.is_banned) {
    throw new AppError(403, "ACCOUNT_BANNED", "This account has been suspended.");
  }

  const refreshToken = generateToken(REFRESH_TOKEN_BYTES);
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await withTransaction(async (tx) => {
    await authRepo.insertRefreshToken(
      {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: context.userAgent,
        ip: context.ip,
      },
      tx,
    );
    await usersRepo.touchLastLogin(user.id, tx);
  });

  const publicUser = usersRepo.toPublicUser(user);
  const accessToken = signAccessToken({
    id: user.id,
    role: user.role,
    emailVerified: publicUser.emailVerified,
  });

  return { accessToken, user: publicUser, refreshToken, refreshExpiresAt };
}
