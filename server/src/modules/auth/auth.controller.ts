import type { Request, RequestHandler } from "express";
import * as authService from "./auth.service.js";
import { REFRESH_COOKIE, setRefreshCookie } from "../../lib/cookies.js";

function contextOf(req: Request) {
  return {
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
  };
}

export const register: RequestHandler = async (req, res) => {
  const { user } = await authService.register(req.body);
  res.status(201).json({ user });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { user } = await authService.verifyEmailToken(req.body.token);
  res.json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const { accessToken, user, refreshToken, refreshExpiresAt } = await authService.login(
    req.body,
    contextOf(req),
  );

  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.set("Cache-Control", "no-store");
  res.json({ accessToken, user });
};

export const refresh: RequestHandler = async (req, res) => {
  const { accessToken, user, rotation } = await authService.refresh(
    req.cookies?.[REFRESH_COOKIE],
    contextOf(req),
  );

  if (rotation) {
    setRefreshCookie(res, rotation.token, rotation.expiresAt);
  }
  res.set("Cache-Control", "no-store");
  res.json({ accessToken, user });
};
