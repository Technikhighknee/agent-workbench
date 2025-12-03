/**
 * MCP tool for suggesting refactoring opportunities.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { InsightService } from "../InsightService.js";
import { analyzeFile, analyzeDirectory, analyzeSymbol } from "./RefactoringAnalyzers.js";
import { formatAnalysis, generateSummary } from "./RefactoringFormatter.js";

/**
 * Refactoring suggestion with priority and actionable advice.
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

/**
 * Refactoring analysis result.
 */
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

export function registerSuggestRefactoring(
  server: McpServer,
  service: InsightService
): void {
  server.registerTool(
    "suggest_refactoring",
    {
      title: "Suggest refactoring opportunities",
      description: `Analyze code and suggest refactoring opportunities.

Detects common code smells and suggests improvements:
- **Long functions** → Extract smaller functions
- **Large files** → Split into modules
- **High coupling** → Reduce dependencies
- **Unused exports** → Remove dead code
- **Missing tests** → Add test coverage
- **Complex conditionals** → Simplify logic

Returns prioritized suggestions with actionable advice.

Use cases:
- Pre-review code quality check
- Identify technical debt
- Plan refactoring work
- Learn about code health`,
      inputSchema: {
        target: z
          .string()
          .describe("File path, directory path, or symbol name to analyze"),
        focus: z
          .enum(["all", "complexity", "coupling", "unused", "tests", "naming"])
          .optional()
          .default("all")
          .describe("Focus area for analysis"),
      },
    },
    async ({ target, focus }) => {
      const insightResult = await service.getInsight(target);

      if (!insightResult.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error analyzing "${target}": ${insightResult.error}`,
            },
          ],
          isError: true,
        };
      }

      const insight = insightResult.value;
      const suggestions: RefactoringSuggestion[] = [];

      // Analyze based on insight type
      if (insight.type === "file") {
        analyzeFile(insight, suggestions, focus);
      } else if (insight.type === "directory") {
        analyzeDirectory(insight, suggestions, focus);
      } else if (insight.type === "symbol") {
        analyzeSymbol(insight, suggestions, focus);
      }

      // Sort by priority
      suggestions.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Generate output
      const analysis: RefactoringAnalysis = {
        target,
        suggestions,
        metrics: {
          complexity:
            "metrics" in insight ? (insight.metrics?.complexity ?? "low") : "low",
          maintainability:
            suggestions.filter((s) => s.priority === "high").length > 2
              ? "poor"
              : suggestions.length > 5
                ? "needs_attention"
                : "good",
          testCoverage: "unknown",
        },
        summary: generateSummary(suggestions),
      };

      const output = formatAnalysis(analysis);

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
