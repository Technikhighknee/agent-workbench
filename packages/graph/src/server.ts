#!/usr/bin/env node
/**
 * MCP Server for semantic code graph.
 * Provides queryable knowledge base that replaces file reading for agents.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  initializeSchema,
  querySchema,
  getSymbolSchema,
  getCallersSchema,
  getCalleesSchema,
  traceSchema,
  findPathsSchema,
  findSymbolsSchema,
  getStatsSchema,
  handleInitialize,
  handleQuery,
  handleGetSymbol,
  handleGetCallers,
  handleGetCallees,
  handleTrace,
  handleFindPaths,
  handleFindSymbols,
  handleGetStats,
} from "./tools/index.js";

const server = new McpServer({
  name: "graph",
  version: "0.1.0",
});

// Register all tools
server.tool(
  "graph_initialize",
  "Initialize the semantic code graph by indexing a workspace. Call this first before any queries.",
  initializeSchema.shape,
  async (args) => {
    const result = await handleInitialize(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_query",
  "Execute a compound query against the code graph. Supports traversal, path finding, and filtering. Returns nodes with full source code.",
  querySchema.shape,
  async (args) => {
    const result = await handleQuery(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_get_symbol",
  "Get full information about a symbol including its source code. No follow-up Read needed.",
  getSymbolSchema.shape,
  async (args) => {
    const result = await handleGetSymbol(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_get_callers",
  "Find all functions/methods that call a given symbol. Returns caller nodes with source.",
  getCallersSchema.shape,
  async (args) => {
    const result = await handleGetCallers(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_get_callees",
  "Find all functions/methods called by a given symbol. Returns callee nodes with source.",
  getCalleesSchema.shape,
  async (args) => {
    const result = await handleGetCallees(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_trace",
  "Trace call chains forward (what does this call?) or backward (who calls this?). Returns subgraph.",
  traceSchema.shape,
  async (args) => {
    const result = await handleTrace(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_find_paths",
  "Find all paths between two symbols. Useful for understanding how data/control flows.",
  findPathsSchema.shape,
  async (args) => {
    const result = await handleFindPaths(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_find_symbols",
  "Search for symbols by pattern, tags, or kind. Use tags like 'handler', 'validation', 'database', 'async'.",
  findSymbolsSchema.shape,
  async (args) => {
    const result = await handleFindSymbols(args as any);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "graph_stats",
  "Get statistics about the indexed graph: node count, edge count, file count.",
  getStatsSchema.shape,
  async () => {
    const result = await handleGetStats();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
