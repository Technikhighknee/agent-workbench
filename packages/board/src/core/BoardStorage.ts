/**
 * Board storage - JSON file persistence.
 * Stores board data in .board/board.json in the project root.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Board } from "./model.js";
import { createEmptyBoard } from "./model.js";

const BOARD_DIR = ".board";
const BOARD_FILE = "board.json";

/**
 * Load board from disk.
 * Creates a new board if none exists.
 */
export function loadBoard(projectPath: string): Board {
  const boardPath = getBoardPath(projectPath);

  if (!existsSync(boardPath)) {
    const board = createEmptyBoard();
    saveBoard(projectPath, board);
    return board;
  }

  try {
    const content = readFileSync(boardPath, "utf-8");
    const board = JSON.parse(content) as Board;
    return migrateBoard(board);
  } catch {
    // Corrupted file, create new board
    const board = createEmptyBoard();
    saveBoard(projectPath, board);
    return board;
  }
}

/**
 * Save board to disk.
 * Writes atomically to prevent corruption.
 */
export function saveBoard(projectPath: string, board: Board): void {
  const boardDir = join(projectPath, BOARD_DIR);
  const boardPath = getBoardPath(projectPath);
  const tempPath = `${boardPath}.tmp`;

  // Ensure directory exists
  if (!existsSync(boardDir)) {
    mkdirSync(boardDir, { recursive: true });
  }

  // Write to temp file first
  const content = JSON.stringify(board, null, 2);
  writeFileSync(tempPath, content, "utf-8");

  // Rename atomically
  const { renameSync } = require("node:fs");
  renameSync(tempPath, boardPath);
}

/**
 * Check if a board exists.
 */
export function boardExists(projectPath: string): boolean {
  return existsSync(getBoardPath(projectPath));
}

/**
 * Get the path to the board file.
 */
export function getBoardPath(projectPath: string): string {
  return join(projectPath, BOARD_DIR, BOARD_FILE);
}

/**
 * Migrate board to latest version.
 */
function migrateBoard(board: Board): Board {
  // Version 1 is current, no migrations needed yet
  if (!board.version) {
    board.version = 1;
  }

  // Ensure all required fields exist
  if (!board.lists) {
    board.lists = [];
  }
  if (!board.cards) {
    board.cards = [];
  }
  if (!board.name) {
    board.name = "Board";
  }

  return board;
}
