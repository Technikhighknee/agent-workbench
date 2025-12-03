#!/usr/bin/env node
/**
 * MCP server for TypeScript type checking operations.
 */

import { watch, type FSWatcher } from "node:fs";
import { runServer } from "@agent-workbench/core";
import { TypeScriptService } from "./infrastructure/typescript/TypeScriptService.js";
import type { TypeService } from "./core/ports/TypeService.js";
import { registerAllTools, Services } from "./tools/index.js";

/** File watcher instance - captured in closure for shutdown */
let watcher: FSWatcher | null = null;

/**
 * Start watching for TypeScript file changes.
 * Uses native fs.watch with recursive option for efficiency.
 */
function startFileWatcher(types: TypeService, rootPath: string): FSWatcher | null {
  const pendingNotifications = new Map<string, NodeJS.Timeout>();
  const DEBOUNCE_MS = 100;

  try {
    const fsWatcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      // Only watch TypeScript files
      if (!filename.endsWith(".ts") && !filename.endsWith(".tsx")) return;

      // Skip node_modules, dist, and hidden directories
      if (
        filename.includes("node_modules") ||
        filename.includes("/dist/") ||
        filename.includes("/.") ||
        filename.startsWith(".")
      ) {
        return;
      }

      // Debounce notifications
      const existing = pendingNotifications.get(filename);
      if (existing) {
        clearTimeout(existing);
      }

      pendingNotifications.set(
        filename,
        setTimeout(() => {
          pendingNotifications.delete(filename);
          try {
            const fullPath = `${rootPath}/${filename}`;
            types.notifyFileChanged(fullPath);
            console.error(`[types] Auto-refreshed: ${filename}`);
          } catch (err) {
            console.error(`[types] Error refreshing ${filename}:`, err);
          }
        }, DEBOUNCE_MS)
      );
    });

    console.error(`[types] Watching for file changes in: ${rootPath}`);
    return fsWatcher;
  } catch (error) {
    console.error(`[types] Warning: Could not start file watcher: ${error}`);
    return null;
  }
}

runServer<Services>({
  config: {
    name: "agent-workbench:types",
    version: "0.1.0",
  },
  createServices: () => ({
    types: new TypeScriptService(),
  }),
  registerTools: registerAllTools,
  onStartup: async (services) => {
    const rootPath = process.cwd();

    const result = await services.types.initialize(rootPath);
    if (result.ok) {
      console.error(`[types] Initialized TypeScript project: ${result.value.configPath}`);
      console.error(`[types] Files: ${result.value.fileCount}, Target: ${result.value.compilerOptions.target}`);
    } else {
      console.error(`[types] Warning: Could not initialize TypeScript project: ${result.error.message}`);
      console.error(`[types] Type checking will not be available until a tsconfig.json is found.`);
    }

    // Start watching for file changes
    watcher = startFileWatcher(services.types, rootPath);
  },
  onShutdown: (services) => {
    watcher?.close();
    services.types.dispose();
  },
});
