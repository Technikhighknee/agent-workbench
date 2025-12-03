/**
 * Task persistence layer.
 * Handles saving and loading tasks with atomic writes.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";

import type { Task } from "./model.js";

export class TaskPersistence {
  constructor(private readonly tasksFile: string) {}

  /**
   * Load tasks from JSON file.
   */
  load(): Map<string, Task> {
    try {
      if (!existsSync(this.tasksFile)) {
        return new Map();
      }
      const data = readFileSync(this.tasksFile, "utf-8");
      const tasks = JSON.parse(data) as Task[];
      return new Map(tasks.map((t) => [t.id, t]));
    } catch {
      console.error("[task-runner] Could not load tasks.json, starting fresh");
      return new Map();
    }
  }

  /**
   * Save tasks to JSON file (atomic write).
   */
  save(tasks: Map<string, Task>): void {
    const data = JSON.stringify(Array.from(tasks.values()), null, 2);
    const tmpFile = this.tasksFile + ".tmp";

    try {
      writeFileSync(tmpFile, data);
      renameSync(tmpFile, this.tasksFile); // Atomic on POSIX
    } catch (e) {
      console.error("[task-runner] Failed to save tasks:", e);
    }
  }
}
