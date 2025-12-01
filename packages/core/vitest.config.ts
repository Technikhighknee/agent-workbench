import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    environment: "node",
    testTimeout: 5000,
    globals: true,
  },
});
