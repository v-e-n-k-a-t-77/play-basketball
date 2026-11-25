import type { Response } from "express";
import { env } from "../config/env.js";

export const REFRESH_COOKIE = "pb_rt";

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: expiresAt.getTime() - Date.now(),
  });
}
