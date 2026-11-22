import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    env: {
      CLIENT_URL: "http://localhost:5173",
      DATABASE_URL: "postgres://playbasketball:playbasketball@localhost:5433/playbasketball_test",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-test-secret-1234",
      BCRYPT_COST: "4",
    },
  },
});
