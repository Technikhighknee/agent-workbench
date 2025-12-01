import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypeService } from "../core/ports/TypeService.js";

export function registerReload(server: McpServer, service: TypeService): void {
  server.registerTool(
    "reload",
    {
      title: "Reload TypeScript projects",
      description: `Re-discover and reload all TypeScript projects.

Use this when:
- New packages are added to a monorepo
- New tsconfig.json files are created
- You want to pick up new files without restarting

Returns the number of projects and files discovered.`,
      inputSchema: {},
    },
    async () => {
      const result = await service.reload();

      if (!result.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reloading: ${result.error.message}`,
            },
          ],
          isError: true,
        };
      }

      const info = result.value;
      return {
        content: [
          {
            type: "text" as const,
            text: `Reloaded TypeScript projects.\n\n` +
              `**Config**: ${info.configPath}\n` +
              `**Files**: ${info.fileCount}\n` +
              `**Root**: ${info.rootDir}`,
          },
        ],
      };
    }
  );
}
