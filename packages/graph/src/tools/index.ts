/**
 * MCP Tool definitions for the semantic code graph.
 * Each tool is designed for agent consumption: structured output, confidence scores.
 */

import { z } from "zod";
import { GraphService } from "../infrastructure/GraphService.js";
import { SymbolKind, EdgeKind } from "../core/model.js";

// Singleton service instance
let graphService: GraphService | null = null;

export function getGraphService(): GraphService {
  if (!graphService) {
    graphService = new GraphService();
  }
  return graphService;
}

// --- Tool Schemas ---

export const initializeSchema = z.object({
  workspace_path: z.string().describe("Path to the workspace to index"),
});

export const querySchema = z.object({
  from: z.union([
    z.string(),
    z.array(z.string()),
    z.object({
      pattern: z.string().optional(),
      tags: z.array(z.string()).optional(),
      kinds: z.array(z.enum([
        "function", "method", "class", "interface", "type",
        "variable", "constant", "property", "parameter",
        "module", "namespace", "enum", "constructor"
      ])).optional(),
    }),
  ]).describe("Starting point(s) for the query"),
  direction: z.enum(["forward", "backward", "both"]).optional().describe("Traversal direction"),
  edge_kinds: z.array(z.enum([
    "calls", "reads", "writes", "returns", "instantiates",
    "inherits", "implements", "imports", "exports",
    "type_of", "parameter_of", "contains"
  ])).optional().describe("Filter by edge types"),
  max_depth: z.number().optional().describe("Maximum traversal depth"),
  min_confidence: z.number().optional().describe("Minimum confidence threshold (0-1)"),
  must_reach: z.array(z.string()).optional().describe("Paths must reach these symbols"),
  must_avoid: z.array(z.string()).optional().describe("Paths must not include these symbols"),
  limit: z.number().optional().describe("Maximum results"),
  include_source: z.boolean().optional().describe("Include source code (default: true)"),
});

export const getSymbolSchema = z.object({
  name: z.string().describe("Symbol name or qualified name"),
});

export const getCallersSchema = z.object({
  symbol: z.string().describe("Symbol name to find callers for"),
});

export const getCalleesSchema = z.object({
  symbol: z.string().describe("Symbol name to find callees for"),
});

export const traceSchema = z.object({
  symbol: z.string().describe("Starting symbol"),
  direction: z.enum(["forward", "backward"]).describe("Trace direction"),
  depth: z.number().optional().describe("Maximum depth (default: 5)"),
  min_confidence: z.number().optional().describe("Minimum confidence (default: 0)"),
  edge_kinds: z.array(z.string()).optional().describe("Filter by edge types"),
});

export const findPathsSchema = z.object({
  from: z.string().describe("Starting symbol"),
  to: z.string().describe("Target symbol"),
  max_depth: z.number().optional().describe("Maximum path length (default: 10)"),
  must_avoid: z.array(z.string()).optional().describe("Symbols to avoid"),
});

export const findSymbolsSchema = z.object({
  pattern: z.string().optional().describe("Regex pattern to match symbol names"),
  tags: z.array(z.string()).optional().describe("Filter by semantic tags"),
  kinds: z.array(z.string()).optional().describe("Filter by symbol kinds"),
  limit: z.number().optional().describe("Maximum results"),
});

export const getStatsSchema = z.object({});

// --- Tool Handlers ---

export async function handleInitialize(args: z.infer<typeof initializeSchema>) {
  const service = getGraphService();
  const result = await service.initialize(args.workspace_path);

  if (!result.ok) {
    return { error: result.error.message };
  }

  return {
    success: true,
    stats: result.value,
  };
}

export function handleQuery(args: z.infer<typeof querySchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.query({
    from: args.from as any,
    traverse: args.direction ? {
      direction: args.direction,
      edgeKinds: args.edge_kinds as EdgeKind[],
      maxDepth: args.max_depth,
      minConfidence: args.min_confidence,
    } : undefined,
    mustReach: args.must_reach,
    mustAvoid: args.must_avoid,
    output: {
      format: args.must_reach ? "paths" : "subgraph",
      includeSource: args.include_source ?? true,
      limit: args.limit,
    },
  });

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleGetSymbol(args: z.infer<typeof getSymbolSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.getSymbol(args.name);

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleGetCallers(args: z.infer<typeof getCallersSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.getCallers(args.symbol);

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleGetCallees(args: z.infer<typeof getCalleesSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.getCallees(args.symbol);

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleTrace(args: z.infer<typeof traceSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = args.direction === "forward"
    ? service.traceForward(args.symbol, {
        depth: args.depth,
        minConfidence: args.min_confidence,
        edgeKinds: args.edge_kinds,
      })
    : service.traceBackward(args.symbol, {
        depth: args.depth,
        minConfidence: args.min_confidence,
        edgeKinds: args.edge_kinds,
      });

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleFindPaths(args: z.infer<typeof findPathsSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.findPaths(args.from, args.to, {
    maxDepth: args.max_depth,
    mustAvoid: args.must_avoid,
  });

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleFindSymbols(args: z.infer<typeof findSymbolsSchema>) {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  const result = service.findSymbols({
    pattern: args.pattern,
    tags: args.tags,
    kinds: args.kinds as SymbolKind[],
    limit: args.limit,
  });

  if (!result.ok) {
    return { error: result.error.message };
  }

  return result.value;
}

export function handleGetStats() {
  const service = getGraphService();

  if (!service.isInitialized()) {
    return { error: "Graph not initialized. Call graph_initialize first." };
  }

  return service.getStats();
}

// Tool definitions for MCP registration
export const tools = [
  {
    name: "graph_initialize",
    description: "Initialize the semantic code graph by indexing a workspace. Call this first before any queries.",
    inputSchema: initializeSchema,
    handler: handleInitialize,
  },
  {
    name: "graph_query",
    description: "Execute a compound query against the code graph. Supports traversal, path finding, and filtering. Returns nodes with full source code.",
    inputSchema: querySchema,
    handler: handleQuery,
  },
  {
    name: "graph_get_symbol",
    description: "Get full information about a symbol including its source code. No follow-up Read needed.",
    inputSchema: getSymbolSchema,
    handler: handleGetSymbol,
  },
  {
    name: "graph_get_callers",
    description: "Find all functions/methods that call a given symbol. Returns caller nodes with source.",
    inputSchema: getCallersSchema,
    handler: handleGetCallers,
  },
  {
    name: "graph_get_callees",
    description: "Find all functions/methods called by a given symbol. Returns callee nodes with source.",
    inputSchema: getCalleesSchema,
    handler: handleGetCallees,
  },
  {
    name: "graph_trace",
    description: "Trace call chains forward (what does this call?) or backward (who calls this?). Returns subgraph.",
    inputSchema: traceSchema,
    handler: handleTrace,
  },
  {
    name: "graph_find_paths",
    description: "Find all paths between two symbols. Useful for understanding how data/control flows.",
    inputSchema: findPathsSchema,
    handler: handleFindPaths,
  },
  {
    name: "graph_find_symbols",
    description: "Search for symbols by pattern, tags, or kind. Use tags like 'handler', 'validation', 'database', 'async'.",
    inputSchema: findSymbolsSchema,
    handler: handleFindSymbols,
  },
  {
    name: "graph_stats",
    description: "Get statistics about the indexed graph: node count, edge count, file count.",
    inputSchema: getStatsSchema,
    handler: handleGetStats,
  },
];
