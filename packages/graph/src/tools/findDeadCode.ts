/**
 * graph_find_dead_code tool - Find functions that are never called.
 * Uses call graph analysis to identify unreachable code.
 */

import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GraphStore } from "../GraphStore.js";
import type { Node } from "../model.js";

interface DeadCodeResult {
  file: string;
  name: string;
  qualifiedName: string;
  kind: string;
  line: number;
  reason: string;
}

export function registerFindDeadCode(server: McpServer, store: GraphStore): void {
  server.registerTool(
    "graph_find_dead_code",
    {
      title: "Find dead code",
      description: `Find functions/methods that are never called from any exported entry point.

Uses call graph analysis to identify:
- Functions that are never called
- Methods that are never invoked
- Internal helpers that became orphaned after refactoring

The algorithm:
1. Identifies all exported symbols as entry points
2. Traces call chains forward from all entry points
3. Any function NOT reachable from an entry point is dead code

More thorough than find_unused_exports because it considers:
- Transitive call chains (A calls B calls C)
- Not just direct imports

Limitations:
- Doesn't detect unused code paths within functions
- Dynamic calls (computed method names) may not be tracked
- Test files are excluded from analysis`,
      inputSchema: {
        file_pattern: z
          .string()
          .optional()
          .describe("Only analyze files matching this pattern (e.g., 'src/**/*.ts')"),
        include_private: z
          .boolean()
          .optional()
          .describe("Include private class members in results (default: true)"),
      },
    },
    async (input: { file_pattern?: string; include_private?: boolean }) => {
      const { file_pattern, include_private = true } = input;

      if (store.isEmpty()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Graph not initialized. Call graph_initialize first.",
            },
          ],
        };
      }

      const allNodes = store.getAllNodes();

      // Filter nodes by pattern if provided
      let nodesToAnalyze = allNodes;
      if (file_pattern) {
        const regex = patternToRegex(file_pattern);
        nodesToAnalyze = allNodes.filter((n) => regex.test(n.file));
      }

      // Exclude test files
      nodesToAnalyze = nodesToAnalyze.filter(
        (n) =>
          !n.file.includes(".test.") &&
          !n.file.includes(".spec.") &&
          !n.file.includes("__tests__")
      );

      // Step 1: Find all entry points (exported symbols)
      const entryPoints = new Set<string>();
      for (const node of nodesToAnalyze) {
        if (node.isExported) {
          entryPoints.add(node.id);
        }
      }

      // Also add module-level code (functions at file scope that might be auto-executed)
      // This is a heuristic - we mark top-level non-function nodes as potential entry points
      for (const node of nodesToAnalyze) {
        if (node.kind === "module" || node.kind === "class") {
          entryPoints.add(node.id);
        }
      }

      // Step 2: Trace all reachable nodes from entry points
      const reachable = new Set<string>();

      const visit = (nodeId: string, visited: Set<string>) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        reachable.add(nodeId);

        // Get all callees (what this node calls)
        const callees = store.getCallees(nodeId);
        for (const callee of callees) {
          visit(callee.id, visited);
        }

        // Also follow "contains" edges (class -> methods)
        const allCallees = store.getCallees(nodeId, ["calls", "contains"]);
        for (const callee of allCallees) {
          visit(callee.id, visited);
        }
      };

      for (const entryId of entryPoints) {
        visit(entryId, new Set());
      }

      // Step 3: Find unreachable functions/methods
      const deadCode: DeadCodeResult[] = [];

      for (const node of nodesToAnalyze) {
        // Only check functions and methods
        if (!["function", "method"].includes(node.kind)) continue;

        // Skip if reachable
        if (reachable.has(node.id)) continue;

        // Skip private members if not requested
        if (!include_private && isPrivateMember(node)) continue;

        // Determine why it's dead
        const reason = determineReason(node, store);

        deadCode.push({
          file: node.file,
          name: node.name,
          qualifiedName: node.qualifiedName,
          kind: node.kind,
          line: node.line,
          reason,
        });
      }

      // Sort by file, then line
      deadCode.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
      });

      // Build output
      const lines: string[] = [
        `Found ${deadCode.length} potentially dead code item(s)`,
        `Analyzed ${nodesToAnalyze.length} symbols, ${entryPoints.size} entry points`,
        "",
      ];

      if (deadCode.length > 0) {
        lines.push("Dead code:");

        let currentFile = "";
        for (const item of deadCode) {
          if (item.file !== currentFile) {
            currentFile = item.file;
            lines.push(`\n  ${item.file}:`);
          }
          lines.push(`    Line ${item.line}: ${item.qualifiedName} [${item.kind}]`);
          lines.push(`      Reason: ${item.reason}`);
        }
      } else {
        lines.push("No dead code found - all functions are reachable from exports.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(escaped);
}

function isPrivateMember(node: Node): boolean {
  // Check for TypeScript private modifier or underscore prefix
  return node.name.startsWith("_") || node.name.startsWith("#");
}

function determineReason(node: Node, store: GraphStore): string {
  // Check if it has any callers at all
  const callers = store.getCallers(node.id);

  if (callers.length === 0) {
    if (node.isExported) {
      return "Exported but never imported or called";
    }
    return "Never called from anywhere";
  }

  // It has callers, but they're also dead
  const callerNames = callers.slice(0, 3).map((c) => c.name);
  const suffix = callers.length > 3 ? ` and ${callers.length - 3} more` : "";
  return `Only called by other dead code: ${callerNames.join(", ")}${suffix}`;
}
