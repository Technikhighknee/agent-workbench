import * as z from "zod/v4";
import type { ToolRegistrar, ToolResponse } from "./types.js";

interface NotifyFileChangedInput {
  file: string;
  content?: string;
}

interface NotifyFileChangedOutput extends Record<string, unknown> {
  success: boolean;
  error?: string;
}

export const registerNotifyFileChanged: ToolRegistrar = (server, service) => {
  server.registerTool(
    "notify_file_changed",
    {
      title: "Notify file changed",
      description: `Notify the TypeScript service that a file has been modified.

Call this after editing a file to ensure subsequent diagnostic checks reflect the changes. If content is provided, it will be used; otherwise the file is re-read from disk.

Use cases:
- Update type checking after edits
- Sync in-memory state with disk
- Prepare for fresh diagnostic check`,
      inputSchema: {
        file: z.string().describe("Path to the changed file"),
        content: z.string().optional().describe("New file content (if not provided, file is re-read from disk)"),
      },
      outputSchema: {
        success: z.boolean(),
        error: z.string().optional(),
      },
    },
    async (input: NotifyFileChangedInput): Promise<ToolResponse<NotifyFileChangedOutput>> => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text", text: "Error: TypeScript service not initialized" }],
          structuredContent: { success: false, error: "Service not initialized" },
        };
      }

      service.notifyFileChanged(input.file, input.content);

      return {
        content: [{ type: "text", text: `File change registered: ${input.file}` }],
        structuredContent: { success: true },
      };
    }
  );
};
