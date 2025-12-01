import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { watch, type FSWatcher } from "node:fs";

import { TypeScriptService } from "./infrastructure/typescript/TypeScriptService.js";
import { registerAllTools, Services } from "./tools/index.js";

interface ServerConfig {
  name: string;
  version: string;
}

const DEFAULT_CONFIG: ServerConfig = {
  name: "agent-workbench:types",
  version: "0.1.0",
};

function createServices(): Services {
  return {
    types: new TypeScriptService(),
  };
}

function createServer(services: Services, config: ServerConfig = DEFAULT_CONFIG): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerAllTools(server, services);

  return server;
}

async function autoInitialize(services: Services): Promise<void> {
  const rootPath = process.cwd();

  const result = await services.types.initialize(rootPath);
  if (result.ok) {
    console.error(`[types] Initialized TypeScript project: ${result.value.configPath}`);
    console.error(`[types] Files: ${result.value.fileCount}, Target: ${result.value.compilerOptions.target}`);
  } else {
    console.error(`[types] Warning: Could not initialize TypeScript project: ${result.error.message}`);
    console.error(`[types] Type checking will not be available until a tsconfig.json is found.`);
  }
}

/**
 * Start watching for TypeScript file changes.
 * Uses native fs.watch with recursive option for efficiency.
 */
function startFileWatcher(services: Services, rootPath: string): FSWatcher | null {
  // Debounce map to avoid multiple notifications for the same file
  const pendingNotifications = new Map<string, NodeJS.Timeout>();
  const DEBOUNCE_MS = 100;

  try {
    const watcher = watch(rootPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Only watch TypeScript files
      if (!filename.endsWith(".ts") && !filename.endsWith(".tsx")) return;

      // Skip node_modules and dist
      if (filename.includes("node_modules") || filename.includes("/dist/")) return;

      // Debounce notifications
      const existing = pendingNotifications.get(filename);
      if (existing) {
        clearTimeout(existing);
      }

      pendingNotifications.set(
        filename,
        setTimeout(() => {
          pendingNotifications.delete(filename);
          const fullPath = `${rootPath}/${filename}`;
          services.types.notifyFileChanged(fullPath);
          console.error(`[types] Auto-refreshed: ${filename}`);
        }, DEBOUNCE_MS)
      );
    });

    console.error(`[types] Watching for file changes in: ${rootPath}`);
    return watcher;
  } catch (error) {
    console.error(`[types] Warning: Could not start file watcher: ${error}`);
    return null;
  }
}

async function main(): Promise<void> {
  const services = createServices();
  const server = createServer(services);
  const transport = new StdioServerTransport();
  const rootPath = process.cwd();

  // Auto-initialize the TypeScript project
  await autoInitialize(services);

  // Start watching for file changes
  const watcher = startFileWatcher(services, rootPath);

  const shutdown = async (): Promise<void> => {
    watcher?.close();
    services.types.dispose();
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
