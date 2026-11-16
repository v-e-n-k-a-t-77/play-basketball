import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = createApp();

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("sets an X-Request-Id header", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

describe("unknown routes", () => {
  it("returns a 404 in the standard error shape", async () => {
    const res = await request(createApp()).get("/nothing");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});