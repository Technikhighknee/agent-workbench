/**
 * MCP Server bootstrap utilities.
 * Provides a standardized way to create and run MCP servers across all packages.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Configuration for an MCP server.
 */
export interface ServerConfig {
  name: string;
  version: string;
}

/**
 * Options for bootstrapping an MCP server.
 */
export interface ServerBootstrapOptions<S> {
  /** Server name and version configuration */
  config: ServerConfig;

  /** Factory function to create services */
  createServices: () => S | Promise<S>;

  /** Function to register all tools with the server */
  registerTools: (server: McpServer, services: S) => void;

  /** Optional callback when server is starting (before connect) */
  onStartup?: (services: S) => Promise<void> | void;

  /** Optional callback when server is shutting down */
  onShutdown?: (services: S) => Promise<void> | void;
}

/**
 * Bootstrap an MCP server with standardized lifecycle management.
 *
 * Handles:
 * - Service creation
 * - Server creation and tool registration
 * - Signal handlers (SIGTERM, SIGINT)
 * - Startup and shutdown hooks
 * - Transport connection
 *
 * @example
 * ```typescript
 * bootstrapServer({
 *   config: { name: "agent-workbench:my-server", version: "0.1.0" },
 *   createServices: () => ({ myService: new MyService() }),
 *   registerTools: registerAllTools,
 *   onStartup: async (services) => {
 *     await services.myService.initialize(process.cwd());
 *   },
 *   onShutdown: (services) => {
 *     services.myService.dispose();
 *   },
 * });
 * ```
 */
export async function bootstrapServer<S>(options: ServerBootstrapOptions<S>): Promise<void> {
  const { config, createServices, registerTools, onStartup, onShutdown } = options;

  // Create services
  const services = await createServices();

  // Create server and register tools
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerTools(server, services);

  // Create transport
  const transport = new StdioServerTransport();

  // Setup shutdown handlers
  const shutdown = async (): Promise<void> => {
    await onShutdown?.(services);
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Run startup hook
  await onStartup?.(services);

  // Connect to transport
  await server.connect(transport);
}

/**
 * Run bootstrapServer with standard error handling.
 * This is the preferred entry point for MCP servers.
 *
 * @example
 * ```typescript
 * runServer({
 *   config: { name: "agent-workbench:my-server", version: "0.1.0" },
 *   createServices: () => ({ myService: new MyService() }),
 *   registerTools: registerAllTools,
 * });
 * ```
 */
export function runServer<S>(options: ServerBootstrapOptions<S>): void {
  bootstrapServer(options).catch((error: unknown) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

// Re-export McpServer type for tool registration
export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
