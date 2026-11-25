import type { RequestHandler } from "express";
import * as authService from "./auth.service.js";
import { setRefreshCookie } from "../../lib/cookies.js";

export const register: RequestHandler = async (req, res) => {
  const { user } = await authService.register(req.body);
  res.status(201).json({ user });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { user } = await authService.verifyEmailToken(req.body.token);
  res.json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const { accessToken, user, refreshToken, refreshExpiresAt } = await authService.login(req.body, {
    userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
    ip: req.ip ?? null,
  });

  setRefreshCookie(res, refreshToken, refreshExpiresAt);
  res.set("Cache-Control", "no-store");
  res.json({ accessToken, user });
};
