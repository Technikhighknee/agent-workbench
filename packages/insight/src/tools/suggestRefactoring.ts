/**
 * MCP tool for suggesting refactoring opportunities.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { InsightService } from "../InsightService.js";

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
  target: string; // File path or symbol name
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
          .enum([
            "all",
            "complexity",
            "coupling",
            "unused",
            "tests",
            "naming",
          ])
          .optional()
          .default("all")
          .describe("Focus area for analysis"),
      },
    },
    async ({ target, focus }) => {
      // Get insight first
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
            "metrics" in insight
              ? (insight.metrics?.complexity ?? "low")
              : "low",
          maintainability:
            suggestions.filter((s) => s.priority === "high").length > 2
              ? "poor"
              : suggestions.length > 5
              ? "needs_attention"
              : "good",
          testCoverage: "unknown", // Could be enhanced with test-runner integration
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

function analyzeFile(
  insight: {
    path: string;
    metrics?: {
      lines: number;
      symbols: number;
      imports: number;
      exports: number;
      complexity: string;
    };
    structure?: {
      symbols: Array<{ name: string; kind: string; line: number }>;
      imports: Array<{ source: string; names: string[] }>;
      exports: string[];
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { metrics, structure, notes, path } = insight;

  // Check for large files
  if (
    (focus === "all" || focus === "complexity") &&
    metrics &&
    metrics.lines > 500
  ) {
    suggestions.push({
      type: "split_file",
      priority: metrics.lines > 1000 ? "high" : "medium",
      target: path,
      description: `File has ${metrics.lines} lines - consider splitting`,
      rationale:
        "Large files are harder to understand and maintain. They often contain multiple responsibilities.",
      suggestedAction:
        "Identify distinct responsibilities and extract them into separate modules.",
    });
  }

  // Check for too many symbols
  if (
    (focus === "all" || focus === "complexity") &&
    metrics &&
    metrics.symbols > 30
  ) {
    suggestions.push({
      type: "split_file",
      priority: "medium",
      target: path,
      description: `File defines ${metrics.symbols} symbols - may have too many responsibilities`,
      rationale:
        "Files with many symbols often violate single responsibility principle.",
      suggestedAction:
        "Group related symbols and move each group to its own module.",
    });
  }

  // Check for high import count (coupling)
  if (
    (focus === "all" || focus === "coupling") &&
    metrics &&
    metrics.imports > 15
  ) {
    suggestions.push({
      type: "reduce_coupling",
      priority: metrics.imports > 25 ? "high" : "medium",
      target: path,
      description: `File imports from ${metrics.imports} sources - high coupling`,
      rationale:
        "High import count indicates the module depends on many others, making it fragile to changes.",
      suggestedAction:
        "Consider introducing a facade or aggregating common imports.",
    });
  }

  // Check for unused exports
  if ((focus === "all" || focus === "unused") && notes) {
    if (notes.some((n) => n.includes("No exports"))) {
      suggestions.push({
        type: "remove_unused",
        priority: "low",
        target: path,
        description: "File has no exports - may be unused",
        rationale:
          "Files without exports are either entry points or potentially dead code.",
        suggestedAction:
          "Verify if this file is needed, or add exports if functionality should be reusable.",
      });
    }
  }

  // Check for long functions within the file
  if ((focus === "all" || focus === "complexity") && structure) {
    const functions = structure.symbols.filter(
      (s) => s.kind === "function" || s.kind === "method"
    );
    // We don't have line counts per function, but we can flag files with many functions
    if (functions.length > 20) {
      suggestions.push({
        type: "extract_function",
        priority: "medium",
        target: path,
        description: `File has ${functions.length} functions - consider grouping`,
        rationale:
          "Files with many functions can be hard to navigate. Related functions should be together.",
        suggestedAction:
          "Group related functions into separate modules or use a class to encapsulate related behavior.",
      });
    }
  }
}

function analyzeDirectory(
  insight: {
    path: string;
    metrics?: {
      lines: number;
      symbols: number;
      complexity: string;
    };
    structure?: {
      files: string[];
      subdirectories: string[];
      entryPoints: string[];
      keySymbols: Array<{ name: string; kind: string }>;
    };
    relationships?: {
      externalDeps: string[];
      internalDeps: string[];
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { metrics, structure, relationships, notes, path } = insight;

  // Check for missing entry point
  if ((focus === "all" || focus === "complexity") && structure) {
    if (structure.entryPoints.length === 0 && structure.files.length > 3) {
      suggestions.push({
        type: "simplify",
        priority: "medium",
        target: path,
        description: "Directory has no index/entry point file",
        rationale:
          "Entry points make it clear what a module exports and provide a clean public API.",
        suggestedAction:
          "Create an index.ts file that re-exports the public API of this module.",
      });
    }
  }

  // Check for too many files
  if (
    (focus === "all" || focus === "complexity") &&
    structure &&
    structure.files.length > 20
  ) {
    suggestions.push({
      type: "split_file",
      priority: "medium",
      target: path,
      description: `Directory has ${structure.files.length} files - consider reorganizing`,
      rationale:
        "Flat directories with many files are hard to navigate. Subdirectories add structure.",
      suggestedAction:
        "Group related files into subdirectories based on feature or responsibility.",
    });
  }

  // Check for high external dependencies
  if (
    (focus === "all" || focus === "coupling") &&
    relationships &&
    relationships.externalDeps.length > 20
  ) {
    suggestions.push({
      type: "reduce_coupling",
      priority: "medium",
      target: path,
      description: `Module depends on ${relationships.externalDeps.length} external packages`,
      rationale:
        "High external dependencies increase risk and maintenance burden.",
      suggestedAction:
        "Review if all dependencies are necessary. Consider alternatives or abstractions.",
    });
  }

  // Check high complexity from notes
  if ((focus === "all" || focus === "complexity") && notes) {
    if (notes.some((n) => n.includes("High complexity"))) {
      suggestions.push({
        type: "split_file",
        priority: "high",
        target: path,
        description: "Module has high complexity",
        rationale:
          "High complexity modules are harder to understand and modify safely.",
        suggestedAction:
          "Break down into smaller, focused modules with clear responsibilities.",
      });
    }
  }
}

function analyzeSymbol(
  insight: {
    name: string;
    kind: string;
    file: string;
    code?: string;
    relationships?: {
      calls: Array<{ symbol: { name: string }; line: number }>;
      calledBy: Array<{ symbol: { name: string }; line: number }>;
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { name, kind, file, code, relationships, notes } = insight;

  // Check for long functions
  if ((focus === "all" || focus === "complexity") && code) {
    const lines = code.split("\n").length;
    if (lines > 50) {
      suggestions.push({
        type: "extract_function",
        priority: lines > 100 ? "high" : "medium",
        target: `${name} in ${file}`,
        description: `${kind} has ${lines} lines - consider extracting smaller functions`,
        rationale:
          "Long functions are hard to understand and test. They often do multiple things.",
        suggestedAction:
          "Identify logical sections and extract them as separate helper functions.",
      });
    }
  }

  // Check for unused functions
  if (
    (focus === "all" || focus === "unused") &&
    notes &&
    kind === "function"
  ) {
    if (notes.some((n) => n.includes("Not called"))) {
      suggestions.push({
        type: "remove_unused",
        priority: "low",
        target: `${name} in ${file}`,
        description: `Function "${name}" is not called from indexed code`,
        rationale:
          "Unused code adds maintenance burden and can confuse developers.",
        suggestedAction:
          "Verify if this function is needed (may be an entry point or test utility). Remove if unused.",
      });
    }
  }

  // Check for high coupling (calls many functions)
  if (
    (focus === "all" || focus === "coupling") &&
    relationships &&
    relationships.calls.length > 10
  ) {
    suggestions.push({
      type: "reduce_coupling",
      priority: relationships.calls.length > 20 ? "high" : "medium",
      target: `${name} in ${file}`,
      description: `${kind} calls ${relationships.calls.length} other functions`,
      rationale:
        "Functions that call many others are often doing too much and are fragile to changes.",
      suggestedAction:
        "Break down the function or introduce intermediate abstractions.",
    });
  }

  // Check if heavily used
  if (
    (focus === "all" || focus === "coupling") &&
    notes &&
    relationships &&
    relationships.calledBy.length > 20
  ) {
    suggestions.push({
      type: "simplify",
      priority: "medium",
      target: `${name} in ${file}`,
      description: `${kind} is called from ${relationships.calledBy.length} places - heavily used`,
      rationale:
        "Heavily used code should be stable. Changes here have wide impact.",
      suggestedAction:
        "Ensure thorough test coverage. Consider if API could be simplified.",
    });
  }

  // Naming suggestions
  if (focus === "all" || focus === "naming") {
    if (name.length <= 2 && kind === "function") {
      suggestions.push({
        type: "rename",
        priority: "low",
        target: `${name} in ${file}`,
        description: `Function name "${name}" is very short`,
        rationale: "Short names can be unclear. Function names should describe what they do.",
        suggestedAction: "Consider a more descriptive name.",
      });
    }
  }
}

function generateSummary(suggestions: RefactoringSuggestion[]): string {
  if (suggestions.length === 0) {
    return "No significant refactoring opportunities found. Code looks good!";
  }

  const high = suggestions.filter((s) => s.priority === "high").length;
  const medium = suggestions.filter((s) => s.priority === "medium").length;
  const low = suggestions.filter((s) => s.priority === "low").length;

  const parts: string[] = [];
  if (high > 0) parts.push(`${high} high priority`);
  if (medium > 0) parts.push(`${medium} medium priority`);
  if (low > 0) parts.push(`${low} low priority`);

  return `Found ${suggestions.length} refactoring opportunities: ${parts.join(", ")}.`;
}

function formatAnalysis(analysis: RefactoringAnalysis): string {
  let output = `## Refactoring Analysis: ${analysis.target}\n\n`;

  // Metrics overview
  output += `### Code Health\n`;
  output += `- **Complexity:** ${analysis.metrics.complexity}\n`;
  output += `- **Maintainability:** ${analysis.metrics.maintainability}\n`;
  output += `- **Test Coverage:** ${analysis.metrics.testCoverage}\n\n`;

  // Summary
  output += `### Summary\n${analysis.summary}\n\n`;

  if (analysis.suggestions.length === 0) {
    output += "No refactoring suggestions at this time.\n";
    return output;
  }

  // Suggestions by priority
  output += `### Suggestions\n\n`;

  const highPriority = analysis.suggestions.filter(
    (s) => s.priority === "high"
  );
  const mediumPriority = analysis.suggestions.filter(
    (s) => s.priority === "medium"
  );
  const lowPriority = analysis.suggestions.filter((s) => s.priority === "low");

  if (highPriority.length > 0) {
    output += `#### 🔴 High Priority\n\n`;
    for (const s of highPriority) {
      output += formatSuggestion(s);
    }
  }

  if (mediumPriority.length > 0) {
    output += `#### 🟡 Medium Priority\n\n`;
    for (const s of mediumPriority) {
      output += formatSuggestion(s);
    }
  }

  if (lowPriority.length > 0) {
    output += `#### 🟢 Low Priority\n\n`;
    for (const s of lowPriority) {
      output += formatSuggestion(s);
    }
  }

  return output;
}

function formatSuggestion(s: RefactoringSuggestion): string {
  let output = `**${formatType(s.type)}:** ${s.description}\n`;
  output += `> ${s.rationale}\n`;
  if (s.suggestedAction) {
    output += `> 💡 *${s.suggestedAction}*\n`;
  }
  output += `\n`;
  return output;
}

function formatType(type: RefactoringSuggestion["type"]): string {
  const typeNames: Record<RefactoringSuggestion["type"], string> = {
    extract_function: "Extract Function",
    split_file: "Split Module",
    reduce_coupling: "Reduce Coupling",
    remove_unused: "Remove Unused",
    add_tests: "Add Tests",
    simplify: "Simplify",
    rename: "Rename",
  };
  return typeNames[type];
}
