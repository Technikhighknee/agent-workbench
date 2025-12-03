import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BoardService } from "../src/core/BoardService.js";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("BoardService", () => {
  let service: BoardService;
  let testDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    testDir = join(tmpdir(), `board-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    service = new BoardService(testDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Lists", () => {
    it("returns default lists on new board", () => {
      const lists = service.getLists();
      expect(lists).toHaveLength(5);
      expect(lists.map(l => l.id)).toEqual(["backlog", "todo", "in_progress", "blocked", "done"]);
    });

    it("gets a list by ID", () => {
      const result = service.getList("todo");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("todo");
        expect(result.value.name).toBe("To Do");
      }
    });

    it("returns error for non-existent list", () => {
      const result = service.getList("nonexistent");
      expect(result.ok).toBe(false);
    });

    it("creates a new list", () => {
      const result = service.createList("review", "Review");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("review");
        expect(result.value.name).toBe("Review");
      }
      expect(service.getLists()).toHaveLength(6);
    });

    it("prevents duplicate list IDs", () => {
      const result = service.createList("todo", "Duplicate");
      expect(result.ok).toBe(false);
    });

    it("deletes a list and moves cards", () => {
      // Create a card in a custom list
      service.createList("custom", "Custom");
      service.createCard({ title: "Test", list: "custom" });

      const result = service.deleteList("custom");
      expect(result.ok).toBe(true);
      expect(service.getLists()).toHaveLength(5);

      // Card should be moved to first list
      const cards = service.getCards();
      expect(cards[0].list).not.toBe("custom");
    });

    it("prevents deleting the last list", () => {
      // Delete all but one list
      service.deleteList("todo");
      service.deleteList("in_progress");
      service.deleteList("blocked");
      service.deleteList("done");

      // Should not be able to delete the last one
      const result = service.deleteList("backlog");
      expect(result.ok).toBe(false);
    });
  });

  describe("Cards - CRUD", () => {
    it("creates a card with defaults", () => {
      const result = service.createCard({ title: "Test Card" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe("Test Card");
        expect(result.value.list).toBe("backlog");
        expect(result.value.priority).toBe("medium");
        expect(result.value.labels).toEqual([]);
        expect(result.value.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/); // timestamp-random format
      }
    });

    it("creates a card with all options", () => {
      const result = service.createCard({
        title: "Full Card",
        description: "A description",
        list: "todo",
        priority: "high",
        labels: ["bug", "urgent"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.title).toBe("Full Card");
        expect(result.value.description).toBe("A description");
        expect(result.value.list).toBe("todo");
        expect(result.value.priority).toBe("high");
        expect(result.value.labels).toEqual(["bug", "urgent"]);
      }
    });

    it("fails to create card in non-existent list", () => {
      const result = service.createCard({ title: "Test", list: "nonexistent" });
      expect(result.ok).toBe(false);
    });

    it("gets a card by ID", () => {
      const createResult = service.createCard({ title: "Test" });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const getResult = service.getCard(createResult.value.id);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.title).toBe("Test");
      }
    });

    it("returns error for non-existent card", () => {
      const result = service.getCard("nonexistent");
      expect(result.ok).toBe(false);
    });

    it("updates a card", () => {
      const createResult = service.createCard({ title: "Original" });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const updateResult = service.updateCard(createResult.value.id, {
        title: "Updated",
        priority: "critical",
      });
      expect(updateResult.ok).toBe(true);
      if (updateResult.ok) {
        expect(updateResult.value.title).toBe("Updated");
        expect(updateResult.value.priority).toBe("critical");
      }
    });

    it("fails to update non-existent card", () => {
      const result = service.updateCard("nonexistent", { title: "Test" });
      expect(result.ok).toBe(false);
    });

    it("fails to move card to non-existent list", () => {
      const createResult = service.createCard({ title: "Test" });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const result = service.updateCard(createResult.value.id, { list: "nonexistent" });
      expect(result.ok).toBe(false);
    });

    it("deletes a card", () => {
      const createResult = service.createCard({ title: "Test" });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const deleteResult = service.deleteCard(createResult.value.id);
      expect(deleteResult.ok).toBe(true);
      expect(service.getCards()).toHaveLength(0);
    });

    it("fails to delete non-existent card", () => {
      const result = service.deleteCard("nonexistent");
      expect(result.ok).toBe(false);
    });

    it("moves a card between lists", () => {
      const createResult = service.createCard({ title: "Test", list: "backlog" });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const moveResult = service.moveCard(createResult.value.id, "done");
      expect(moveResult.ok).toBe(true);
      if (moveResult.ok) {
        expect(moveResult.value.list).toBe("done");
      }
    });
  });

  describe("Cards - Filtering", () => {
    beforeEach(() => {
      service.createCard({ title: "Bug 1", list: "todo", priority: "high", labels: ["bug"] });
      service.createCard({ title: "Bug 2", list: "in_progress", priority: "critical", labels: ["bug", "urgent"] });
      service.createCard({ title: "Feature 1", list: "todo", priority: "medium", labels: ["feature"] });
      service.createCard({ title: "Feature 2", list: "done", priority: "low", labels: ["feature"] });
    });

    it("returns all cards without filter", () => {
      const cards = service.getCards();
      expect(cards).toHaveLength(4);
    });

    it("filters by list", () => {
      const cards = service.getCards({ list: "todo" });
      expect(cards).toHaveLength(2);
      expect(cards.every(c => c.list === "todo")).toBe(true);
    });

    it("filters by priority", () => {
      const cards = service.getCards({ priority: "high" });
      expect(cards).toHaveLength(1);
      expect(cards[0].title).toBe("Bug 1");
    });

    it("filters by labels", () => {
      const cards = service.getCards({ labels: ["bug"] });
      expect(cards).toHaveLength(2);
      expect(cards.every(c => c.labels.includes("bug"))).toBe(true);
    });

    it("filters by search", () => {
      const cards = service.getCards({ search: "feature" });
      expect(cards).toHaveLength(2);
      expect(cards.every(c => c.title.toLowerCase().includes("feature"))).toBe(true);
    });

    it("combines multiple filters", () => {
      const cards = service.getCards({ list: "todo", labels: ["bug"] });
      expect(cards).toHaveLength(1);
      expect(cards[0].title).toBe("Bug 1");
    });

    it("sorts by priority then date", () => {
      const cards = service.getCards();
      // Critical should be first, then high, medium, low
      expect(cards[0].priority).toBe("critical");
      expect(cards[1].priority).toBe("high");
    });
  });

  describe("Board Summary", () => {
    it("returns board summary with card counts", () => {
      service.createCard({ title: "Card 1", list: "todo" });
      service.createCard({ title: "Card 2", list: "todo" });
      service.createCard({ title: "Card 3", list: "done" });

      const summary = service.getSummary();
      expect(summary.name).toBe("Board");
      expect(summary.lists).toHaveLength(5);

      const todoList = summary.lists.find(l => l.id === "todo");
      expect(todoList?.cardCount).toBe(2);

      const doneList = summary.lists.find(l => l.id === "done");
      expect(doneList?.cardCount).toBe(1);
    });
  });

  describe("Persistence", () => {
    it("persists cards across service instances", () => {
      service.createCard({ title: "Persistent Card" });

      // Create new service instance pointing to same directory
      const service2 = new BoardService(testDir);
      const cards = service2.getCards();

      expect(cards).toHaveLength(1);
      expect(cards[0].title).toBe("Persistent Card");
    });

    it("persists lists across service instances", () => {
      service.createList("custom", "Custom List");

      const service2 = new BoardService(testDir);
      const lists = service2.getLists();

      expect(lists).toHaveLength(6);
      expect(lists.some(l => l.id === "custom")).toBe(true);
    });
  });

  describe("Reset", () => {
    it("resets board to defaults", () => {
      service.createCard({ title: "Card 1" });
      service.createCard({ title: "Card 2" });
      service.createList("custom", "Custom");

      service.reset();

      expect(service.getCards()).toHaveLength(0);
      expect(service.getLists()).toHaveLength(5);
    });
  });
});
