/**
 * board_list tool - List cards with filtering.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import type { Priority } from "../core/model.js";

interface ListInput {
  list?: string;
  priority?: Priority;
  labels?: string[];
  search?: string;
}

export const registerBoardList: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_list",
    {
      title: "List board cards",
      description: "List cards with optional filtering. Returns structured card data.",
      inputSchema: {
        list: z.string().optional().describe("Filter by list ID"),
        priority: z.enum(["low", "medium", "high", "critical"]).optional().describe("Filter by priority"),
        labels: z.array(z.string()).optional().describe("Filter by labels"),
        search: z.string().optional().describe("Search in title/description"),
      },
    },
    async (input: ListInput) => {
      const cards = service.getCards(input);
      const summary = service.getSummary();

      const result = {
        board: summary.name,
        lists: summary.lists,
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          list: c.list,
          priority: c.priority,
          labels: c.labels,
          description: c.description?.substring(0, 100),
        })),
        total: cards.length,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
};
