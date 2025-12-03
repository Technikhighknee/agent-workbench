/**
 * board_update tool - Update card properties.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import type { Priority } from "../core/model.js";

interface UpdateInput {
  id: string;
  title?: string;
  description?: string;
  list?: string;
  priority?: Priority;
  labels?: string[];
}

export const registerBoardUpdate: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_update",
    {
      title: "Update card",
      description: "Update card properties. Returns updated card.",
      inputSchema: {
        id: z.string().describe("Card ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        list: z.string().optional().describe("Move to list"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("New priority"),
        labels: z.array(z.string()).optional().describe("New labels"),
      },
    },
    async (input: UpdateInput) => {
      const { id, ...options } = input;
      const result = service.updateCard(id, options);

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result.value, null, 2) }],
      };
    }
  );
};
