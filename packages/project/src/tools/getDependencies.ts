/**
 * get_dependencies tool - Get project dependencies.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface GetDependenciesInput {
  type?: "all" | "production" | "development";
}

export const registerGetDependencies: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_dependencies",
    {
      title: "Get dependencies",
      description: "Get project dependencies (production, development, or all)",
      inputSchema: {
        type: z
          .enum(["all", "production", "development"])
          .default("all")
          .describe("Filter by dependency type"),
      },
    },
    async (input: GetDependenciesInput) => {
      const filterType = input.type ?? "all";
      const result = await service.getProjectInfo();

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      let { dependencies } = result.value;

      if (filterType !== "all") {
        dependencies = dependencies.filter((d) => d.type === filterType);
      }

      if (dependencies.length === 0) {
        return {
          content: [{ type: "text", text: `No ${filterType} dependencies found.` }],
        };
      }

      const output: string[] = [
        `# Dependencies (${filterType})`,
        "",
        `Found ${dependencies.length} packages`,
        "",
      ];

      // Group by type
      const byType = new Map<string, typeof dependencies>();
      for (const dep of dependencies) {
        if (!byType.has(dep.type)) {
          byType.set(dep.type, []);
        }
        byType.get(dep.type)!.push(dep);
      }

      for (const [type, deps] of byType) {
        output.push(
          `## ${type.charAt(0).toUpperCase() + type.slice(1)} (${deps.length})`
        );
        output.push("");
        for (const dep of deps.sort((a, b) => a.name.localeCompare(b.name))) {
          output.push(`- **${dep.name}**: ${dep.version}`);
        }
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
