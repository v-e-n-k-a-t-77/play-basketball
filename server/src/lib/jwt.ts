import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export type AccessUser = {
  id: string;
  role: "PLAYER" | "ADMIN";
  emailVerified: boolean;
};

const payloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(["PLAYER", "ADMIN"]),
  ver: z.boolean(),
});

export function signAccessToken(user: AccessUser): string {
  return jwt.sign({ role: user.role, ver: user.emailVerified }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL_MINUTES * 60,
  });
}

export function verifyAccessToken(token: string): AccessUser {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    const payload = payloadSchema.parse(decoded);
    return { id: payload.sub, role: payload.role, emailVerified: payload.ver };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, "TOKEN_EXPIRED", "Access token has expired.");
    }
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or missing access token.");
  }
}
