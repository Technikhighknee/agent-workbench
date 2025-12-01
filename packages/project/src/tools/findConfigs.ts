/**
 * find_configs tool - Find configuration files in the project.
 */

import { z } from "zod";
import type { ProjectService } from "../core/ProjectService.js";

export const findConfigsSchema = z.object({});

export async function findConfigs(service: ProjectService): Promise<string> {
  const result = await service.findConfigs();

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const configs = result.value;

  if (configs.length === 0) {
    return "No configuration files found.";
  }

  const output: string[] = [
    `# Configuration Files`,
    "",
    `Found ${configs.length} config(s)`,
    "",
  ];

  // Group by type
  const byType = new Map<string, typeof configs>();
  for (const config of configs) {
    if (!byType.has(config.type)) {
      byType.set(config.type, []);
    }
    byType.get(config.type)!.push(config);
  }

  for (const [type, cfgs] of Array.from(byType.entries()).sort()) {
    output.push(`## ${type}`);
    for (const cfg of cfgs) {
      output.push(`- ${cfg.name}`);
    }
    output.push("");
  }

  return output.join("\n");
}
