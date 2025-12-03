/**
 * board_get tool - Get full card details.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";

interface GetInput {
  id: string;
}

export const registerBoardGet: ToolRegistrar = (server, service) => {
  server.registerTool(
    "board_get",
    {
      title: "Get card",
      description: "Get full card details by ID.",
      inputSchema: {
        id: z.string().describe("Card ID"),
      },
    },
    async (input: GetInput) => {
      const result = service.getCard(input.id);

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
