/**
 * board_add tool - Create a new card.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import type { Priority } from "../core/model.js";

interface AddInput {
  title: string;
  description?: string;
  list?: string;
  priority?: Priority;
  labels?: string[];
}

export const registerBoardAdd: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_add",
    {
      title: "Add card",
      description: "Create a new card. Returns the created card.",
      inputSchema: {
        title: z.string().describe("Card title"),
        description: z.string().optional().describe("Card description"),
        list: z.string().optional().default("backlog").describe("Target list"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium").describe("Priority"),
        labels: z.array(z.string()).optional().describe("Labels"),
      },
    },
    async (input: AddInput) => {
      const result = service.createCard(input);

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
