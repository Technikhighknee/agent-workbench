/**
 * get_project_info tool - Get basic project information.
 */

import { z } from "zod";
import type { ProjectService } from "../core/ProjectService.js";

export const getProjectInfoSchema = z.object({});

export async function getProjectInfo(service: ProjectService): Promise<string> {
  const result = await service.getProjectInfo();

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const info = result.value;

  const output: string[] = [
    `# Project: ${info.name}`,
    "",
    `**Type:** ${info.type}`,
    `**Version:** ${info.version}`,
  ];

  if (info.description) {
    output.push(`**Description:** ${info.description}`);
  }

  if (info.main) {
    output.push(`**Main:** ${info.main}`);
  }

  output.push(`**Root:** ${info.rootPath}`);
  output.push("");

  // Scripts
  if (info.scripts.length > 0) {
    output.push("## Available Scripts");
    output.push("");
    for (const script of info.scripts) {
      output.push(`- **${script.name}**: \`${script.command}\``);
    }
    output.push("");
  }

  // Dependencies summary
  if (info.dependencies.length > 0) {
    const prod = info.dependencies.filter((d) => d.type === "production");
    const dev = info.dependencies.filter((d) => d.type === "development");

    output.push("## Dependencies");
    output.push("");
    output.push(
      `- Production: ${prod.length} packages`
    );
    output.push(
      `- Development: ${dev.length} packages`
    );
    output.push("");
  }

  return output.join("\n");
}
