/**
 * Tool registration types for insight package.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InsightService } from "../InsightService.js";

export type ToolRegistrar = (server: McpServer, service: InsightService) => void;

/**
 * Refactoring suggestion types - shared between suggestRefactoring, analyzers, and formatter.
 */
export interface RefactoringSuggestion {
  type:
    | "extract_function"
    | "split_file"
    | "reduce_coupling"
    | "remove_unused"
    | "add_tests"
    | "simplify"
    | "rename";
  priority: "high" | "medium" | "low";
  target: string;
  description: string;
  rationale: string;
  suggestedAction?: string;
}

export interface RefactoringAnalysis {
  target: string;
  suggestions: RefactoringSuggestion[];
  metrics: {
    complexity: "low" | "medium" | "high";
    maintainability: "good" | "needs_attention" | "poor";
    testCoverage: "unknown" | "none" | "partial" | "good";
  };
  summary: string;
}
