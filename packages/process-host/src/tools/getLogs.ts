import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse, StreamValue } from "./types.js";
import { ProcessStatusSchema, StreamSchema, LogsOutputSchema } from "./schemas.js";

interface GetLogsInput {
  id: string;
  last_lines?: number;
  stream?: StreamValue;
}

interface GetLogsOutput extends Record<string, unknown> {
  id: string;
  status: string;
  exitCode: number | null;
  logs: string;
}

export const registerGetLogs: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_logs",
    {
      title: "Get process logs",
      description: `Get recent output from a process. Returns combined stdout+stderr by default.

Pro tips:
- Check status first - "exited" means it's done, "failed" means error
- Use stream filter to see only errors (stderr)
- Poll periodically to follow output`,
      inputSchema: {
        id: z.string().describe("Process session ID from start_process"),
        last_lines: z.number().optional().describe("Chunks to return (default: 100, max: 500)"),
        stream: StreamSchema.optional().describe("Filter: 'stdout' or 'stderr' only"),
      },
      outputSchema: LogsOutputSchema,
    },
    async (input: GetLogsInput): Promise<ToolResponse<GetLogsOutput>> => {
      const process = service.getProcess(input.id);
      const chunk = input.stream
        ? service.getLogsByStream(input.id, input.stream, input.last_lines ?? 100)
        : service.getLogs(input.id, input.last_lines ?? 100);

      const output: GetLogsOutput = {
        id: input.id,
        status: process?.status ?? "unknown",
        exitCode: process?.exitCode ?? null,
        logs: chunk?.logs ?? "",
      };

      const statusLine = process
        ? `[${process.status}${process.exitCode !== null ? `:${process.exitCode}` : ""}]`
        : "[unknown]";

      return {
        content: [{ type: "text", text: `${statusLine}\n${output.logs || "(no output)"}` }],
        structuredContent: output,
      };
    }
  );
};
