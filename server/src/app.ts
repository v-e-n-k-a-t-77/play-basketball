import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}