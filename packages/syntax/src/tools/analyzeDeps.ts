import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ProjectIndex } from "../core/services/ProjectIndex.js";
import { DependencyAnalysisSchema } from "./schemas.js";
import type { DependencyAnalysis } from "../core/model.js";

interface AnalyzeDepsOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
  analysis?: DependencyAnalysis;
}

type ToolResponse<T extends Record<string, unknown>> = {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: T;
};

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
      const result = await index.analyzeDependencies();

      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          structuredContent: { success: false, error: result.error },
        };
      }

      const analysis = result.value;
      const formatted = formatAnalysis(analysis);

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: {
          success: true,
          analysis,
        },
      };
    }
  );
}

function formatAnalysis(analysis: DependencyAnalysis): string {
  const lines: string[] = [];

  lines.push("# Dependency Analysis\n");
  lines.push(`- **Files analyzed:** ${analysis.totalFiles}`);
  lines.push(`- **Total imports:** ${analysis.totalImports}`);

  // Circular dependencies
  if (analysis.hasCircularDependencies) {
    lines.push(`\n## Circular Dependencies Found (${analysis.circularDependencies.length})\n`);
    for (const cycle of analysis.circularDependencies) {
      lines.push(`- ${cycle.cycle.join(" -> ")}`);
      lines.push(`  (${cycle.closingImport.from}:${cycle.closingImport.line} imports ${cycle.closingImport.to})`);
    }
  } else {
    lines.push("\n## No Circular Dependencies Found");
  }

  // Most dependent files
  if (analysis.highestDependencyCount.length > 0) {
    lines.push("\n## Files with Most Dependencies\n");
    for (const { file, count } of analysis.highestDependencyCount.slice(0, 5)) {
      if (count > 0) {
        lines.push(`- ${file}: ${count} imports`);
      }
    }
  }

  // Most imported files
  if (analysis.mostImported.length > 0) {
    lines.push("\n## Most Imported Files\n");
    for (const { file, count } of analysis.mostImported.slice(0, 5)) {
      if (count > 0) {
        lines.push(`- ${file}: imported by ${count} files`);
      }
    }
  }

  return lines.join("\n");
}
