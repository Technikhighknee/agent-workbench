/**
 * Git command executor.
 * Handles spawning git processes with timeout and error handling.
 */

import { spawn } from "node:child_process";

import { Result, err, ok } from "./model.js";

export class GitExecutor {
  constructor(private readonly rootPath: string) {}

  /**
   * Execute a git command and return stdout.
   */
  async exec(args: string[], timeoutMs: number = 30000): Promise<Result<string, string>> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, {
        cwd: this.rootPath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve(err(`git command timed out after ${timeoutMs}ms: git ${args.join(" ")}`));
        }
      }, timeoutMs);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(ok(stdout));
        } else {
          resolve(err(stderr.trim() || `git exited with code ${code}`));
        }
      });

      proc.on("error", (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        resolve(err(`Failed to spawn git: ${error.message}`));
      });
    });
  }

  /**
   * Get the root path of the git executor.
   */
  getRootPath(): string {
    return this.rootPath;
  }
}
