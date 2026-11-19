import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    // All test files reset and share the same SQLite database.
    fileParallelism: false,
  },
});
