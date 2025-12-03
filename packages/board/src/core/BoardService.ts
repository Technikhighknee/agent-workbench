/**
 * Board service - Core business logic for board operations.
 */

import type { Result } from "@agent-workbench/core";
import { Ok, Err } from "@agent-workbench/core";
import type {
  Board,
  Card,
  List,
  CreateCardOptions,
  UpdateCardOptions,
  CardFilter,
} from "./model.js";
import { generateCardId, DEFAULT_LISTS } from "./model.js";
import { loadBoard, saveBoard } from "./BoardStorage.js";

export class BoardService {
  private board: Board;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.board = loadBoard(projectPath);
  }

  /**
   * Get all lists.
   */
  getLists(): List[] {
    return [...this.board.lists].sort((a, b) => a.position - b.position);
  }

  /**
   * Get a list by ID.
   */
  getList(id: string): Result<List, string> {
    const list = this.board.lists.find((l) => l.id === id);
    if (!list) {
      return Err(`List not found: ${id}`);
    }
    return Ok(list);
  }

  /**
   * Create a new list.
   */
  createList(id: string, name: string): Result<List, string> {
    if (this.board.lists.some((l) => l.id === id)) {
      return Err(`List already exists: ${id}`);
    }

    const maxPosition = Math.max(...this.board.lists.map((l) => l.position), -1);
    const list: List = { id, name, position: maxPosition + 1 };

    this.board.lists.push(list);
    this.save();

    return Ok(list);
  }

  /**
   * Delete a list. Cards in the list are moved to the first list.
   */
  deleteList(id: string): Result<void, string> {
    const index = this.board.lists.findIndex((l) => l.id === id);
    if (index === -1) {
      return Err(`List not found: ${id}`);
    }

    if (this.board.lists.length === 1) {
      return Err("Cannot delete the last list");
    }

    // Move cards to first available list
    const targetList = this.board.lists.find((l) => l.id !== id);
    if (targetList) {
      for (const card of this.board.cards) {
        if (card.list === id) {
          card.list = targetList.id;
          card.updatedAt = new Date().toISOString();
        }
      }
    }

    this.board.lists.splice(index, 1);
    this.save();

    return Ok(undefined);
  }

  /**
   * Get all cards, optionally filtered.
   */
  getCards(filter?: CardFilter): Card[] {
    let cards = [...this.board.cards];

    if (filter) {
      if (filter.list) {
        cards = cards.filter((c) => c.list === filter.list);
      }
      if (filter.priority) {
        cards = cards.filter((c) => c.priority === filter.priority);
      }
      if (filter.labels && filter.labels.length > 0) {
        cards = cards.filter((c) =>
          filter.labels!.some((label) => c.labels.includes(label))
        );
      }
      if (filter.search) {
        const search = filter.search.toLowerCase();
        cards = cards.filter(
          (c) =>
            c.title.toLowerCase().includes(search) ||
            c.description?.toLowerCase().includes(search)
        );
      }
    }

    // Sort by priority (critical > high > medium > low), then by creation date
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return cards.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Get a card by ID.
   */
  getCard(id: string): Result<Card, string> {
    const card = this.board.cards.find((c) => c.id === id);
    if (!card) {
      return Err(`Card not found: ${id}`);
    }
    return Ok({ ...card });
  }

  /**
   * Create a new card.
   */
  createCard(options: CreateCardOptions): Result<Card, string> {
    const listId = options.list || "backlog";
    if (!this.board.lists.some((l) => l.id === listId)) {
      return Err(`List not found: ${listId}`);
    }

    const now = new Date().toISOString();
    const card: Card = {
      id: generateCardId(),
      title: options.title,
      description: options.description,
      list: listId,
      priority: options.priority || "medium",
      labels: options.labels || [],
      createdAt: now,
      updatedAt: now,
    };

    this.board.cards.push(card);
    this.save();

    return Ok(card);
  }

  /**
   * Update a card.
   */
  updateCard(id: string, options: UpdateCardOptions): Result<Card, string> {
    const card = this.board.cards.find((c) => c.id === id);
    if (!card) {
      return Err(`Card not found: ${id}`);
    }

    if (options.list !== undefined) {
      if (!this.board.lists.some((l) => l.id === options.list)) {
        return Err(`List not found: ${options.list}`);
      }
      card.list = options.list;
    }

    if (options.title !== undefined) {
      card.title = options.title;
    }
    if (options.description !== undefined) {
      card.description = options.description;
    }
    if (options.priority !== undefined) {
      card.priority = options.priority;
    }
    if (options.labels !== undefined) {
      card.labels = options.labels;
    }

    card.updatedAt = new Date().toISOString();
    this.save();

    return Ok({ ...card });
  }

  /**
   * Move a card to a different list.
   */
  moveCard(id: string, listId: string): Result<Card, string> {
    return this.updateCard(id, { list: listId });
  }

  /**
   * Delete a card.
   */
  deleteCard(id: string): Result<void, string> {
    const index = this.board.cards.findIndex((c) => c.id === id);
    if (index === -1) {
      return Err(`Card not found: ${id}`);
    }

    this.board.cards.splice(index, 1);
    this.save();

    return Ok(undefined);
  }

  /**
   * Get board summary.
   */
  getSummary(): { name: string; lists: { id: string; name: string; cardCount: number }[] } {
    return {
      name: this.board.name,
      lists: this.board.lists
        .sort((a, b) => a.position - b.position)
        .map((list) => ({
          id: list.id,
          name: list.name,
          cardCount: this.board.cards.filter((c) => c.list === list.id).length,
        })),
    };
  }

  /**
   * Reset board to defaults.
   */
  reset(): void {
    this.board = {
      name: "Board",
      lists: [...DEFAULT_LISTS],
      cards: [],
      version: 1,
    };
    this.save();
  }

  /**
   * Save board to disk.
   */
  private save(): void {
    saveBoard(this.projectPath, this.board);
  }
}
