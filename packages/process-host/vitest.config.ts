import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "process-host",
    include: ["test/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    environment: "node",
    testTimeout: 30000, // Process operations need longer timeout
    globals: true,
  },
});
