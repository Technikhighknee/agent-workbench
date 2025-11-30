import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { startProcess, getLogs, stopProcess, Status } from "./processStore.js";

const server = new McpServer({
  name: "agent-workbench:process-host",
  version: "prototype",
});

// ------------------------- start_process -------------------------

server.registerTool(
  "start_process",
  {
    title: "Start process",
    description: "Start a long-running command (e.g. `npm run dev`).",
    inputSchema: {
      command: z.string(),
      cwd: z.string().optional(),
      label: z.string().optional(),
    },
    outputSchema: {
      id: z.string(),
      command: z.string(),
      label: z.string().optional(),
      status: z.enum(["running", "failed"] as const),
      startedAt: z.string(),
    },
  },
  async ({ command, cwd, label }) => {
    const session = startProcess(command, cwd, label);

    const output = {
      id: session.id,
      command: session.command,
      label: session.label,
      status: session.status as Extract<Status, "running" | "failed">,
      startedAt: session.startedAt,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output),
        },
      ],
      structuredContent: output,
    };
  }
);


server.registerTool(
  "get_logs",
  {
    title: "Get process logs",
    description: "Returns the last N log lines for a process session.",
    inputSchema: {
      id: z.string(),
      last_lines: z.number().optional(),
    },
    outputSchema: {
      id: z.string(),
      status: z.enum(["running", "exited", "failed", "unknown"]),
      logs: z.string(),
    },
  },
  async ({ id, last_lines }) => {
    const session = getLogs(id, last_lines ?? 100);

    const output =
      session ?? {
        id,
        status: "unknown",
        logs: "",
      };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  }
);


server.registerTool(
  "stop_process",
  {
    title: "Stop process",
    description: "Stops a running process by its session id.",
    inputSchema: {
      id: z.string(),
    },
    outputSchema: {
      id: z.string(),
      ok: z.boolean(),
    },
  },
  async ({ id }) => {
    const ok = stopProcess(id);

    const output = { id, ok };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output),
        },
      ],
      structuredContent: output,
    };
  }
);


const transport = new StdioServerTransport();
await server.connect(transport);
console.error("process-host MCP server running (stdio mode)");
