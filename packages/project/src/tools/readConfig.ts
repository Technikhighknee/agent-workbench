/**
 * read_config tool - Read a configuration file.
 */

import { z } from "zod";
import type { ProjectService } from "../core/ProjectService.js";

export const readConfigSchema = z.object({
  path: z.string().describe("Path to the config file (relative or absolute)"),
});

export type ReadConfigInput = z.infer<typeof readConfigSchema>;

export async function readConfig(
  service: ProjectService,
  input: ReadConfigInput
): Promise<string> {
  const result = await service.readConfig(input.path);

  if (!result.ok) {
    return `Error: ${result.error}`;
  }

  const ext = input.path.split(".").pop()?.toLowerCase() || "";
  let lang = "";
  switch (ext) {
    case "json":
      lang = "json";
      break;
    case "js":
    case "mjs":
    case "cjs":
      lang = "javascript";
      break;
    case "ts":
    case "mts":
    case "cts":
      lang = "typescript";
      break;
    case "yml":
    case "yaml":
      lang = "yaml";
      break;
    case "toml":
      lang = "toml";
      break;
  }

  return [
    `# Config: ${input.path}`,
    "",
    "```" + lang,
    result.value,
    "```",
  ].join("\n");
}
