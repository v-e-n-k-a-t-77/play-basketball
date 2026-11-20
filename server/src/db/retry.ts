const RETRYABLE_CODES = new Set(["40001", "40P01"]);

function isRetryable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof err.code === "string" &&
    RETRYABLE_CODES.has(err.code)
  );
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= retries) {
        throw err;
      }
      const delayMs = 50 + Math.random() * 150;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
