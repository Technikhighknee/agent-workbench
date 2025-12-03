/**
 * Register all board MCP tools.
 * Designed for AI agents - structured output, minimal verbosity.
 */

import type { McpServer } from "@agent-workbench/core";
import type { BoardService } from "../core/BoardService.js";

import { registerBoardList } from "./boardList.js";
import { registerBoardAdd } from "./boardAdd.js";
import { registerBoardUpdate } from "./boardUpdate.js";
import { registerBoardMove } from "./boardMove.js";
import { registerBoardDelete } from "./boardDelete.js";
import { registerBoardGet } from "./boardGet.js";

export function registerBoardTools(server: McpServer, service: BoardService): void {
  registerBoardList(server, service);
  registerBoardAdd(server, service);
  registerBoardUpdate(server, service);
  registerBoardMove(server, service);
  registerBoardDelete(server, service);
  registerBoardGet(server, service);
}
