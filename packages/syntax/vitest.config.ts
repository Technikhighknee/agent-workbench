import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "syntax",
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    environment: "node",
    testTimeout: 10000,
    globals: true,
  },
});
