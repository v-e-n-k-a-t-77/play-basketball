import type { RequestHandler } from "express";
import * as authService from "./auth.service.js";

export const register: RequestHandler = async (req, res) => {
  const { user } = await authService.register(req.body);
  res.status(201).json({ user });
};
