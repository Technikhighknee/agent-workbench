/**
 * @agent-workbench/graph
 * Semantic code graph for AI agents - queryable knowledge base that replaces file reading.
 */

// Core model
export type {
  SymbolKind,
  EdgeKind,
  GraphNode,
  GraphEdge,
  GraphPath,
  QueryOptions,
  QueryResult,
} from "./core/model.js";
export { Result, Ok, Err, ok, err } from "./core/model.js";

// Infrastructure
export { GraphStore } from "./infrastructure/GraphStore.js";
export { TypeScriptAnalyzer } from "./infrastructure/TypeScriptAnalyzer.js";
export { QueryEngine } from "./infrastructure/QueryEngine.js";
export { GraphService } from "./infrastructure/GraphService.js";
export type { IndexStats } from "./infrastructure/GraphService.js";

// Tools
export { tools, getGraphService } from "./tools/index.js";
