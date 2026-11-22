import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../lib/errors.js";

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fields = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      next(new AppError(400, "VALIDATION_ERROR", "Request validation failed.", { fields }));
      return;
    }

    req.body = result.data;
    next();
  };
}
