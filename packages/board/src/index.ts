/**
 * Board package - A simple task board for AI agents.
 *
 * Provides MCP tools for managing tasks on a Trello-like board:
 * - board_list: List cards with filtering
 * - board_add: Create a new card
 * - board_update: Update card properties
 * - board_move: Move card to different list
 * - board_delete: Remove a card
 * - board_get: Get card details
 *
 * Data is stored in .board/board.json in the project root.
 */

export { BoardService } from "./core/BoardService.js";
export type {
  Board,
  Card,
  List,
  Priority,
  CreateCardOptions,
  UpdateCardOptions,
  CardFilter,
} from "./core/model.js";
export { createEmptyBoard, DEFAULT_LISTS } from "./core/model.js";
export { loadBoard, saveBoard, boardExists } from "./core/BoardStorage.js";
export { registerBoardTools } from "./tools/registerTools.js";
