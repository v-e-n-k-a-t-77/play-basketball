import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../src/db/retry.js";

function pgError(code: string) {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

describe("withRetry", () => {
  it("returns the result when the first try works", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a deadlock and then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(pgError("40P01"))
      .mockRejectedValueOnce(pgError("40001"))
      .mockResolvedValue("ok");

    await expect(withRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(pgError("23505"));

    await expect(withRetry(fn)).rejects.toThrow("pg error 23505");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry limit", async () => {
    const fn = vi.fn().mockRejectedValue(pgError("40P01"));

    await expect(withRetry(fn, 2)).rejects.toThrow("pg error 40P01");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
