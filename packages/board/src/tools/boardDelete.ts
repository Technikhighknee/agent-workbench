/**
 * board_delete tool - Remove card from board.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";

interface DeleteInput {
  id: string;
}

export const registerBoardDelete: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_delete",
    {
      title: "Delete card",
      description: "Remove card from board.",
      inputSchema: {
        id: z.string().describe("Card ID"),
      },
    },
    async (input: DeleteInput) => {
      const result = service.deleteCard(input.id);

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, id: input.id }) }],
      };
    }
  );
};
