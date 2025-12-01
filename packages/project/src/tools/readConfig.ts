/**
 * read_config tool - Read a configuration file.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

interface ReadConfigInput {
  path: string;
}

export const registerReadConfig: ToolRegistrar = (server, service) => {
  server.registerTool(
    "read_config",
    {
      title: "Read config",
      description: "Read content of a specific configuration file",
      inputSchema: {
        path: z
          .string()
          .describe("Path to the config file (relative or absolute)"),
      },
    },
    async (input: ReadConfigInput) => {
      const result = await service.readConfig(input.path);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
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

      const output = [
        `# Config: ${input.path}`,
        "",
        "```" + lang,
        result.value,
        "```",
      ].join("\n");

      return { content: [{ type: "text", text: output }] };
    }
  );
};
