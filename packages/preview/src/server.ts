#!/usr/bin/env node
/**
 * MCP Server for preview package.
 *
 * Provides impact preview and consequence analysis tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { PreviewService } from "./PreviewService.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const projectRoot = process.cwd();

  // Create services
  const service = new PreviewService(projectRoot);
  await service.initialize();

  // Create MCP server
  const server = new McpServer({
    name: "preview",
    version: "0.1.0",
  });

  // Register tools
  registerAllTools(server, service);

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
