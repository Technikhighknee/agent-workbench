import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, ProcessListItem } from "./types.js";
import { ProcessListItemSchema } from "./schemas.js";

interface ListProcessesInput {
  running_only?: boolean;
}

interface ListProcessesOutput extends Record<string, unknown> {
  processes: ProcessListItem[];
}

export const registerListProcesses: ToolRegistrar = (server, service) => {
  server.registerTool(
    "list_processes",
    {
      title: "List processes",
      description: `List all process sessions. Shows historical processes too.

Use running_only=true to see only active processes you can interact with.`,
      inputSchema: {
        running_only: z.boolean().optional().describe("Only show running processes"),
      },
      outputSchema: {
        processes: z.array(ProcessListItemSchema),
      },
    },
    async (input: ListProcessesInput): Promise<ToolResponse<ListProcessesOutput>> => {
      const all = input.running_only ? service.listRunning() : service.listProcesses();

      const processes: ProcessListItem[] = all.map((p) => ({
        id: p.id,
        command: p.command,
        label: p.label,
        status: p.status,
        pid: p.pid,
        exitCode: p.exitCode ?? null,
        startedAt: p.startedAt,
        endedAt: p.endedAt ?? null,
      }));

      const summary =
        processes.length === 0
          ? "No processes"
          : processes
              .map((p) => {
                const name = p.label ?? p.command;
                const code = p.exitCode !== null ? `:${p.exitCode}` : "";
                return `[${p.status}${code}] ${name} (${p.id.slice(0, 8)}...)`;
              })
              .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { processes },
      };
    }
  );
};
