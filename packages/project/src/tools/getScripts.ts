/**
 * get_scripts tool - Get available scripts/commands.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

export const registerGetScripts: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_scripts",
    {
      title: "Get scripts",
      description: "Get available scripts/commands that can be run in this project",
      inputSchema: {},
    },
    async () => {
      const result = await service.getProjectInfo();

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const { scripts, type, name } = result.value;

      if (scripts.length === 0) {
        return {
          content: [{ type: "text", text: "No scripts found in this project." }],
        };
      }

      const output: string[] = [`# Scripts: ${name}`, ""];

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
        const runCmd =
          type === "npm" && script.name !== "install"
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

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
