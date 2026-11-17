import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

describe("request body errors", () => {
  it("returns 400 INVALID_JSON for broken JSON", async () => {
    const res = await request(createApp())
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{bad");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("returns 413 PAYLOAD_TOO_LARGE for a body over 100kb", async () => {
    const res = await request(createApp())
      .post("/health")
      .send({ data: "a".repeat(200_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});