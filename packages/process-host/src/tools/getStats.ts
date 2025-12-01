import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";
import { formatRunningProcessesHint } from "./types.js";

interface GetStatsOutput extends Record<string, unknown> {
  total: number;
  running: number;
  exited: number;
  failed: number;
  stopped: number;
}

export const registerGetStats: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_stats",
    {
      title: "Get process statistics",
      description: `Get summary statistics about all tracked processes.

Returns counts by status:
- total: All processes ever tracked
- running: Currently active
- exited: Completed successfully (exit code 0)
- failed: Completed with errors (exit code != 0)
- stopped: Manually terminated`,
      inputSchema: {},
      outputSchema: {
        total: z.number(),
        running: z.number(),
        exited: z.number(),
        failed: z.number(),
        stopped: z.number(),
      },
    },
    async (): Promise<ToolResponse<GetStatsOutput>> => {
      const stats = service.getStats();

      const message = [
        `Total: ${stats.total}`,
        `Running: ${stats.running}`,
        `Exited: ${stats.exited}`,
        `Failed: ${stats.failed}`,
        `Stopped: ${stats.stopped}`,
      ].join(" | ");

      const lines = [message];
      if (stats.running > 0) {
        const runningHint = formatRunningProcessesHint(service.listRunning());
        if (runningHint) lines.push(runningHint);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: stats,
      };
    }
  );
};
