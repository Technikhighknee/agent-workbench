/**
 * Board model types.
 * Simple, focused types for agent task management.
 */

/**
 * Card priority levels.
 */
export type Priority = "low" | "medium" | "high" | "critical";

/**
 * A card on the board.
 */
export interface Card {
  /** Unique identifier */
  id: string;
  /** Card title */
  title: string;
  /** Optional description (markdown supported) */
  description?: string;
  /** Which list this card belongs to */
  list: string;
  /** Priority level */
  priority: Priority;
  /** Labels for categorization */
  labels: string[];
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

/**
 * A list (column) on the board.
 */
export interface List {
  /** List identifier (slug) */
  id: string;
  /** Display name */
  name: string;
  /** Position for ordering */
  position: number;
}

/**
 * The complete board state.
 */
export interface Board {
  /** Board name */
  name: string;
  /** Available lists */
  lists: List[];
  /** All cards */
  cards: Card[];
  /** Schema version for migrations */
  version: number;
}

/**
 * Options for creating a card.
 */
export interface CreateCardOptions {
  title: string;
  description?: string;
  list?: string;
  priority?: Priority;
  labels?: string[];
}

/**
 * Options for updating a card.
 */
export interface UpdateCardOptions {
  title?: string;
  description?: string;
  list?: string;
  priority?: Priority;
  labels?: string[];
}

/**
 * Options for filtering cards.
 */
export interface CardFilter {
  /** Filter by list */
  list?: string;
  /** Filter by label (cards with any of these labels) */
  labels?: string[];
  /** Filter by priority */
  priority?: Priority;
  /** Search in title and description */
  search?: string;
}

/**
 * Default lists for a new board.
 */
export const DEFAULT_LISTS: List[] = [
  { id: "backlog", name: "Backlog", position: 0 },
  { id: "todo", name: "To Do", position: 1 },
  { id: "in_progress", name: "In Progress", position: 2 },
  { id: "blocked", name: "Blocked", position: 3 },
  { id: "done", name: "Done", position: 4 },
];

/**
 * Create an empty board with default lists.
 */
export function createEmptyBoard(name = "Board"): Board {
  return {
    name,
    lists: [...DEFAULT_LISTS],
    cards: [],
    version: 1,
  };
}

/**
 * Generate a unique card ID.
 */
export function generateCardId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}
