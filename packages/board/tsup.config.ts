import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  dts: false, // Use tsc for declarations to avoid memory issues
  clean: true,
  sourcemap: true,
});
