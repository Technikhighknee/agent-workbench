import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";

interface PurgeProcessesInput {
  keep_running?: boolean;
  older_than_hours?: number;
}

interface PurgeProcessesOutput extends Record<string, unknown> {
  purged: number;
}

export const registerPurgeProcesses: ToolRegistrar = (server, service) => {
  server.registerTool(
    "purge_processes",
    {
      title: "Purge process history",
      description: `Clean up old process records and their logs from the database.

Use cases:
- Free up database space
- Clear cluttered history
- Remove sensitive command history

By default, keeps running processes. Use older_than_hours to only remove old entries.`,
      inputSchema: {
        keep_running: z.boolean().optional().describe("Keep running processes (default: true)"),
        older_than_hours: z.number().optional().describe("Only purge processes older than N hours"),
      },
      outputSchema: {
        purged: z.number(),
      },
    },
    async (input: PurgeProcessesInput): Promise<ToolResponse<PurgeProcessesOutput>> => {
      const olderThanMs = input.older_than_hours
        ? input.older_than_hours * 60 * 60 * 1000
        : undefined;

      const purged = service.purge({
        keepRunning: input.keep_running ?? true,
        olderThanMs,
      });

      const message = purged === 0
        ? "No processes to purge"
        : `Purged ${purged} process${purged === 1 ? "" : "es"}`;

      const lines = [message];
      const runningHint = formatRunningProcessesHint(service.listRunning());
      if (runningHint) lines.push(runningHint);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { purged },
      };
    }
  );
};
