const url = process.env.DATABASE_URL ?? "";

if (!url.includes("_test")) {
  throw new Error("Refusing to run tests: DATABASE_URL must point at a database ending in _test.");
}