/**
 * Lock manager for single-instance guarantee.
 * Uses PID-based lock file with liveness checks.
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

import { isPidAlive } from "./processUtils.js";

export class LockManager {
  constructor(private readonly lockFile: string) {}

  /**
   * Acquire exclusive lock.
   * Throws if another instance is running.
   */
  acquire(): void {
    try {
      // Try to create lock file exclusively
      writeFileSync(this.lockFile, String(process.pid), { flag: "wx" });
    } catch {
      // Lock exists - check if owner is alive
      try {
        const ownerPid = parseInt(readFileSync(this.lockFile, "utf-8"), 10);
        if (isPidAlive(ownerPid)) {
          throw new Error(
            `Another task-runner instance is running (PID ${ownerPid})`
          );
        }
        // Owner dead, take over
        writeFileSync(this.lockFile, String(process.pid));
      } catch (e) {
        if (e instanceof Error && e.message.includes("Another task-runner")) {
          throw e;
        }
        // Can't read lock file, just overwrite
        writeFileSync(this.lockFile, String(process.pid));
      }
    }
  }

  /**
   * Release the lock.
   */
  release(): void {
    try {
      unlinkSync(this.lockFile);
    } catch {
      // Ignore
    }
  }
}
