#!/usr/bin/env node
/**
 * Types MCP Server - Simple, fast TypeScript checking.
 *
 * Tools:
 * - check_file: Check a single file for type errors
 * - get_type: Get type at position
 * - go_to_definition: Find definition
 * - get_quick_fixes: Get fixes for errors
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TypeChecker } from "./TypeChecker.js";
import { registerCheckFile } from "./tools/checkFile.js";
import { registerGetType } from "./tools/getType.js";
import { registerGoToDefinition } from "./tools/goToDefinition.js";
import { registerGetQuickFixes } from "./tools/getQuickFixes.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "types",
    version: "2.0.0",
  });

  // Create the checker - no initialization needed, it's lazy
  const checker = new TypeChecker();

  // Register tools
  registerCheckFile(server, checker);
  registerGetType(server, checker);
  registerGoToDefinition(server, checker);
  registerGetQuickFixes(server, checker);

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
  console.error("Server error:", error);
  process.exit(1);
});
