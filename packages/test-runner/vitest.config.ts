import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "test-runner",
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    environment: "node",
    testTimeout: 60000, // Test running can take time
    globals: true,
  },
});
