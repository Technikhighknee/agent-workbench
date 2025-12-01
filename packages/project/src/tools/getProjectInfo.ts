/**
 * get_project_info tool - Get basic project information.
 */

import type { ToolRegistrar } from "./types.js";

export const registerGetProjectInfo: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_project_info",
    {
      title: "Get project info",
      description:
        "Get basic project information - name, type, version, available scripts. INSTEAD OF: Reading package.json directly.",
      inputSchema: {},
    },
    async () => {
      const result = await service.getProjectInfo();

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
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
        output.push(`- Production: ${prod.length} packages`);
        output.push(`- Development: ${dev.length} packages`);
        output.push("");
      }

      // Workspaces (monorepo)
      if (info.workspaces && info.workspaces.length > 0) {
        output.push("## Workspaces (Monorepo)");
        output.push("");
        for (const ws of info.workspaces) {
          const version = ws.version ? ` (${ws.version})` : "";
          output.push(`- **${ws.name}**${version}: \`${ws.path}\``);
        }
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
