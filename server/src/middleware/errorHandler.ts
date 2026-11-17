import type { ErrorRequestHandler } from "express";
import { AppError } from "../lib/errors.js";

function fromBodyParserError(err: unknown): AppError | undefined {
  const type = typeof err === "object" && err !==null && "type" in err ? err.type :undefined;

  if(type === "entity.parse.failed") {
    return new AppError(400, "INVALID_JSON", "Request body is not valid JSON. ");
  }

  if(type === "entity.too.large") {
    return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if(res.headersSent) {
    next(err);
    return;
  }

  const appError = err instanceof AppError ? err : fromBodyParserError(err);

  if(appError) {
    res.status(appError.status).json({
      error: { code: appError.code, message: appError.message, details: appError.details }
    });
    return;
  }

  req.log.error({ err }, "Unexpected error");
  res.status(500).json({
  error: { code: "INTERNAL_ERROR", message: "Something went wrong."},
  });
};