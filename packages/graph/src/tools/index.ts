/**
 * MCP tool registration for graph package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Analyzer } from "../Analyzer.js";

import { registerInitialize } from "./initialize.js";
import { registerGetSymbol } from "./getSymbol.js";
import { registerGetCallers } from "./getCallers.js";
import { registerGetCallees } from "./getCallees.js";
import { registerTrace } from "./trace.js";
import { registerFindPaths } from "./findPaths.js";
import { registerFindSymbols } from "./findSymbols.js";
import { registerGetStats } from "./getStats.js";
import { registerFindDeadCode } from "./findDeadCode.js";

export interface Services {
  store: GraphStore;
  analyzer: Analyzer;
}

export function registerAllTools(server: McpServer, services: Services): void {
  const { store, analyzer } = services;

  registerInitialize(server, store, analyzer);
  registerGetSymbol(server, store);
  registerGetCallers(server, store);
  registerGetCallees(server, store);
  registerTrace(server, store);
  registerFindPaths(server, store);
  registerFindSymbols(server, store);
  registerGetStats(server, store);
  registerFindDeadCode(server, store);
}
