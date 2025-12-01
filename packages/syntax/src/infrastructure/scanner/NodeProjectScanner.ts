import fs from "node:fs";
import path from "node:path";
import { ProjectScanner } from "../../core/ports/ProjectScanner.js";
import { Result, Ok, Err } from "@agent-workbench/core";

// Common directories to always ignore
const ALWAYS_IGNORE = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  ".nyc_output",
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
  "env",
  ".env",
  "target", // Rust
  "vendor", // Go
  ".idea",
  ".vscode",
]);

// Common file patterns to ignore
const IGNORE_PATTERNS = [
  /\.min\.[jt]s$/,
  /\.bundle\.[jt]s$/,
  /\.d\.ts$/, // Type declarations (optional, might want to include)
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__/,
  /__mocks__/,
];

/**
 * Node.js implementation of ProjectScanner.
 * Recursively scans directories, respecting common ignore patterns.
 */
export class NodeProjectScanner implements ProjectScanner {
  private gitignorePatterns: RegExp[] = [];

  async scan(rootPath: string, extensions: string[]): Promise<Result<string[], Error>> {
    try {
      // Load .gitignore if present
      this.loadGitignore(rootPath);

      const files: string[] = [];
      const extSet = new Set(extensions.map((e) => e.toLowerCase()));

      await this.scanDirectory(rootPath, rootPath, extSet, files);

      return Ok(files);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  shouldIgnore(filePath: string): boolean {
    const parts = filePath.split(path.sep);

    // Check against always-ignore directories
    for (const part of parts) {
      if (ALWAYS_IGNORE.has(part)) {
        return true;
      }
    }

    // Check against ignore patterns
    for (const pattern of IGNORE_PATTERNS) {
      if (pattern.test(filePath)) {
        return true;
      }
    }

    // Check against gitignore patterns
    for (const pattern of this.gitignorePatterns) {
      if (pattern.test(filePath)) {
        return true;
      }
    }

    return false;
  }

  private async scanDirectory(
    rootPath: string,
    currentPath: string,
    extensions: Set<string>,
    results: string[]
  ): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (this.shouldIgnore(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await this.scanDirectory(rootPath, fullPath, extensions, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          results.push(relativePath);
        }
      }
    }
  }

  private loadGitignore(rootPath: string): void {
    this.gitignorePatterns = [];

    const gitignorePath = path.join(rootPath, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        // Convert gitignore pattern to regex (simplified)
        const pattern = this.gitignoreToRegex(trimmed);
        if (pattern) {
          this.gitignorePatterns.push(pattern);
        }
      }
    } catch {
      // Ignore gitignore parsing errors
    }
  }

  private gitignoreToRegex(pattern: string): RegExp | null {
    try {
      // Handle negation (we skip negated patterns for simplicity)
      if (pattern.startsWith("!")) {
        return null;
      }

      // Remove leading slash (means root-relative)
      let p = pattern.startsWith("/") ? pattern.slice(1) : pattern;

      // Escape special regex characters except * and ?
      p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");

      // Convert glob patterns
      p = p.replace(/\*\*/g, ".*");
      p = p.replace(/\*/g, "[^/]*");
      p = p.replace(/\?/g, ".");

      // Handle directory patterns (ending with /)
      if (p.endsWith("/")) {
        p = p.slice(0, -1) + "(?:/.*)?";
      }

      return new RegExp(`(^|/)${p}($|/)`);
    } catch {
      return null;
    }
  }
}
