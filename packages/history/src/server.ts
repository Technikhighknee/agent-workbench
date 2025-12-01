#!/usr/bin/env node
/**
 * MCP server for git history operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

async function main() {
  const projectRoot = process.cwd();

  const server = new McpServer({
    name: "history",
    version: "0.1.0",
  });

  registerTools(server, projectRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
