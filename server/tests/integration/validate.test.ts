import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { validateBody } from "../../src/middleware/validate.js";

const schema = z.object({
  name: z.string().trim().min(2),
  age: z.number().int(),
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/people", validateBody(schema), (req, res) => {
    res.json(req.body);
  });
  app.use(errorHandler);
  return app;
}

describe("validateBody", () => {
  it("passes valid data on, in cleaned form", async () => {
    const res = await request(buildApp()).post("/people").send({ name: "  Ravi  ", age: 22 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "Ravi", age: 22 });
  });

  it("returns 400 with one entry per bad field", async () => {
    const res = await request(buildApp()).post("/people").send({ name: "R", age: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");

    const paths = res.body.error.details.fields.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "age"]));
  });

  it("returns 400 when there is no body at all", async () => {
    const res = await request(buildApp()).post("/people");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
