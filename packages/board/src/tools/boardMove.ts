/**
 * board_move tool - Move card to different list.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";

interface MoveInput {
  id: string;
  list: string;
}

export const registerBoardMove: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_move",
    {
      title: "Move card",
      description: "Move card to different list. Returns updated card.",
      inputSchema: {
        id: z.string().describe("Card ID"),
        list: z.string().describe("Target list ID"),
      },
    },
    async (input: MoveInput) => {
      const result = service.moveCard(input.id, input.list);

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ moved: true, card: result.value }, null, 2),
        }],
      };
    }
  );
};
