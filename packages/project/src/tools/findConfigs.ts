/**
 * find_configs tool - Find configuration files in the project.
 */

import * as z from "zod/v4";
import type { ToolRegistrar } from "./types.js";

export const registerFindConfigs: ToolRegistrar = (server, service) => {
  server.registerTool(
    "find_configs",
    {
      title: "Find configs",
      description:
        "Find configuration files in the project (tsconfig, eslint, prettier, etc.)",
      inputSchema: {},
    },
    async () => {
      const result = await service.findConfigs();

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const configs = result.value;

      if (configs.length === 0) {
        return {
          content: [{ type: "text", text: "No configuration files found." }],
        };
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

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
