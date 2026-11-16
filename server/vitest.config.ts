import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      CLIENT_URL: "http://localhost:5173",
      DATABASE_URL: "postgres://playbasketball:playbasketball@localhost:5432/playbasketball",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
