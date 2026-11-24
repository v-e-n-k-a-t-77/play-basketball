import { randomUUID } from "node:crypto";
import express from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import helmet from "helmet";
import { authRouter } from "./modules/auth/auth.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
    }),
  );

  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
