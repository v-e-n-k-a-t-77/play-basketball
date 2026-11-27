import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { isUniqueViolation } from "../../db/pgErrors.js";
import { withTransaction } from "../../db/pool.js";
import { sendEmail } from "../../emails/mailer.js";
import { verifyEmail } from "../../emails/templates.js";
import { generateToken, hashToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { signAccessToken } from "../../lib/jwt.js";
import { logger } from "../../lib/logger.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import * as usersRepo from "../users/users.repository.js";
import type { UserRow } from "../users/users.repository.js";
import * as authRepo from "./auth.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

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

function sessionFor(user: UserRow) {
  const publicUser = usersRepo.toPublicUser(user);
  const accessToken = signAccessToken({
    id: user.id,
    role: user.role,
    emailVerified: publicUser.emailVerified,
  });
  return { accessToken, user: publicUser };
}

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

  return { ...sessionFor(user), refreshToken, refreshExpiresAt };
}

type RefreshOutcome =
  | { kind: "invalid" }
  | { kind: "reused"; userId: string; familyId: string }
  | { kind: "banned" }
  | { kind: "grace"; user: UserRow }
  | { kind: "rotated"; user: UserRow; refreshToken: string; expiresAt: Date };

export async function refresh(rawToken: string | undefined, context: LoginContext) {
  if (!rawToken) {
    throw new AppError(401, "NO_REFRESH_TOKEN", "No refresh token was provided.");
  }

  const outcome = await withTransaction(async (tx): Promise<RefreshOutcome> => {
    const token = await authRepo.findRefreshTokenForUpdate(hashToken(rawToken), tx);
    if (!token) return { kind: "invalid" };

    if (token.revoked_at !== null) {
      if (token.within_grace && token.replaced_by) {
        const replacement = await authRepo.findRefreshTokenById(token.replaced_by, tx);
        const owner = await usersRepo.findById(token.user_id, tx);
        if (
          replacement &&
          replacement.revoked_at === null &&
          !replacement.is_expired &&
          owner &&
          !owner.is_banned
        ) {
          return { kind: "grace", user: owner };
        }
      }
      await authRepo.revokeFamily(token.family_id, tx);
      return { kind: "reused", userId: token.user_id, familyId: token.family_id };
    }

    if (token.is_expired) return { kind: "invalid" };

    const user = await usersRepo.findById(token.user_id, tx);
    if (!user) return { kind: "invalid" };
    if (user.is_banned) {
      await authRepo.revokeFamily(token.family_id, tx);
      return { kind: "banned" };
    }

    const refreshToken = generateToken(REFRESH_TOKEN_BYTES);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    const newId = await authRepo.insertRefreshToken(
      {
        userId: user.id,
        familyId: token.family_id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent: context.userAgent,
        ip: context.ip,
      },
      tx,
    );
    await authRepo.markRefreshTokenReplaced(token.id, newId, tx);

    return { kind: "rotated", user, refreshToken, expiresAt };
  });

  if (outcome.kind === "invalid") {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired.");
  }
  if (outcome.kind === "reused") {
    logger.warn(
      { userId: outcome.userId, familyId: outcome.familyId },
      "auth.refresh_reuse_detected",
    );
    throw new AppError(401, "REFRESH_TOKEN_REUSED", "This session is no longer valid.");
  }
  if (outcome.kind === "banned") {
    throw new AppError(403, "ACCOUNT_BANNED", "This account has been suspended.");
  }
  if (outcome.kind === "grace") {
    return { ...sessionFor(outcome.user), rotation: null };
  }
  return {
    ...sessionFor(outcome.user),
    rotation: { token: outcome.refreshToken, expiresAt: outcome.expiresAt },
  };
}
