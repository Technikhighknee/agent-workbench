import * as fs from "node:fs";
import * as path from "node:path";
import type { FileWatcher, FileWatchCallback, FileWatchEvent } from "../../core/ports/FileWatcher.js";
import type { ProjectScanner } from "../../core/ports/ProjectScanner.js";
import { Result, Ok, Err } from "@agent-workbench/core";

/**
 * Node.js implementation of FileWatcher using native fs.watch.
 * Uses recursive watching with debouncing for efficient updates.
 */
export class NodeFileWatcher implements FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private rootPath: string = "";
  private extensions: Set<string> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs = 100;

  constructor(private readonly scanner: ProjectScanner) {}

  watch(
    rootPath: string,
    extensions: string[],
    callback: FileWatchCallback
  ): Result<void, Error> {
    if (this.watcher) {
      this.stop();
    }

    this.rootPath = rootPath;
    this.extensions = new Set(extensions.map((e) => e.toLowerCase()));

    try {
      this.watcher = fs.watch(
        rootPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          // Normalize path separators
          const relativePath = filename.replace(/\\/g, "/");

          // Skip if not a watched extension
          const ext = path.extname(relativePath).toLowerCase();
          if (!this.extensions.has(ext)) return;

          // Skip ignored paths
          if (this.scanner.shouldIgnore(relativePath)) return;

          // Debounce rapid changes
          this.debounce(relativePath, () => {
            const fullPath = path.join(this.rootPath, relativePath);
            const event = this.determineEvent(fullPath, eventType);
            callback(event, relativePath);
          });
        }
      );

      this.watcher.on("error", (error) => {
        console.error("[syntax] Watch error:", error.message);
      });

      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  private determineEvent(fullPath: string, _eventType: string): FileWatchEvent {
    // fs.watch doesn't distinguish add/change/unlink well
    // We check if file exists to determine the event type
    try {
      if (fs.existsSync(fullPath)) {
        // Could be add or change, but we treat both as change for reindexing
        return "change";
      } else {
        return "unlink";
      }
    } catch {
      return "unlink";
    }
  }
}
