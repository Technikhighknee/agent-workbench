import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import type { ToolResponse } from "./types.js";
import { DependencyAnalysisSchema } from "./schemas.js";
import type { DependencyAnalysis } from "../core/model.js";

interface AnalyzeDepsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  analysis?: DependencyAnalysis;
}

export function registerAnalyzeDeps(server: McpServer, index: ProjectIndex): void {
  server.registerTool(
    "analyze_deps",
    {
      title: "Analyze dependencies",
      description: `Analyze project dependencies and detect circular imports.

Returns:
- Total files and imports analyzed
- Files with most dependencies (imports)
- Most imported files (dependents)
- Circular dependency cycles with file paths

Use cases:
- Detect circular dependencies before they cause issues
- Find the most heavily-coupled modules
- Understand project structure and dependencies
- Plan refactoring to reduce coupling`,
      inputSchema: {},
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
        analysis: DependencyAnalysisSchema.optional(),
      },
    },
    async (): Promise<ToolResponse<AnalyzeDepsOutput>> => {
      if (index.isEmpty()) {
        return {
          content: [{ type: "text", text: "Error: No project indexed. Call index_project first." }],
          structuredContent: { success: false, error: "No project indexed" },
        };
      }

      const result = await index.analyzeDependencies();

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const analysis = result.value;

      const lines: string[] = [
        "# Dependency Analysis",
        "",
        `- Total files: ${analysis.totalFiles}`,
        `- Total imports: ${analysis.totalImports}`,
        "",
      ];

      // Most dependencies
      if (analysis.highestDependencyCount.length > 0) {
        lines.push("## Files with most dependencies");
        for (const { file, count } of analysis.highestDependencyCount.slice(0, 5)) {
          lines.push(`- ${file}: ${count} imports`);
        }
        lines.push("");
      }

      // Most imported
      if (analysis.mostImported.length > 0) {
        lines.push("## Most imported files");
        for (const { file, count } of analysis.mostImported.slice(0, 5)) {
          lines.push(`- ${file}: imported by ${count} files`);
        }
        lines.push("");
      }

      // Circular dependencies
      if (analysis.hasCircularDependencies) {
        lines.push(`## Circular Dependencies (${analysis.circularDependencies.length} found)`);
        for (const cycle of analysis.circularDependencies.slice(0, 5)) {
          lines.push(`- ${cycle.cycle.join(" -> ")}`);
          lines.push(`  Closing import: ${cycle.closingImport.from}:${cycle.closingImport.line} -> ${cycle.closingImport.to}`);
        }
        if (analysis.circularDependencies.length > 5) {
          lines.push(`... and ${analysis.circularDependencies.length - 5} more`);
        }
      } else {
        lines.push("No circular dependencies detected.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { success: true, analysis },
      };
    }
  );
}
