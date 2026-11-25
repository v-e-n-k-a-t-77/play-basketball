import type { RequestHandler } from "express";
import * as authService from "./auth.service.js";

export const register: RequestHandler = async (req, res) => {
  const { user } = await authService.register(req.body);
  res.status(201).json({ user });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { user } = await authService.verifyEmailToken(req.body.token);
  res.json({ user });
};
