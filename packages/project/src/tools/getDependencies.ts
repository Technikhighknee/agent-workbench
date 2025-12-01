/**
 * get_dependencies tool - Get project dependencies.
 */

import { z } from "zod";
import type { ProjectService } from "../core/ProjectService.js";

export const getDependenciesSchema = z.object({
  type: z
    .enum(["all", "production", "development"])
    .default("all")
    .describe("Filter by dependency type"),
});

export type GetDependenciesInput = z.infer<typeof getDependenciesSchema>;

export async function getDependencies(
  service: ProjectService,
  input: GetDependenciesInput
): Promise<string> {
  const result = await service.getProjectInfo();

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  let { dependencies } = result.value;

  if (input.type !== "all") {
    dependencies = dependencies.filter((d) => d.type === input.type);
  }

  if (dependencies.length === 0) {
    return `No ${input.type} dependencies found.`;
  }

  const output: string[] = [
    `# Dependencies (${input.type})`,
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
    output.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)} (${deps.length})`);
    output.push("");
    for (const dep of deps.sort((a, b) => a.name.localeCompare(b.name))) {
      output.push(`- **${dep.name}**: ${dep.version}`);
    }
    output.push("");
  }

  return output.join("\n");
}
