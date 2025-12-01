/**
 * get_scripts tool - Get available scripts/commands.
 */

import { z } from "zod";
import type { ProjectService } from "../core/ProjectService.js";

export const getScriptsSchema = z.object({});

export async function getScripts(service: ProjectService): Promise<string> {
  const result = await service.getProjectInfo();

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const { scripts, type, name } = result.value;

  if (scripts.length === 0) {
    return "No scripts found in this project.";
  }

  const output: string[] = [
    `# Scripts: ${name}`,
    "",
  ];

  // Add run prefix based on project type
  let runPrefix = "";
  switch (type) {
    case "npm":
      runPrefix = "npm run ";
      break;
    case "cargo":
      runPrefix = "";
      break;
    case "python":
      runPrefix = "";
      break;
    case "go":
      runPrefix = "";
      break;
  }

  for (const script of scripts) {
    const runCmd = type === "npm" && script.name !== "install"
      ? `${runPrefix}${script.name}`
      : script.command;
    output.push(`## ${script.name}`);
    output.push(`\`\`\`bash`);
    output.push(runCmd);
    output.push(`\`\`\``);
    if (type === "npm") {
      output.push(`> ${script.command}`);
    }
    output.push("");
  }

  return output.join("\n");
}
